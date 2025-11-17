/**
 * Circuit Breaker Metrics
 *
 * Provides OpenTelemetry metrics for monitoring circuit breaker behavior:
 * - Circuit state (closed/open/half-open)
 * - Failure counts
 * - Latency tracking
 * - Open/close events
 */

import { Meter, Counter, Histogram, ObservableGauge } from "@opentelemetry/api";

export interface CircuitBreakerMetrics {
  /** Counter for total requests through the circuit breaker */
  requestsTotal: Counter;
  /** Counter for failures */
  failuresTotal: Counter;
  /** Counter for successful requests */
  successesTotal: Counter;
  /** Counter for rejected requests (circuit open) */
  rejectionsTotal: Counter;
  /** Counter for timeouts */
  timeoutsTotal: Counter;
  /** Counter for circuit open events */
  circuitOpenedTotal: Counter;
  /** Counter for circuit close events */
  circuitClosedTotal: Counter;
  /** Histogram for request latency */
  latencyHistogram: Histogram;
  /** Observable gauge for current circuit state (0=closed, 1=open, 2=half-open) */
  stateGauge: ObservableGauge;
}

export interface CircuitBreakerStateTracker {
  [key: string]: {
    state: "closed" | "open" | "half-open";
    failures: number;
    successes: number;
  };
}

/**
 * Create metrics for circuit breaker monitoring.
 *
 * @param meter - OpenTelemetry meter instance
 * @param stateTracker - Object to track circuit breaker states
 */
export function createCircuitBreakerMetrics(
  meter: Meter,
  stateTracker: CircuitBreakerStateTracker
): CircuitBreakerMetrics {
  const requestsTotal = meter.createCounter("circuit_breaker.requests.total", {
    description: "Total number of requests through circuit breaker",
    unit: "1",
  });

  const failuresTotal = meter.createCounter("circuit_breaker.failures.total", {
    description: "Total number of failed requests",
    unit: "1",
  });

  const successesTotal = meter.createCounter("circuit_breaker.successes.total", {
    description: "Total number of successful requests",
    unit: "1",
  });

  const rejectionsTotal = meter.createCounter("circuit_breaker.rejections.total", {
    description: "Total number of rejected requests (circuit open)",
    unit: "1",
  });

  const timeoutsTotal = meter.createCounter("circuit_breaker.timeouts.total", {
    description: "Total number of timed out requests",
    unit: "1",
  });

  const circuitOpenedTotal = meter.createCounter("circuit_breaker.opened.total", {
    description: "Total number of times circuit opened",
    unit: "1",
  });

  const circuitClosedTotal = meter.createCounter("circuit_breaker.closed.total", {
    description: "Total number of times circuit closed",
    unit: "1",
  });

  const latencyHistogram = meter.createHistogram("circuit_breaker.latency.ms", {
    description: "Latency of requests through circuit breaker",
    unit: "ms",
  });

  const stateGauge = meter.createObservableGauge("circuit_breaker.state", {
    description: "Current state of circuit breaker (0=closed, 1=open, 2=half-open)",
    unit: "1",
  });

  // Register callback to observe circuit breaker states
  meter.addBatchObservableCallback(
    (observableResult) => {
      for (const [service, tracker] of Object.entries(stateTracker)) {
        const stateValue =
          tracker.state === "closed" ? 0 : tracker.state === "open" ? 1 : 2;

        observableResult.observe(stateGauge, stateValue, {
          service,
          state: tracker.state,
        });
      }
    },
    [stateGauge]
  );

  return {
    requestsTotal,
    failuresTotal,
    successesTotal,
    rejectionsTotal,
    timeoutsTotal,
    circuitOpenedTotal,
    circuitClosedTotal,
    latencyHistogram,
    stateGauge,
  };
}

/**
 * Helper to convert circuit breaker state to numeric value for metrics
 */
export function stateToNumber(state: "closed" | "open" | "half-open"): number {
  switch (state) {
    case "closed":
      return 0;
    case "open":
      return 1;
    case "half-open":
      return 2;
    default:
      return -1;
  }
}
