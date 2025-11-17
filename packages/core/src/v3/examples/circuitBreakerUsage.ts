/**
 * Circuit Breaker Usage Examples (RFC-0005)
 *
 * Examples of how to use the circuit breaker pattern for resilient service calls.
 */

import {
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakers,
  CircuitBreakerError,
  CircuitState,
} from "../circuitBreaker.js";

// ============================================================================
// Example 1: Basic Circuit Breaker for External API
// ============================================================================

export async function example1_BasicUsage() {
  const breaker = new CircuitBreaker({
    name: "stripe-api",
    failureThreshold: 5,     // Open after 5 failures
    resetTimeout: 60_000,    // Try again after 1 minute
    successThreshold: 2,     // Need 2 successes to close
  });

  try {
    const result = await breaker.execute(async () => {
      // Simulated Stripe API call
      const response = await fetch("https://api.stripe.com/v1/charges", {
        method: "POST",
        headers: { Authorization: "Bearer sk_test_..." },
      });

      if (!response.ok) {
        throw new Error(`Stripe API error: ${response.status}`);
      }

      return response.json();
    });

    console.log("Charge created:", result);
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      console.error("Circuit is open, Stripe is down:", error.message);
      // Fallback: Queue for later processing
    } else {
      console.error("Stripe API error:", error);
    }
  }
}

// ============================================================================
// Example 2: Circuit Breaker with Custom Error Filter
// ============================================================================

export async function example2_ErrorFilter() {
  const breaker = new CircuitBreaker({
    name: "github-api",
    failureThreshold: 3,

    // Only count 5xx errors as failures (not 4xx)
    errorFilter: (error: Error) => {
      if (error.message.includes("status: 4")) {
        return false; // Don't count 4xx as circuit failure
      }
      return true; // Count everything else
    },

    onOpen: () => {
      console.log("GitHub API circuit opened - service is down");
      // Send alert to PagerDuty
    },

    onClose: () => {
      console.log("GitHub API circuit closed - service recovered");
    },
  });

  const result = await breaker.execute(async () => {
    const response = await fetch("https://api.github.com/repos/triggerdotdev/trigger.dev");

    if (!response.ok) {
      throw new Error(`GitHub API error: status: ${response.status}`);
    }

    return response.json();
  });

  return result;
}

// ============================================================================
// Example 3: Using Circuit Breaker Manager (Recommended for Multiple Services)
// ============================================================================

export function setupCircuitBreakers() {
  const manager = new CircuitBreakerManager();

  // Create circuit breaker for each external service
  manager.create({
    name: "stripe",
    failureThreshold: 5,
    resetTimeout: 60_000,
  });

  manager.create({
    name: "github",
    failureThreshold: 3,
    resetTimeout: 30_000,
  });

  manager.create({
    name: "openai",
    failureThreshold: 5,
    resetTimeout: 120_000, // 2 minutes (AI services can be slow to recover)
    timeout: 30_000,        // 30 second timeout for AI requests
  });

  manager.create({
    name: "database",
    failureThreshold: 10,   // Higher threshold for database
    resetTimeout: 10_000,   // Faster retry for database
  });

  return manager;
}

export async function example3_Manager() {
  const manager = setupCircuitBreakers();

  try {
    // Use the circuit breaker for Stripe
    const charge = await manager.execute("stripe", async () => {
      return await createStripeCharge({ amount: 1000, currency: "usd" });
    });

    console.log("Charge created:", charge);
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      console.log("Circuit is open, service is down");
      // Handle gracefully
    }
  }

  // Check all circuit breaker statuses
  const stats = manager.getAllStats();
  console.log("Circuit breaker stats:", stats);
}

// ============================================================================
// Example 4: Using Global Circuit Breaker Instance
// ============================================================================

// Setup once at app startup
export function initializeCircuitBreakers() {
  circuitBreakers.create({
    name: "stripe",
    failureThreshold: 5,
    resetTimeout: 60_000,
  });

  circuitBreakers.create({
    name: "github",
    failureThreshold: 3,
    resetTimeout: 30_000,
  });
}

// Use anywhere in the app
export async function example4_GlobalInstance() {
  // No need to pass manager around, use global instance
  const result = await circuitBreakers.execute("github", async () => {
    return await fetchGitHubRepo("triggerdotdev/trigger.dev");
  });

  return result;
}

// ============================================================================
// Example 5: Circuit Breaker in Task Execution
// ============================================================================

export async function example5_TaskIntegration() {
  // In task.ts file
  const slackBreaker = circuitBreakers.create({
    name: "slack-notifications",
    failureThreshold: 5,
    resetTimeout: 300_000, // 5 minutes

    onOpen: () => {
      console.warn("Slack notifications circuit opened - failing fast");
    },
  });

  try {
    await slackBreaker.execute(async () => {
      await fetch("https://hooks.slack.com/services/...", {
        method: "POST",
        body: JSON.stringify({
          text: "Task completed successfully!",
        }),
      });
    });
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      // Slack is down, but don't fail the task
      console.log("Skipping Slack notification - service is down");
      // Maybe store notification for retry later
    } else {
      // Real error, propagate it
      throw error;
    }
  }
}

// ============================================================================
// Example 6: Monitoring Circuit Breaker States
// ============================================================================

export function example6_Monitoring() {
  // Expose circuit breaker stats via endpoint
  const stats = circuitBreakers.getAllStats();

  return {
    timestamp: new Date().toISOString(),
    breakers: stats,
    summary: {
      total: Object.keys(stats).length,
      open: Object.values(stats).filter((s) => s.state === CircuitState.OPEN).length,
      halfOpen: Object.values(stats).filter((s) => s.state === CircuitState.HALF_OPEN).length,
      closed: Object.values(stats).filter((s) => s.state === CircuitState.CLOSED).length,
    },
  };
}

// ============================================================================
// Example 7: Fallback Strategy
// ============================================================================

export async function example7_Fallback() {
  const breaker = circuitBreakers.get("openai");

  if (!breaker) {
    throw new Error("OpenAI circuit breaker not initialized");
  }

  try {
    // Try to use OpenAI
    const result = await breaker.execute(async () => {
      return await generateWithOpenAI("Write a summary...");
    });

    return { source: "openai", result };
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      // OpenAI is down, use fallback
      console.log("OpenAI circuit is open, using fallback");

      return {
        source: "fallback",
        result: "OpenAI is currently unavailable. Please try again later.",
      };
    }

    throw error;
  }
}

// ============================================================================
// Example 8: Testing Circuit Breaker Behavior
// ============================================================================

export async function example8_Testing() {
  const breaker = new CircuitBreaker({
    name: "test-service",
    failureThreshold: 3,
    resetTimeout: 5_000, // 5 seconds
  });

  console.log("Initial state:", breaker.getState()); // CLOSED

  // Simulate failures
  for (let i = 0; i < 3; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error("Simulated failure");
      });
    } catch (error) {
      console.log(`Failure ${i + 1}:`, error);
    }
  }

  console.log("After 3 failures:", breaker.getState()); // OPEN

  try {
    // This should fail fast
    await breaker.execute(async () => {
      return "success";
    });
  } catch (error) {
    console.log("Failed fast:", error instanceof CircuitBreakerError); // true
  }

  // Wait for reset timeout
  await new Promise((resolve) => setTimeout(resolve, 5_100));

  console.log("After timeout:", breaker.getState()); // Still OPEN until we try

  // This should transition to HALF_OPEN
  try {
    await breaker.execute(async () => {
      return "success";
    });
  } catch (error) {
    // ...
  }

  console.log("After first request post-timeout:", breaker.getState()); // HALF_OPEN or CLOSED
}

// ============================================================================
// Helper Functions (simulated)
// ============================================================================

async function createStripeCharge(options: { amount: number; currency: string }) {
  // Simulated Stripe API call
  return { id: "ch_123", amount: options.amount };
}

async function fetchGitHubRepo(repo: string) {
  // Simulated GitHub API call
  return { name: repo, stars: 1000 };
}

async function generateWithOpenAI(prompt: string) {
  // Simulated OpenAI API call
  return "Generated text...";
}

/**
 * Summary: Circuit Breaker Benefits
 *
 * ✅ Prevents cascading failures
 * ✅ Fails fast when service is down (no wasted time/resources)
 * ✅ Automatic recovery detection
 * ✅ Configurable thresholds per service
 * ✅ Easy to monitor circuit states
 * ✅ Graceful degradation with fallbacks
 *
 * Use circuit breakers for:
 * - External API calls (Stripe, GitHub, OpenAI, etc.)
 * - Database queries (especially to replica databases)
 * - Microservice calls
 * - Any operation that can fail temporarily
 */
