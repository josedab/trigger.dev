/**
 * Circuit Breaker Configuration
 *
 * Defines configuration for different service types to control circuit breaker behavior.
 * Each service can have its own timeout, error threshold, and reset timeout.
 */

export interface CircuitBreakerConfig {
  /** Timeout in milliseconds before considering the operation failed */
  timeout: number;
  /** Percentage of errors (0-100) before opening the circuit */
  errorThresholdPercentage: number;
  /** Time in milliseconds to wait before attempting to close the circuit */
  resetTimeout: number;
  /** Minimum number of calls before error threshold is evaluated */
  volumeThreshold?: number;
  /** Enable/disable circuit breaker (useful for gradual rollout) */
  enabled?: boolean;
}

export type ServiceType =
  | "webhook-delivery"
  | "github-api"
  | "openai-api"
  | "external-api"
  | "slack-api"
  | "betterstack-api"
  | "default";

/**
 * Circuit breaker configurations per service type.
 *
 * These values are tuned based on:
 * - Expected service latency (timeout)
 * - Service reliability (errorThresholdPercentage)
 * - Recovery time expectations (resetTimeout)
 */
export const circuitBreakerConfigs: Record<ServiceType, CircuitBreakerConfig> = {
  "webhook-delivery": {
    timeout: 10000, // 10s - webhooks can be slow
    errorThresholdPercentage: 60, // More tolerant since user endpoints vary
    resetTimeout: 60000, // 1 minute before retry
    volumeThreshold: 5, // Need at least 5 calls to evaluate
    enabled: true,
  },
  "github-api": {
    timeout: 5000, // 5s - GitHub API is usually fast
    errorThresholdPercentage: 40, // Less tolerant, GitHub is reliable
    resetTimeout: 30000, // 30s before retry
    volumeThreshold: 3,
    enabled: true,
  },
  "openai-api": {
    timeout: 120000, // 2 minutes - AI calls can be very slow
    errorThresholdPercentage: 70, // More tolerant for AI services
    resetTimeout: 120000, // 2 minutes before retry
    volumeThreshold: 2,
    enabled: true,
  },
  "slack-api": {
    timeout: 8000, // 8s
    errorThresholdPercentage: 50,
    resetTimeout: 45000, // 45s before retry
    volumeThreshold: 3,
    enabled: true,
  },
  "betterstack-api": {
    timeout: 5000, // 5s
    errorThresholdPercentage: 50,
    resetTimeout: 30000, // 30s before retry
    volumeThreshold: 3,
    enabled: true,
  },
  "external-api": {
    timeout: 15000, // 15s - generic external services
    errorThresholdPercentage: 55,
    resetTimeout: 60000, // 1 minute before retry
    volumeThreshold: 5,
    enabled: true,
  },
  default: {
    timeout: 10000, // 10s default
    errorThresholdPercentage: 50,
    resetTimeout: 30000, // 30s before retry
    volumeThreshold: 5,
    enabled: true,
  },
};

/**
 * Get circuit breaker configuration for a service type.
 * Falls back to default config if service type not found.
 */
export function getCircuitBreakerConfig(
  serviceType: ServiceType | string
): CircuitBreakerConfig {
  const config =
    circuitBreakerConfigs[serviceType as ServiceType] || circuitBreakerConfigs.default;

  // Allow environment variable overrides
  const envEnabled = process.env[`CIRCUIT_BREAKER_${serviceType.toUpperCase().replace(/-/g, "_")}_ENABLED`];
  if (envEnabled !== undefined) {
    config.enabled = envEnabled === "true" || envEnabled === "1";
  }

  return config;
}
