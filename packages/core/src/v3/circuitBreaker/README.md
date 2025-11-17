# Circuit Breaker Pattern Implementation

This module implements the Circuit Breaker pattern for external service calls to prevent cascade failures and improve system resilience.

## Overview

The circuit breaker acts as a safety mechanism that:
- **Monitors** external service calls for failures
- **Opens** the circuit when failure threshold is reached (fail fast)
- **Tests** service recovery after a timeout period
- **Closes** the circuit when service recovers

## States

```
┌─────────┐
│ CLOSED  │ ◄─── Normal operation (all calls pass through)
└────┬────┘
     │ Failure threshold reached
     ▼
┌─────────┐
│  OPEN   │ ◄─── Fail fast (reject immediately)
└────┬────┘
     │ Timeout elapsed
     ▼
┌─────────┐
│HALF-OPEN│ ◄─── Test recovery (allow 1 request)
└────┬────┘
     │ Success → CLOSED
     │ Failure → OPEN
```

## Usage

### Basic Usage

```typescript
import { createCircuitBreaker } from "@trigger.dev/core/v3/circuitBreaker";

// Create a circuit breaker for an external API
const breaker = createCircuitBreaker({
  func: async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  },
  serviceName: "external-api",
});

// Use the circuit breaker
try {
  const data = await breaker.fire("https://api.example.com/data");
  console.log(data);
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    console.log("Service is down, circuit breaker is open");
  } else {
    console.error("Request failed:", error);
  }
}
```

### With OpenTelemetry Metrics

```typescript
import { createCircuitBreaker, CircuitBreakerOpenError } from "@trigger.dev/core/v3/circuitBreaker";
import { meter } from "~/v3/tracer.server";

const breaker = createCircuitBreaker({
  func: async (data: any) => {
    // Your API call
    return await someExternalAPI(data);
  },
  serviceName: "github-api",
  meter, // Pass OpenTelemetry meter for metrics
});
```

### Simplified API

```typescript
import { withCircuitBreaker } from "@trigger.dev/core/v3/circuitBreaker";

// Wrap any async function
const protectedFetch = withCircuitBreaker(
  async (url: string) => {
    const response = await fetch(url);
    return response.json();
  },
  "external-api",
  meter
);

const data = await protectedFetch("https://api.example.com/data");
```

## Configuration

### Service Types

Pre-configured service types with optimized settings:

- `webhook-delivery` - 10s timeout, 60% error threshold, 1min reset
- `github-api` - 5s timeout, 40% error threshold, 30s reset
- `openai-api` - 2min timeout, 70% error threshold, 2min reset
- `slack-api` - 8s timeout, 50% error threshold, 45s reset
- `betterstack-api` - 5s timeout, 50% error threshold, 30s reset
- `external-api` - 15s timeout, 55% error threshold, 1min reset
- `default` - 10s timeout, 50% error threshold, 30s reset

### Custom Configuration

```typescript
const breaker = createCircuitBreaker({
  func: myFunction,
  serviceName: "my-custom-service",
  config: {
    timeout: 5000, // 5 second timeout
    errorThresholdPercentage: 50, // Open after 50% errors
    resetTimeout: 30000, // Try again after 30 seconds
    volumeThreshold: 5, // Need at least 5 calls before evaluating
    enabled: true, // Enable/disable circuit breaker
  },
});
```

### Environment Variables

Override configuration per service:

```bash
# Disable circuit breaker for a specific service
CIRCUIT_BREAKER_GITHUB_API_ENABLED=false

# Enable for webhook delivery
CIRCUIT_BREAKER_WEBHOOK_DELIVERY_ENABLED=true
```

## Metrics

When OpenTelemetry meter is provided, the following metrics are collected:

### Counters
- `circuit_breaker.requests.total` - Total requests through circuit breaker
- `circuit_breaker.failures.total` - Total failed requests
- `circuit_breaker.successes.total` - Total successful requests
- `circuit_breaker.rejections.total` - Rejected requests (circuit open)
- `circuit_breaker.timeouts.total` - Timed out requests
- `circuit_breaker.opened.total` - Times circuit opened
- `circuit_breaker.closed.total` - Times circuit closed

### Histogram
- `circuit_breaker.latency.ms` - Request latency distribution

### Gauge
- `circuit_breaker.state` - Current circuit state (0=closed, 1=open, 2=half-open)

All metrics include a `service` label with the service name.

## Integration Examples

### Webhook Delivery

```typescript
const webhookBreaker = createCircuitBreaker({
  func: async (options: { url: string; body: string; headers: Record<string, string> }) => {
    const response = await fetch(options.url, {
      method: "POST",
      headers: options.headers,
      body: options.body,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    return response;
  },
  serviceName: "webhook-delivery",
  meter,
});

// Use it
await webhookBreaker.fire({
  url: "https://webhook.example.com",
  body: JSON.stringify({ event: "test" }),
  headers: { "Content-Type": "application/json" },
});
```

### GitHub API

```typescript
const githubBreaker = createCircuitBreaker({
  func: async <T>(operation: () => Promise<T>) => {
    return await operation();
  },
  serviceName: "github-api",
  meter,
});

// Use it
await githubBreaker.fire(async () => {
  const octokit = await getOctokit();
  return await octokit.rest.repos.get({ owner, repo });
});
```

## Error Handling

### CircuitBreakerOpenError

When the circuit is open, requests are rejected immediately with `CircuitBreakerOpenError`:

```typescript
try {
  await breaker.fire(data);
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    // Circuit is open, service is down
    // Handle gracefully or return cached data
    console.log(`Circuit open for ${error.serviceName}`);
  } else {
    // Normal error, retry or handle
    throw error;
  }
}
```

## Statistics

Get circuit breaker statistics:

```typescript
import { getCircuitBreakerStats, getAllCircuitBreakerStats } from "@trigger.dev/core/v3/circuitBreaker";

// Get stats for a specific service
const stats = getCircuitBreakerStats("github-api");
console.log(stats);
// { state: "closed", failures: 2, successes: 98 }

// Get all stats
const allStats = getAllCircuitBreakerStats();
console.log(allStats);
// {
//   "github-api": { state: "closed", failures: 2, successes: 98 },
//   "webhook-delivery": { state: "open", failures: 15, successes: 5 }
// }
```

## Benefits

1. **Fail Fast**: Stop wasting resources on failing services
2. **Cascade Prevention**: Prevent failures from spreading to other services
3. **Automatic Recovery**: Test service recovery automatically
4. **Resource Protection**: Reduce load on failing external services
5. **Observability**: Comprehensive metrics for monitoring
6. **Configurable**: Per-service configuration for optimal behavior

## Best Practices

1. **Use appropriate timeouts**: Set timeouts based on expected service latency
2. **Tune error thresholds**: Balance between sensitivity and tolerance
3. **Monitor metrics**: Watch circuit state changes and rejection rates
4. **Handle CircuitBreakerOpenError**: Provide graceful degradation
5. **Test configurations**: Verify settings in staging before production
6. **Enable selectively**: Use environment variables for gradual rollout

## References

- [Martin Fowler - Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Opossum Documentation](https://nodeshift.dev/opossum/)
- RFC-0005: Circuit Breaker Implementation
