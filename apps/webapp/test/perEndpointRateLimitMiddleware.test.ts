import { redisTest } from "@internal/testcontainers";
import { describe, expect, vi, beforeEach } from "vitest";

vi.setConfig({ testTimeout: 30_000 }); // 30 seconds timeout

// Mock the logger
vi.mock("./logger.server", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import express, { Express } from "express";
import request from "supertest";
import { perEndpointRateLimitMiddleware } from "../app/services/perEndpointRateLimitMiddleware.server.js";

describe.skipIf(process.env.GITHUB_ACTIONS)("perEndpointRateLimitMiddleware", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
  });

  redisTest("should apply different rate limits per endpoint", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 100,
        interval: "1m",
        maxTokens: 200,
      },
      endpointLimiters: [
        {
          method: "POST",
          pattern: /^\/api\/v1\/tasks\/[^\/]+\/trigger$/,
          config: {
            limit: 2,
            window: "1m",
            burst: 1,
          },
        },
        {
          method: "GET",
          pattern: /^\/api\/v1\/runs$/,
          config: {
            limit: 5,
            window: "1m",
            burst: 2,
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.post("/api/v1/tasks/:id/trigger", (req, res) => {
      res.status(200).json({ message: "Triggered" });
    });
    app.get("/api/v1/runs", (req, res) => {
      res.status(200).json({ message: "Runs list" });
    });

    // Test POST /api/v1/tasks/:id/trigger with limit of 2 + burst of 1 = 3 total
    const triggerRequests = [];
    for (let i = 0; i < 3; i++) {
      triggerRequests.push(
        request(app).post("/api/v1/tasks/123/trigger").set("Authorization", "Bearer test-token")
      );
    }

    const triggerResponses = await Promise.all(triggerRequests);
    for (const response of triggerResponses) {
      expect(response.status).toBe(200);
    }

    // 4th request should be rate limited
    const limitedTriggerResponse = await request(app)
      .post("/api/v1/tasks/123/trigger")
      .set("Authorization", "Bearer test-token");

    expect(limitedTriggerResponse.status).toBe(429);
    expect(limitedTriggerResponse.body).toHaveProperty("title", "Rate Limit Exceeded");
    expect(limitedTriggerResponse.body).toHaveProperty("retryAfter");
    expect(limitedTriggerResponse.headers["retry-after"]).toBeDefined();

    // Test GET /api/v1/runs with limit of 5 + burst of 2 = 7 total
    const runsRequests = [];
    for (let i = 0; i < 7; i++) {
      runsRequests.push(
        request(app).get("/api/v1/runs").set("Authorization", "Bearer test-token-2")
      );
    }

    const runsResponses = await Promise.all(runsRequests);
    for (const response of runsResponses) {
      expect(response.status).toBe(200);
    }

    // 8th request should be rate limited
    const limitedRunsResponse = await request(app)
      .get("/api/v1/runs")
      .set("Authorization", "Bearer test-token-2");

    expect(limitedRunsResponse.status).toBe(429);
  });

  redisTest("should isolate rate limits per endpoint", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-isolation",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 10,
        interval: "1m",
        maxTokens: 100,
      },
      endpointLimiters: [
        {
          method: "POST",
          pattern: /^\/api\/v1\/tasks\/[^\/]+\/trigger$/,
          config: {
            limit: 1,
            window: "1m",
          },
        },
        {
          method: "GET",
          pattern: /^\/api\/v1\/runs$/,
          config: {
            limit: 1,
            window: "1m",
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.post("/api/v1/tasks/:id/trigger", (req, res) => {
      res.status(200).json({ message: "Triggered" });
    });
    app.get("/api/v1/runs", (req, res) => {
      res.status(200).json({ message: "Runs list" });
    });

    // Use up the limit for trigger endpoint
    const triggerResponse1 = await request(app)
      .post("/api/v1/tasks/123/trigger")
      .set("Authorization", "Bearer test-token");
    expect(triggerResponse1.status).toBe(200);

    const triggerResponse2 = await request(app)
      .post("/api/v1/tasks/123/trigger")
      .set("Authorization", "Bearer test-token");
    expect(triggerResponse2.status).toBe(429);

    // Runs endpoint should still work (isolated rate limit)
    const runsResponse = await request(app)
      .get("/api/v1/runs")
      .set("Authorization", "Bearer test-token");
    expect(runsResponse.status).toBe(200);
  });

  redisTest("should enforce method-specific rate limits", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-method",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 10,
        interval: "1m",
        maxTokens: 100,
      },
      endpointLimiters: [
        {
          method: "POST",
          pattern: /^\/api\/v1\/items$/,
          config: {
            limit: 1,
            window: "1m",
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.post("/api/v1/items", (req, res) => {
      res.status(200).json({ message: "Created" });
    });
    app.get("/api/v1/items", (req, res) => {
      res.status(200).json({ message: "List" });
    });

    // Use up the POST limit
    const postResponse1 = await request(app)
      .post("/api/v1/items")
      .set("Authorization", "Bearer test-token");
    expect(postResponse1.status).toBe(200);

    const postResponse2 = await request(app)
      .post("/api/v1/items")
      .set("Authorization", "Bearer test-token");
    expect(postResponse2.status).toBe(429);

    // GET should still work (different method, uses default limit)
    const getResponse = await request(app)
      .get("/api/v1/items")
      .set("Authorization", "Bearer test-token");
    expect(getResponse.status).toBe(200);
  });

  redisTest("should fall back to default limits for unmatched endpoints", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-fallback",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 1,
        interval: "1m",
        maxTokens: 1,
      },
      endpointLimiters: [
        {
          method: "POST",
          pattern: /^\/api\/v1\/tasks\/[^\/]+\/trigger$/,
          config: {
            limit: 10,
            window: "1m",
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.get("/api/v1/other", (req, res) => {
      res.status(200).json({ message: "Other" });
    });

    // First request should succeed (uses default limit of 1)
    const response1 = await request(app)
      .get("/api/v1/other")
      .set("Authorization", "Bearer test-token");
    expect(response1.status).toBe(200);

    // Second request should be rate limited (default limit is 1)
    const response2 = await request(app)
      .get("/api/v1/other")
      .set("Authorization", "Bearer test-token");
    expect(response2.status).toBe(429);
  });

  redisTest("should include retry-after header in rate limit errors", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-retry",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 1,
        interval: "1m",
        maxTokens: 1,
      },
      endpointLimiters: [
        {
          method: "POST",
          pattern: /^\/api\/v1\/tasks\/[^\/]+\/trigger$/,
          config: {
            limit: 1,
            window: "1m",
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.post("/api/v1/tasks/:id/trigger", (req, res) => {
      res.status(200).json({ message: "Triggered" });
    });

    // Use up the limit
    await request(app).post("/api/v1/tasks/123/trigger").set("Authorization", "Bearer test-token");

    // Get rate limited response
    const response = await request(app)
      .post("/api/v1/tasks/123/trigger")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    expect(response.headers["x-ratelimit-remaining"]).toBe("0");
    expect(response.headers["x-ratelimit-reset"]).toBeDefined();
    expect(response.body).toHaveProperty("retryAfter");
    expect(response.body.retryAfter).toBeGreaterThan(0);
    expect(response.body.detail).toContain("POST /api/v1/tasks/123/trigger");
  });

  redisTest("should support burst allowance with token bucket", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-burst",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 10,
        interval: "1m",
        maxTokens: 100,
      },
      endpointLimiters: [
        {
          method: "POST",
          pattern: /^\/api\/v1\/tasks\/[^\/]+\/trigger$/,
          config: {
            limit: 3,
            window: "1m",
            burst: 2, // Allows 5 total (3 base + 2 burst)
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.post("/api/v1/tasks/:id/trigger", (req, res) => {
      res.status(200).json({ message: "Triggered" });
    });

    // Should allow 5 requests (3 base + 2 burst)
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/api/v1/tasks/123/trigger")
        .set("Authorization", "Bearer test-token");
      expect(response.status).toBe(200);
    }

    // 6th request should be rate limited
    const response = await request(app)
      .post("/api/v1/tasks/123/trigger")
      .set("Authorization", "Bearer test-token");
    expect(response.status).toBe(429);
  });

  redisTest("should not apply rate limiting to whitelisted paths", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-whitelist",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 1,
        interval: "1m",
        maxTokens: 1,
      },
      pathMatchers: [/^\/api/],
      pathWhiteList: [/^\/api\/v1\/tasks\/[^\/]+\/callback\/[^\/]+$/],
      log: {
        rejections: false,
        requests: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.post("/api/v1/tasks/:id/callback/:secret", (req, res) => {
      res.status(200).json({ message: "Callback" });
    });

    // Make multiple requests to whitelisted endpoint
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/api/v1/tasks/123/callback/secret123")
        .set("Authorization", "Bearer test-token");
      expect(response.status).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
    }
  });

  redisTest("should enforce different limits per user", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-per-user",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 10,
        interval: "1m",
        maxTokens: 100,
      },
      endpointLimiters: [
        {
          method: "POST",
          pattern: /^\/api\/v1\/tasks\/[^\/]+\/trigger$/,
          config: {
            limit: 1,
            window: "1m",
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.post("/api/v1/tasks/:id/trigger", (req, res) => {
      res.status(200).json({ message: "Triggered" });
    });

    // User 1 uses up their limit
    const user1Response1 = await request(app)
      .post("/api/v1/tasks/123/trigger")
      .set("Authorization", "Bearer user1-token");
    expect(user1Response1.status).toBe(200);

    const user1Response2 = await request(app)
      .post("/api/v1/tasks/123/trigger")
      .set("Authorization", "Bearer user1-token");
    expect(user1Response2.status).toBe(429);

    // User 2 should still be able to make requests
    const user2Response = await request(app)
      .post("/api/v1/tasks/123/trigger")
      .set("Authorization", "Bearer user2-token");
    expect(user2Response.status).toBe(200);
  });

  redisTest("should work with sliding window strategy", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-sliding",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 10,
        interval: "1m",
        maxTokens: 100,
      },
      endpointLimiters: [
        {
          method: "GET",
          pattern: /^\/api\/v1\/runs$/,
          config: {
            limit: 3,
            window: "10s",
            // No burst specified, should use sliding window
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.get("/api/v1/runs", (req, res) => {
      res.status(200).json({ message: "Runs" });
    });

    // Make 3 requests (should all succeed)
    for (let i = 0; i < 3; i++) {
      const response = await request(app)
        .get("/api/v1/runs")
        .set("Authorization", "Bearer test-token");
      expect(response.status).toBe(200);
    }

    // 4th request should be rate limited
    const response = await request(app)
      .get("/api/v1/runs")
      .set("Authorization", "Bearer test-token");
    expect(response.status).toBe(429);
  });

  redisTest("should handle regex pattern matching correctly", async ({ redisOptions }) => {
    const rateLimitMiddleware = perEndpointRateLimitMiddleware({
      redis: redisOptions,
      keyPrefix: "test-regex",
      defaultLimiter: {
        type: "tokenBucket",
        refillRate: 100,
        interval: "1m",
        maxTokens: 200,
      },
      endpointLimiters: [
        {
          pattern: /^\/api\/v1\/runs\/[^\/]+$/,
          config: {
            limit: 1,
            window: "1m",
          },
        },
      ],
      pathMatchers: [/^\/api/],
      log: {
        rejections: false,
        requests: false,
        limiter: false,
      },
    });

    app.use(rateLimitMiddleware);
    app.get("/api/v1/runs/:id", (req, res) => {
      res.status(200).json({ message: "Run details" });
    });

    // Should match the pattern and apply the limit
    const response1 = await request(app)
      .get("/api/v1/runs/run-123")
      .set("Authorization", "Bearer test-token");
    expect(response1.status).toBe(200);

    const response2 = await request(app)
      .get("/api/v1/runs/run-456")
      .set("Authorization", "Bearer test-token");
    expect(response2.status).toBe(429);

    // Different run ID should still be rate limited (same pattern)
    const response3 = await request(app)
      .get("/api/v1/runs/run-789")
      .set("Authorization", "Bearer test-token");
    expect(response3.status).toBe(429);
  });
});
