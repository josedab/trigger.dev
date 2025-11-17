# RFC-0005: Implement Circuit Breaker Pattern

**Status:** Draft
**Priority:** P3 (Backlog)
**Effort:** 20 days
**Impact:** 3/5 (Medium - resilience improvement)

---

## Summary

Implement circuit breaker pattern for external service calls (webhooks, API integrations) to prevent cascade failures and improve system resilience.

---

## Motivation

### Current State

**No circuit breakers:**
- Failed external calls retry indefinitely
- Can overwhelm external services
- Cascade failures (one slow service affects all tasks)

**Example problem:**
```typescript
// Task calling slow/failing external API
task({
  run: async (payload) => {
    // If this API is down, we keep retrying
    const result = await fetch('https://slow-api.com/data');
    // Each retry takes 30s to timeout
    // With 3 retries: 90s wasted per task
  }
});
```

**Impact:**
- Wasted worker resources
- Delayed task execution
- Poor user experience (long wait times)

---

## Detailed Design

### Circuit Breaker States

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

**States:**
- **CLOSED:** Normal mode, requests pass through
- **OPEN:** Circuit "tripped", reject all requests immediately
- **HALF-OPEN:** Testing if service recovered

---

### Implementation

**Library:** `opossum` (popular Node.js circuit breaker)

```typescript
import CircuitBreaker from 'opossum';

// Create circuit breaker for external API
const breaker = new CircuitBreaker(externalAPICall, {
  timeout: 5000,           // 5s timeout
  errorThresholdPercentage: 50,  // Open after 50% errors
  resetTimeout: 30000      // Try again after 30s
});

// Usage in task
task({
  run: async (payload) => {
    try {
      const result = await breaker.fire(payload.url);
      return result;
    } catch (error) {
      if (error.message === 'Breaker is open') {
        // Service is down, fail fast
        throw new Error('External service unavailable');
      }
      throw error;
    }
  }
});
```

---

### Configuration Per Service

```typescript
// config/circuit-breakers.ts
export const circuitBreakers = {
  'webhook-delivery': {
    timeout: 10000,
    errorThresholdPercentage: 60,
    resetTimeout: 60000,
  },
  'github-api': {
    timeout: 5000,
    errorThresholdPercentage: 40,
    resetTimeout: 30000,
  },
  'openai-api': {
    timeout: 120000,  // AI calls can be slow
    errorThresholdPercentage: 70,
    resetTimeout: 120000,
  },
};
```

---

### Monitoring & Metrics

**Metrics to track:**
- Circuit state (closed/open/half-open)
- Failure rate
- Latency percentiles (p50, p95, p99)
- Open count (how many times circuit opened)

**Dashboard:**
```typescript
// Prometheus metrics
circuitBreakerState.set({ service: 'github-api' }, 0); // 0=closed, 1=open, 2=half-open
circuitBreakerFailures.inc({ service: 'github-api' });
circuitBreakerLatency.observe({ service: 'github-api' }, latency);
```

---

## Implementation Plan

### Phase 1: Infrastructure (Week 1)
**Days 1-2:** Add `opossum` library, create wrapper
**Days 3-5:** Integrate with OpenTelemetry, add metrics

### Phase 2: Integration (Week 2-3)
**Days 1-5:** Add circuit breakers to:
- Webhook delivery
- GitHub API calls
- External integrations
**Days 6-10:** Testing, monitoring setup

### Phase 3: Rollout (Week 4)
**Days 1-3:** Staging deployment, tuning thresholds
**Days 4-5:** Production rollout, monitoring

**Total:** 20 days (4 weeks)

---

## Success Criteria

- ✅ Circuit breakers on 10+ external services
- ✅ Mean time to detect failures: <30s
- ✅ Failed service recovery time: -60%
- ✅ Wasted retries on failed services: -80%

---

## Alternatives

**Alternative 1: Retry with exponential backoff (Current)**
- Pros: Simple, already implemented
- Cons: Wastes resources, slow to detect failures
- Verdict: Inadequate for resilience

**Alternative 2: Manual service health checks**
- Pros: Fine-grained control
- Cons: Requires manual configuration, slow reaction
- Verdict: Too manual

---

**Status:** Backlog (implement after test coverage & refactoring)
**Owner:** TBD
**Timeline:** Q2 2025
