# RFC-0010: API Rate Limiting Improvements

**Status:** Draft
**Priority:** P3 (Backlog)
**Effort:** 8 days
**Impact:** 2/5 (Low - current solution works)

---

## Summary

Enhance API rate limiting with per-endpoint limits, burst allowance, and better error messages.

---

## Motivation

**Current state:**
- Basic rate limiting with `@upstash/ratelimit`
- Global limit: 1000 req/min per API key
- No per-endpoint limits
- Generic error messages

**Desired:**
- Per-endpoint limits (e.g., trigger: 100/min, list runs: 1000/min)
- Burst allowance (allow brief spikes)
- Clear error messages with retry-after headers

---

## Detailed Design

### Per-Endpoint Configuration

```typescript
// config/rate-limits.ts
export const rateLimits = {
  'POST /api/v1/tasks/:id/trigger': {
    limit: 100,
    window: '1m',
    burst: 20,  // Allow 20 extra requests in burst
  },
  'GET /api/v1/runs': {
    limit: 1000,
    window: '1m',
    burst: 100,
  },
  'GET /api/v1/runs/:id': {
    limit: 5000,
    window: '1m',
  },
};
```

### Middleware Implementation

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function rateLimit(
  request: Request,
  endpoint: string
) {
  const config = rateLimits[endpoint];
  const apiKey = getApiKey(request);

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    analytics: true,
  });

  const { success, limit, remaining, reset } = await limiter.limit(
    `${endpoint}:${apiKey}`
  );

  if (!success) {
    throw json({
      error: 'Rate limit exceeded',
      limit,
      remaining: 0,
      reset,
      retryAfter: Math.ceil((reset - Date.now()) / 1000),
    }, {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(reset),
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
      },
    });
  }

  return {
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(reset),
    },
  };
}
```

### Usage

```typescript
export async function action({ request, params }: ActionArgs) {
  // Apply rate limit
  const rateLimitHeaders = await rateLimit(
    request,
    'POST /api/v1/tasks/:id/trigger'
  );

  // Process request
  const run = await triggerTask(params.id, await request.json());

  return json({ run }, { headers: rateLimitHeaders });
}
```

---

## Implementation Plan

### Week 1: Infrastructure
- Design rate limit config
- Implement middleware
- Add tests

### Week 2: Rollout
- Apply to all endpoints
- Monitor impact
- Tune limits based on usage

**Effort:** 8 days

---

## Success Criteria

- ✅ Per-endpoint rate limits configured
- ✅ Clear error messages with retry-after
- ✅ Burst allowance prevents false positives
- ✅ Dashboard shows rate limit metrics

---

**Status:** Backlog (Q2)
**Owner:** TBD
