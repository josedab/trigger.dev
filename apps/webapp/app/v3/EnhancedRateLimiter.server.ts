/**
 * Enhanced Rate Limiter (RFC-0010)
 *
 * Provides per-endpoint rate limiting configuration with improved error messages.
 *
 * Features:
 * - Per-endpoint rate limit configs
 * - Tiered limits (e.g., different limits for free vs paid users)
 * - Detailed Retry-After headers
 * - Helpful error messages
 * - Burst allowance configuration
 */

import { json } from "@remix-run/node";
import { GCRARateLimiter, type RateLimitResult } from "./GCRARateLimiter.server";
import Redis from "ioredis";

/**
 * Rate limit configuration for an endpoint
 */
export interface EndpointRateLimitConfig {
  /** Endpoint identifier (e.g., "api:trigger-task") */
  endpoint: string;

  /** Requests per time window */
  limit: number;

  /** Time window in milliseconds */
  window: number;

  /** Optional burst allowance (defaults to limit * 2) */
  burst?: number;

  /** Human-readable description */
  description?: string;

  /** Custom error message */
  errorMessage?: string;
}

/**
 * Tiered rate limit (different limits for different user tiers)
 */
export interface TieredRateLimitConfig extends EndpointRateLimitConfig {
  tier: "free" | "pro" | "enterprise";
}

/**
 * Pre-configured endpoint rate limits
 */
export const ENDPOINT_RATE_LIMITS: Record<string, EndpointRateLimitConfig> = {
  // API endpoints
  "api:trigger-task": {
    endpoint: "api:trigger-task",
    limit: 100,          // 100 requests
    window: 60_000,      // per minute
    burst: 200,          // allow bursts up to 200
    description: "Task triggering",
    errorMessage: "Too many task triggers. Please slow down.",
  },

  "api:batch-trigger": {
    endpoint: "api:batch-trigger",
    limit: 20,           // 20 requests
    window: 60_000,      // per minute
    burst: 40,           // allow bursts up to 40
    description: "Batch task triggering",
    errorMessage: "Too many batch triggers. Please wait before triggering more batches.",
  },

  "api:task-runs:list": {
    endpoint: "api:task-runs:list",
    limit: 300,          // 300 requests
    window: 60_000,      // per minute
    burst: 500,
    description: "List task runs",
  },

  "api:task-run:replay": {
    endpoint: "api:task-run:replay",
    limit: 50,           // 50 requests
    window: 60_000,      // per minute
    burst: 100,
    description: "Replay task runs",
    errorMessage: "Too many replay requests. Please wait before replaying more tasks.",
  },

  // Dashboard endpoints
  "dashboard:runs": {
    endpoint: "dashboard:runs",
    limit: 1000,         // 1000 requests
    window: 60_000,      // per minute (high limit for dashboard polling)
    burst: 2000,
    description: "Dashboard runs polling",
  },

  "dashboard:projects": {
    endpoint: "dashboard:projects",
    limit: 100,
    window: 60_000,
    burst: 200,
    description: "Projects list",
  },

  // Auth endpoints (stricter limits)
  "auth:login": {
    endpoint: "auth:login",
    limit: 5,            // 5 attempts
    window: 300_000,     // per 5 minutes
    burst: 10,           // max 10 total in burst
    description: "Login attempts",
    errorMessage: "Too many login attempts. Please try again later.",
  },

  "auth:signup": {
    endpoint: "auth:signup",
    limit: 3,            // 3 attempts
    window: 3600_000,    // per hour
    burst: 5,
    description: "Signup attempts",
    errorMessage: "Too many signup attempts. Please try again in an hour.",
  },

  "auth:password-reset": {
    endpoint: "auth:password-reset",
    limit: 3,            // 3 attempts
    window: 3600_000,    // per hour
    burst: 5,
    description: "Password reset requests",
    errorMessage: "Too many password reset requests. Please try again in an hour.",
  },

  // WebSocket endpoints
  "websocket:subscribe": {
    endpoint: "websocket:subscribe",
    limit: 100,
    window: 60_000,
    burst: 200,
    description: "WebSocket subscriptions",
  },

  // Expensive operations
  "operation:deployment": {
    endpoint: "operation:deployment",
    limit: 10,           // 10 deployments
    window: 300_000,     // per 5 minutes
    burst: 15,
    description: "Deployments",
    errorMessage: "Too many deployments. Please wait before deploying again.",
  },
};

/**
 * Tiered rate limits (different limits based on plan)
 */
export const TIERED_RATE_LIMITS: Record<string, Record<string, TieredRateLimitConfig>> = {
  "api:trigger-task": {
    free: {
      tier: "free",
      endpoint: "api:trigger-task",
      limit: 100,
      window: 60_000,
      burst: 150,
      description: "Task triggering (Free tier)",
    },
    pro: {
      tier: "pro",
      endpoint: "api:trigger-task",
      limit: 1000,
      window: 60_000,
      burst: 2000,
      description: "Task triggering (Pro tier)",
    },
    enterprise: {
      tier: "enterprise",
      endpoint: "api:trigger-task",
      limit: 10_000,
      window: 60_000,
      burst: 20_000,
      description: "Task triggering (Enterprise tier)",
    },
  },

  "api:batch-trigger": {
    free: {
      tier: "free",
      endpoint: "api:batch-trigger",
      limit: 10,
      window: 60_000,
      burst: 20,
      description: "Batch triggering (Free tier)",
    },
    pro: {
      tier: "pro",
      endpoint: "api:batch-trigger",
      limit: 100,
      window: 60_000,
      burst: 200,
      description: "Batch triggering (Pro tier)",
    },
    enterprise: {
      tier: "enterprise",
      endpoint: "api:batch-trigger",
      limit: 1000,
      window: 60_000,
      burst: 2000,
      description: "Batch triggering (Enterprise tier)",
    },
  },
};

/**
 * Enhanced rate limiter with per-endpoint configuration
 */
export class EnhancedRateLimiter {
  private limiters: Map<string, GCRARateLimiter> = new Map();
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get or create a rate limiter for a specific endpoint
   */
  private getLimiter(config: EndpointRateLimitConfig): GCRARateLimiter {
    const key = config.endpoint;

    if (!this.limiters.has(key)) {
      const emissionInterval = config.window / config.limit;
      const burst = config.burst || config.limit * 2;
      const burstTolerance = emissionInterval * (burst - 1);

      const limiter = new GCRARateLimiter({
        redis: this.redis,
        keyPrefix: `ratelimit:${config.endpoint}:`,
        emissionInterval,
        burstTolerance,
        keyExpiration: config.window * 2, // 2x window for safety
      });

      this.limiters.set(key, limiter);
    }

    return this.limiters.get(key)!;
  }

  /**
   * Check rate limit for a specific endpoint and identifier
   *
   * @param endpoint - Endpoint identifier (e.g., "api:trigger-task")
   * @param identifier - Unique identifier (e.g., user ID, API key, IP)
   * @returns Rate limit result
   *
   * @example
   * const limiter = new EnhancedRateLimiter(redis);
   * const result = await limiter.check("api:trigger-task", "user:123");
   *
   * if (!result.allowed) {
   *   throw json(
   *     { error: result.errorMessage },
   *     {
   *       status: 429,
   *       headers: { "Retry-After": String(Math.ceil(result.retryAfter! / 1000)) },
   *     }
   *   );
   * }
   */
  async check(
    endpoint: string,
    identifier: string,
    config?: Partial<EndpointRateLimitConfig>
  ): Promise<RateLimitResult & { errorMessage?: string; endpoint: string }> {
    const endpointConfig = {
      ...ENDPOINT_RATE_LIMITS[endpoint],
      ...config,
      endpoint,
    } as EndpointRateLimitConfig;

    // Ensure we have required fields
    if (!endpointConfig.limit || !endpointConfig.window) {
      throw new Error(
        `Rate limit configuration not found for endpoint: ${endpoint}. ` +
          `Please add it to ENDPOINT_RATE_LIMITS or provide a config.`
      );
    }

    const limiter = this.getLimiter(endpointConfig);
    const result = await limiter.check(identifier);

    return {
      ...result,
      endpoint,
      errorMessage: endpointConfig.errorMessage,
    };
  }

  /**
   * Check rate limit with tiered configuration
   *
   * @example
   * const result = await limiter.checkTiered(
   *   "api:trigger-task",
   *   "user:123",
   *   "pro"
   * );
   */
  async checkTiered(
    endpoint: string,
    identifier: string,
    tier: "free" | "pro" | "enterprise"
  ): Promise<RateLimitResult & { errorMessage?: string; endpoint: string }> {
    const tieredConfigs = TIERED_RATE_LIMITS[endpoint];

    if (!tieredConfigs || !tieredConfigs[tier]) {
      // Fallback to standard config
      return this.check(endpoint, identifier);
    }

    const config = tieredConfigs[tier];
    return this.check(endpoint, identifier, config);
  }

  /**
   * Create a rate limit error response (helper)
   *
   * @example
   * const result = await limiter.check("api:trigger-task", userId);
   * if (!result.allowed) {
   *   throw limiter.createErrorResponse(result);
   * }
   */
  createErrorResponse(result: RateLimitResult & { errorMessage?: string; endpoint: string }) {
    const retryAfterSeconds = result.retryAfter
      ? Math.ceil(result.retryAfter / 1000)
      : 60;

    return json(
      {
        error: result.errorMessage || "Rate limit exceeded. Please try again later.",
        retryAfter: retryAfterSeconds,
        endpoint: result.endpoint,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Endpoint": result.endpoint,
        },
      }
    );
  }
}

/**
 * Middleware helper for routes
 *
 * @example
 * export async function action({ request }: ActionFunctionArgs) {
 *   await requireRateLimit(request, "api:trigger-task", userId);
 *
 *   // If we get here, rate limit passed
 *   // ... rest of action logic
 * }
 */
export async function requireRateLimit(
  redis: Redis,
  request: Request,
  endpoint: string,
  identifier: string,
  tier?: "free" | "pro" | "enterprise"
): Promise<void> {
  const limiter = new EnhancedRateLimiter(redis);

  const result = tier
    ? await limiter.checkTiered(endpoint, identifier, tier)
    : await limiter.check(endpoint, identifier);

  if (!result.allowed) {
    throw limiter.createErrorResponse(result);
  }
}
