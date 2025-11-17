# Per-Endpoint Rate Limiting (RFC-0010)

## Overview

Per-endpoint rate limiting provides fine-grained control over API request rates for different endpoints. This feature implements RFC-0010 and enhances the existing rate limiting infrastructure with endpoint-specific limits, burst allowance, and improved error messages.

## Features

- **Per-endpoint rate limits**: Configure different limits for different API endpoints
- **Burst allowance**: Allow brief spikes in traffic with token bucket strategy
- **Method-specific limits**: Apply different limits based on HTTP method (GET, POST, etc.)
- **Clear error messages**: Rate limit errors include retry-after headers and detailed messages
- **Isolated limits**: Each endpoint has its own rate limit counter, independent of others
- **Fallback to defaults**: Endpoints without specific configuration use the default rate limit

## Configuration

### Enabling Per-Endpoint Rate Limiting

Set the environment variable to enable per-endpoint rate limiting:

```bash
PER_ENDPOINT_RATE_LIMIT_ENABLED=1
```

When enabled, the per-endpoint rate limiter replaces the default API rate limiter. When disabled (default), the system uses the original global API rate limiter.

### Configuring Endpoint Limits

Endpoint-specific limits are configured in `apps/webapp/app/services/perEndpointRateLimit.server.ts`:

```typescript
const endpointRateLimits: EndpointMatcher[] = [
  {
    method: "POST",
    pattern: /^\/api\/v1\/tasks\/[^\/]+\/trigger$/,
    config: {
      limit: 100,        // Base limit: 100 requests
      window: "1m",      // Per 1 minute window
      burst: 20,         // Allow 20 extra requests in burst (total: 120)
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/runs$/,
    config: {
      limit: 1000,
      window: "1m",
      burst: 100,
    },
  },
];
```

### Configuration Options

Each endpoint matcher has the following properties:

- **method** (optional): HTTP method to match (e.g., "GET", "POST"). If omitted, matches all methods.
- **pattern**: Regular expression or string to match the request path
- **config.limit**: Base number of requests allowed in the time window
- **config.window**: Time window for the limit (e.g., "1m", "1h", "10s")
- **config.burst** (optional): Additional requests allowed for burst traffic

## Rate Limiting Strategies

### With Burst (Token Bucket)

When `burst` is specified, the system uses a token bucket strategy:

```typescript
{
  limit: 100,
  window: "1m",
  burst: 20,
}
```

This configuration:
- Allows 100 requests per minute (base limit)
- Plus 20 additional requests for burst traffic
- Total capacity: 120 requests
- Tokens refill at rate of 100 per minute

### Without Burst (Sliding Window)

When `burst` is not specified, the system uses a sliding window strategy:

```typescript
{
  limit: 1000,
  window: "1m",
}
```

This configuration:
- Allows exactly 1000 requests per minute
- Uses sliding window for smooth rate limiting

## Error Messages

When rate limit is exceeded, clients receive a 429 status code with detailed information:

```json
{
  "title": "Rate Limit Exceeded",
  "status": 429,
  "type": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429",
  "detail": "Rate limit exceeded for POST /api/v1/tasks/123/trigger. 0/100 requests remaining. Retry in 45 seconds.",
  "reset": 1704067200000,
  "limit": 100,
  "remaining": 0,
  "retryAfter": 45,
  "error": "Rate limit exceeded for POST /api/v1/tasks/123/trigger. 0/100 requests remaining. Retry in 45 seconds."
}
```

### Response Headers

All responses include rate limit headers:

- `x-ratelimit-limit`: Maximum number of requests allowed
- `x-ratelimit-remaining`: Number of requests remaining in current window
- `x-ratelimit-reset`: Timestamp when the rate limit resets
- `retry-after`: (on 429 errors) Seconds to wait before retrying

## Implementation Details

### File Structure

- **perEndpointRateLimitMiddleware.server.ts**: Core middleware implementation
- **perEndpointRateLimit.server.ts**: Configuration and endpoint-specific limits
- **env.server.ts**: Environment variable definitions
- **server.ts**: Middleware registration
- **entry.server.tsx**: Middleware exports

### How It Works

1. **Request matching**: Incoming requests are matched against endpoint patterns
2. **Limit selection**:
   - If an endpoint-specific limit matches, use that configuration
   - Otherwise, fall back to default limit (with organization override support)
3. **Rate limit check**: Check Redis for current usage
4. **Response**: Allow request or return 429 with retry information

### Per-Endpoint Isolation

Each endpoint maintains its own rate limit counter using a unique key:

```
{method}:{pattern}:{authToken}
```

This ensures that:
- Different endpoints don't share rate limit counters
- Users can hit different endpoints independently
- Exceeding limit on one endpoint doesn't affect others

## Testing

Run the test suite:

```bash
npm test -- perEndpointRateLimitMiddleware.test.ts
```

Tests cover:
- Per-endpoint rate limiting with different limits
- Burst allowance with token bucket strategy
- Method-specific rate limiting
- Rate limit isolation between endpoints
- Fallback to default limits
- Error messages with retry-after headers
- Whitelisted paths
- Per-user rate limiting

## Migration from Global Rate Limiting

### Gradual Rollout

1. **Test in development**: Enable per-endpoint rate limiting in dev/staging
2. **Monitor metrics**: Check rate limit rejection rates and patterns
3. **Tune limits**: Adjust endpoint-specific limits based on usage patterns
4. **Enable in production**: Set `PER_ENDPOINT_RATE_LIMIT_ENABLED=1` in production

### Backward Compatibility

- When disabled, the system uses the original global API rate limiter
- All existing rate limit features continue to work (JWT limits, org overrides, etc.)
- No breaking changes to API clients

## Adding New Endpoint Limits

To add a new endpoint-specific limit:

1. Open `apps/webapp/app/services/perEndpointRateLimit.server.ts`
2. Add a new matcher to the `endpointRateLimits` array:

```typescript
{
  method: "POST",
  pattern: /^\/api\/v1\/my-endpoint$/,
  config: {
    limit: 50,
    window: "1m",
    burst: 10,
  },
},
```

3. Deploy the change (no restart required, config is loaded on request)

## Monitoring

### Key Metrics to Track

- Rate limit rejection rate per endpoint
- Burst usage patterns
- Average requests per user per endpoint
- Peak traffic patterns per endpoint

### Logs

Enable logging with environment variables:

```bash
API_RATE_LIMIT_REQUEST_LOGS_ENABLED=1
API_RATE_LIMIT_REJECTION_LOGS_ENABLED=1
API_RATE_LIMIT_LIMITER_LOGS_ENABLED=1
```

## Troubleshooting

### High Rejection Rate

If an endpoint has high rejection rate:

1. Check if the limit is too low for legitimate usage
2. Consider increasing `burst` allowance
3. Analyze traffic patterns to optimize `window` duration
4. Consider implementing endpoint-specific pricing tiers

### Rate Limit Not Applied

If rate limiting isn't working:

1. Verify `PER_ENDPOINT_RATE_LIMIT_ENABLED=1` is set
2. Check Redis connection is working
3. Verify endpoint pattern matches the request path
4. Check if the path is in the `pathWhiteList`

### Different Limits for Different Users

Use the `limiterConfigOverride` function to apply organization-specific limits:

```typescript
limiterConfigOverride: async (authorizationValue) => {
  const authenticatedEnv = await authenticateAuthorizationHeader(authorizationValue);

  // Custom logic for different organizations
  if (authenticatedEnv.organization.tier === "premium") {
    return {
      type: "tokenBucket",
      refillRate: 500,
      interval: "1m",
      maxTokens: 1000,
    };
  }

  return undefined; // Use default
}
```

## Future Enhancements

Potential improvements from RFC-0010:

- [ ] Dashboard showing rate limit metrics per endpoint
- [ ] Dynamic rate limit adjustment based on system load
- [ ] Rate limit quotas with different time windows (daily, weekly)
- [ ] Custom error messages per endpoint
- [ ] Rate limit warnings (X-RateLimit-Warning header at 80% usage)
- [ ] Endpoint-specific rate limit overrides per organization

## References

- RFC-0010: API Rate Limiting Improvements
- [Upstash Rate Limit Documentation](https://upstash.com/docs/redis/sdks/ratelimit/overview)
- [HTTP Status 429 (Too Many Requests)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429)
