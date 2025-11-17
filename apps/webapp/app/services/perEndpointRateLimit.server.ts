import { env } from "~/env.server";
import { authenticateAuthorizationHeader } from "./apiAuth.server";
import {
  perEndpointRateLimitMiddleware,
  EndpointMatcher,
} from "./perEndpointRateLimitMiddleware.server";
import { Duration } from "./rateLimiter.server";

// Per-endpoint rate limit configurations as specified in RFC-0010
// These limits apply to specific endpoints and override the default API rate limit
const endpointRateLimits: EndpointMatcher[] = [
  // Task trigger endpoint: 100 requests/minute with burst allowance of 20
  {
    method: "POST",
    pattern: /^\/api\/v1\/tasks\/[^\/]+\/trigger$/,
    config: {
      limit: 100,
      window: "1m",
      burst: 20,
    },
  },
  // List runs endpoint: 1000 requests/minute with burst allowance of 100
  {
    method: "GET",
    pattern: /^\/api\/v1\/runs$/,
    config: {
      limit: 1000,
      window: "1m",
      burst: 100,
    },
  },
  // Get specific run endpoint: 5000 requests/minute (no burst specified)
  {
    method: "GET",
    pattern: /^\/api\/v1\/runs\/[^\/]+$/,
    config: {
      limit: 5000,
      window: "1m",
    },
  },
  // Additional high-traffic read endpoints with higher limits
  {
    method: "GET",
    pattern: /^\/api\/v1\/projects\/[^\/]+\/runs$/,
    config: {
      limit: 1000,
      window: "1m",
      burst: 100,
    },
  },
  // Batch operations have lower limits due to their impact
  {
    method: "POST",
    pattern: /^\/api\/v1\/tasks\/batch$/,
    config: {
      limit: 50,
      window: "1m",
      burst: 10,
    },
  },
];

export const perEndpointApiRateLimiter = perEndpointRateLimitMiddleware({
  redis: {
    port: env.RATE_LIMIT_REDIS_PORT,
    host: env.RATE_LIMIT_REDIS_HOST,
    username: env.RATE_LIMIT_REDIS_USERNAME,
    password: env.RATE_LIMIT_REDIS_PASSWORD,
    tlsDisabled: env.RATE_LIMIT_REDIS_TLS_DISABLED === "true",
    clusterMode: env.RATE_LIMIT_REDIS_CLUSTER_MODE_ENABLED === "1",
  },
  keyPrefix: "api-per-endpoint",
  defaultLimiter: {
    type: "tokenBucket",
    refillRate: env.API_RATE_LIMIT_REFILL_RATE,
    interval: env.API_RATE_LIMIT_REFILL_INTERVAL as Duration,
    maxTokens: env.API_RATE_LIMIT_MAX,
  },
  endpointLimiters: endpointRateLimits,
  limiterCache: {
    fresh: 60_000 * 10, // Data is fresh for 10 minutes
    stale: 60_000 * 20, // Data is stale after 20 minutes
    maxItems: 1000,
  },
  limiterConfigOverride: async (authorizationValue) => {
    const authenticatedEnv = await authenticateAuthorizationHeader(authorizationValue, {
      allowPublicKey: true,
      allowJWT: true,
    });

    if (!authenticatedEnv || !authenticatedEnv.ok) {
      return;
    }

    if (authenticatedEnv.type === "PUBLIC_JWT") {
      return {
        type: "fixedWindow",
        window: env.API_RATE_LIMIT_JWT_WINDOW,
        tokens: env.API_RATE_LIMIT_JWT_TOKENS,
      };
    } else {
      return authenticatedEnv.environment.organization.apiRateLimiterConfig;
    }
  },
  pathMatchers: [/^\/api/],
  // Allow /api/v1/tasks/:id/callback/:secret and other public endpoints
  pathWhiteList: [
    "/api/internal/stripe_webhooks",
    "/api/v1/authorization-code",
    "/api/v1/token",
    "/api/v1/usage/ingest",
    /^\/api\/v1\/tasks\/[^\/]+\/callback\/[^\/]+$/, // /api/v1/tasks/$id/callback/$secret
    /^\/api\/v1\/runs\/[^\/]+\/tasks\/[^\/]+\/callback\/[^\/]+$/, // /api/v1/runs/$runId/tasks/$id/callback/$secret
    /^\/api\/v1\/http-endpoints\/[^\/]+\/env\/[^\/]+\/[^\/]+$/, // /api/v1/http-endpoints/$httpEndpointId/env/$envType/$shortcode
    /^\/api\/v1\/sources\/http\/[^\/]+$/, // /api/v1/sources/http/$id
    /^\/api\/v1\/endpoints\/[^\/]+\/[^\/]+\/index\/[^\/]+$/, // /api/v1/endpoints/$environmentId/$endpointSlug/index/$indexHookIdentifier
    "/api/v1/timezones",
    "/api/v1/usage/ingest",
    "/api/v1/auth/jwt/claims",
    /^\/api\/v1\/runs\/[^\/]+\/attempts$/, // /api/v1/runs/$runFriendlyId/attempts
    /^\/api\/v1\/waitpoints\/tokens\/[^\/]+\/callback\/[^\/]+$/, // /api/v1/waitpoints/tokens/$waitpointFriendlyId/callback/$hash
  ],
  log: {
    rejections: env.API_RATE_LIMIT_REJECTION_LOGS_ENABLED === "1",
    requests: env.API_RATE_LIMIT_REQUEST_LOGS_ENABLED === "1",
    limiter: env.API_RATE_LIMIT_LIMITER_LOGS_ENABLED === "1",
  },
});

export type PerEndpointRateLimitMiddleware = ReturnType<typeof perEndpointRateLimitMiddleware>;
