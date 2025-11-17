/**
 * Circuit Breaker Tests
 *
 * Basic tests to verify circuit breaker functionality
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createCircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreakerStats,
} from "./index.js";

describe("Circuit Breaker", () => {
  beforeEach(() => {
    // Reset any state between tests
    vi.clearAllMocks();
  });

  it("should allow requests when circuit is closed", async () => {
    const mockFunc = vi.fn().mockResolvedValue("success");

    const breaker = createCircuitBreaker({
      func: mockFunc,
      serviceName: "test-service",
      config: {
        timeout: 1000,
        errorThresholdPercentage: 50,
        resetTimeout: 5000,
        volumeThreshold: 2,
        enabled: true,
      },
    });

    const result = await breaker.fire();

    expect(result).toBe("success");
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it("should pass arguments to the wrapped function", async () => {
    const mockFunc = vi.fn().mockImplementation((a: number, b: number) => a + b);

    const breaker = createCircuitBreaker({
      func: mockFunc,
      serviceName: "test-service-args",
    });

    const result = await breaker.fire(5, 3);

    expect(result).toBe(8);
    expect(mockFunc).toHaveBeenCalledWith(5, 3);
  });

  it("should handle errors from wrapped function", async () => {
    const mockFunc = vi.fn().mockRejectedValue(new Error("Service error"));

    const breaker = createCircuitBreaker({
      func: mockFunc,
      serviceName: "test-service-error",
      config: {
        timeout: 1000,
        errorThresholdPercentage: 50,
        resetTimeout: 5000,
        volumeThreshold: 1,
        enabled: true,
      },
    });

    await expect(breaker.fire()).rejects.toThrow("Service error");
  });

  it("should bypass circuit breaker when disabled", async () => {
    const mockFunc = vi.fn().mockResolvedValue("success");

    const breaker = createCircuitBreaker({
      func: mockFunc,
      serviceName: "test-service-disabled",
      config: {
        enabled: false,
      },
    });

    const result = await breaker.fire();

    expect(result).toBe("success");
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it("should track statistics", async () => {
    const mockFunc = vi.fn().mockResolvedValue("success");

    const breaker = createCircuitBreaker({
      func: mockFunc,
      serviceName: "test-service-stats",
    });

    await breaker.fire();

    const stats = getCircuitBreakerStats("test-service-stats");

    expect(stats).toBeDefined();
    expect(stats?.state).toBe("closed");
    expect(stats?.successes).toBeGreaterThan(0);
  });

  it("should handle timeouts", async () => {
    const mockFunc = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => setTimeout(resolve, 2000));
    });

    const breaker = createCircuitBreaker({
      func: mockFunc,
      serviceName: "test-service-timeout",
      config: {
        timeout: 100, // Very short timeout
        errorThresholdPercentage: 50,
        resetTimeout: 5000,
        volumeThreshold: 1,
        enabled: true,
      },
    });

    await expect(breaker.fire()).rejects.toThrow();
  });
});

describe("CircuitBreakerOpenError", () => {
  it("should create error with service name", () => {
    const error = new CircuitBreakerOpenError("test-service");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CircuitBreakerOpenError);
    expect(error.serviceName).toBe("test-service");
    expect(error.message).toContain("test-service");
  });
});
