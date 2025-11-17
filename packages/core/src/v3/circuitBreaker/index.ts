/**
 * Circuit Breaker Implementation
 *
 * Provides a circuit breaker pattern implementation using the opossum library.
 * Circuit breakers prevent cascade failures by failing fast when external services are down.
 *
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Circuit tripped, reject all requests immediately
 * - HALF-OPEN: Testing if service recovered, allow limited requests
 *
 * Usage:
 * ```typescript
 * const breaker = createCircuitBreaker(
 *   async (url: string) => fetch(url),
 *   'github-api'
 * );
 *
 * try {
 *   const result = await breaker.fire('https://api.github.com/user');
 * } catch (error) {
 *   if (error.message === 'Breaker is open') {
 *     // Service is down, handle gracefully
 *   }
 * }
 * ```
 */

import CircuitBreaker from "opossum";
import type { Meter } from "@opentelemetry/api";
import {
  getCircuitBreakerConfig,
  type ServiceType,
  type CircuitBreakerConfig,
} from "./config.js";
import {
  createCircuitBreakerMetrics,
  type CircuitBreakerMetrics,
  type CircuitBreakerStateTracker,
} from "./metrics.js";

/**
 * Circuit breaker error that indicates the circuit is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(public readonly serviceName: string) {
    super(`Circuit breaker is open for service: ${serviceName}`);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Options for creating a circuit breaker
 */
export interface CreateCircuitBreakerOptions<T extends any[], R> {
  /** Function to wrap with circuit breaker */
  func: (...args: T) => Promise<R>;
  /** Service type or name for configuration and metrics */
  serviceName: ServiceType | string;
  /** Optional: Override default configuration */
  config?: Partial<CircuitBreakerConfig>;
  /** Optional: OpenTelemetry meter for metrics */
  meter?: Meter;
  /** Optional: Fallback function when circuit is open */
  fallback?: (...args: T) => Promise<R>;
}

/**
 * Global state tracker for circuit breakers (used by metrics)
 */
const globalStateTracker: CircuitBreakerStateTracker = {};

/**
 * Global metrics instance (initialized when meter is provided)
 */
let globalMetrics: CircuitBreakerMetrics | null = null;

/**
 * Create a circuit breaker for an async function.
 *
 * @param options - Configuration options
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker<T extends any[], R>(
  options: CreateCircuitBreakerOptions<T, R>
): CircuitBreaker<T, R> {
  const { func, serviceName, config: configOverride, meter, fallback } = options;

  // Get configuration
  const baseConfig = getCircuitBreakerConfig(serviceName);
  const config = { ...baseConfig, ...configOverride };

  // Check if circuit breaker is enabled
  if (!config.enabled) {
    // Return a pass-through "breaker" that just calls the function
    return {
      fire: func,
      fallback: fallback || ((() => {}) as any),
      on: () => {},
      off: () => {},
      stats: {
        failures: 0,
        successes: 0,
        rejects: 0,
        fires: 0,
      },
    } as any;
  }

  // Initialize metrics if meter provided and not already initialized
  if (meter && !globalMetrics) {
    globalMetrics = createCircuitBreakerMetrics(meter, globalStateTracker);
  }

  // Initialize state tracker for this service
  if (!globalStateTracker[serviceName]) {
    globalStateTracker[serviceName] = {
      state: "closed",
      failures: 0,
      successes: 0,
    };
  }

  // Create circuit breaker with opossum
  const breaker = new CircuitBreaker<T, R>(func, {
    timeout: config.timeout,
    errorThresholdPercentage: config.errorThresholdPercentage,
    resetTimeout: config.resetTimeout,
    volumeThreshold: config.volumeThreshold,
    name: serviceName,
  });

  // Set up fallback if provided
  if (fallback) {
    breaker.fallback(fallback);
  }

  // Set up event listeners for state changes and metrics
  setupCircuitBreakerEvents(breaker, serviceName, globalMetrics);

  return breaker;
}

/**
 * Set up event listeners for circuit breaker monitoring and metrics.
 */
function setupCircuitBreakerEvents<T extends any[], R>(
  breaker: CircuitBreaker<T, R>,
  serviceName: string,
  metrics: CircuitBreakerMetrics | null
): void {
  const tracker = globalStateTracker[serviceName];

  // Track successful requests
  breaker.on("success", (result, latency) => {
    tracker.successes++;
    tracker.state = "closed";

    if (metrics) {
      metrics.successesTotal.add(1, { service: serviceName });
      metrics.latencyHistogram.record(latency, { service: serviceName, status: "success" });
    }
  });

  // Track failures
  breaker.on("failure", (error) => {
    tracker.failures++;

    if (metrics) {
      metrics.failuresTotal.add(1, {
        service: serviceName,
        error_type: error?.name || "unknown",
      });
    }
  });

  // Track timeouts
  breaker.on("timeout", () => {
    tracker.failures++;

    if (metrics) {
      metrics.timeoutsTotal.add(1, { service: serviceName });
      metrics.failuresTotal.add(1, { service: serviceName, error_type: "timeout" });
    }
  });

  // Track rejected requests (circuit is open)
  breaker.on("reject", () => {
    if (metrics) {
      metrics.rejectionsTotal.add(1, { service: serviceName });
    }
  });

  // Track circuit opening
  breaker.on("open", () => {
    tracker.state = "open";

    if (metrics) {
      metrics.circuitOpenedTotal.add(1, { service: serviceName });
    }
  });

  // Track circuit closing
  breaker.on("close", () => {
    tracker.state = "closed";

    if (metrics) {
      metrics.circuitClosedTotal.add(1, { service: serviceName });
    }
  });

  // Track half-open state
  breaker.on("halfOpen", () => {
    tracker.state = "half-open";
  });

  // Track all fires
  breaker.on("fire", () => {
    if (metrics) {
      metrics.requestsTotal.add(1, { service: serviceName });
    }
  });
}

/**
 * Wrap a function with a circuit breaker (simplified API).
 *
 * @param func - Function to wrap
 * @param serviceName - Service name for configuration
 * @param meter - Optional OpenTelemetry meter
 * @returns Wrapped function with circuit breaker
 */
export function withCircuitBreaker<T extends any[], R>(
  func: (...args: T) => Promise<R>,
  serviceName: ServiceType | string,
  meter?: Meter
): (...args: T) => Promise<R> {
  const breaker = createCircuitBreaker({
    func,
    serviceName,
    meter,
  });

  return async (...args: T): Promise<R> => {
    try {
      return await breaker.fire(...args);
    } catch (error) {
      // Convert opossum's "Breaker is open" error to our custom error
      if (error instanceof Error && error.message.includes("Breaker is open")) {
        throw new CircuitBreakerOpenError(serviceName);
      }
      throw error;
    }
  };
}

/**
 * Get circuit breaker statistics for a service.
 */
export function getCircuitBreakerStats(serviceName: string) {
  return globalStateTracker[serviceName] || null;
}

/**
 * Get all circuit breaker statistics.
 */
export function getAllCircuitBreakerStats() {
  return { ...globalStateTracker };
}

// Re-export types and utilities
export { CircuitBreakerConfig, ServiceType, getCircuitBreakerConfig } from "./config.js";
export { CircuitBreakerMetrics, createCircuitBreakerMetrics } from "./metrics.js";
export type { CircuitBreakerStateTracker };
