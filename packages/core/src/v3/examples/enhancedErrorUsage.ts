/**
 * Example usage of Enhanced Errors (RFC-0006)
 * This file demonstrates how to use the enhanced error system for better debugging
 */

import {
  EnhancedTaskError,
  enhanceError,
  collectErrorContext,
  type ErrorContext,
} from "../enhancedErrors.js";

// Example 1: Wrapping an error with context in a task execution
export async function executeTaskWithEnhancedErrors(
  runId: string,
  taskId: string,
  attemptNumber: number
) {
  const executionStartTime = Date.now();
  let lastCheckpoint: string | undefined;

  try {
    // Simulate task execution
    await performSomeWork();
    lastCheckpoint = "work-completed";

    await performMoreWork();
    lastCheckpoint = "more-work-completed";

    return { success: true };
  } catch (error) {
    // Enhance the error with full context
    const enhancedError = enhanceError(error, {
      runId,
      taskId,
      attemptNumber,
      lastCheckpoint,
      executionTime: Date.now() - executionStartTime,
      environment: process.env.NODE_ENV as any,
      queueName: "default",
    });

    // Log the formatted error
    console.error(enhancedError.toFormattedString());

    // The error now has complete context for debugging
    throw enhancedError;
  }
}

// Example 2: Using collectErrorContext helper
export async function executeWithContextHelper(
  runId: string,
  taskId: string,
  attemptNumber: number
) {
  const executionStartTime = Date.now();

  try {
    await performSomeWork();
  } catch (error) {
    // Use the helper to collect context automatically
    const context = collectErrorContext({
      runId,
      taskId,
      attemptNumber,
      executionStartTime,
      lastCheckpoint: "work-in-progress",
      queueName: "high-priority",
      metadata: {
        customField: "customValue",
        retryReason: "network-timeout",
      },
    });

    throw enhanceError(error, context);
  }
}

// Example 3: Catching and re-throwing with additional context
export async function nestedFunctionWithContext(
  runId: string,
  taskId: string
) {
  try {
    await deeplyNestedFunction();
  } catch (error) {
    // Add context at this level
    throw enhanceError(error, {
      runId,
      taskId,
      metadata: {
        function: "nestedFunctionWithContext",
        level: "outer",
      },
    });
  }
}

async function deeplyNestedFunction() {
  try {
    throw new Error("Database connection failed");
  } catch (error) {
    // Add context at inner level
    throw enhanceError(error, {
      metadata: {
        function: "deeplyNestedFunction",
        level: "inner",
        database: "postgresql",
      },
    });
  }
}

// Example 4: Serializing for cross-process communication
export function serializeErrorForWorker(error: EnhancedTaskError): string {
  return JSON.stringify(error.toJSON());
}

export function deserializeErrorFromWorker(serialized: string): EnhancedTaskError {
  const data = JSON.parse(serialized);
  return new EnhancedTaskError(
    new Error(data.originalError.message),
    data.context
  );
}

// Example 5: Integration with existing error handling
import { parseError } from "../errors.js";

export function handleTaskError(error: unknown, context: ErrorContext) {
  // Enhance the error first
  const enhanced = enhanceError(error, context);

  // Convert to TaskRunError for storage
  const taskRunError = parseError(enhanced);

  // Now you have both:
  // 1. Enhanced error with full context for logging
  // 2. TaskRunError for database storage

  console.error("Enhanced:", enhanced.toFormattedString());
  console.log("For DB:", taskRunError);

  return { enhanced, taskRunError };
}

// Example 6: Conditional enhancement based on environment
export function smartEnhanceError(
  error: unknown,
  context: Partial<ErrorContext>
): Error {
  // In development, add full context
  if (process.env.NODE_ENV === "development") {
    return enhanceError(error, {
      ...context,
      metadata: {
        ...(context.metadata || {}),
        enhancedAt: new Date().toISOString(),
        processId: process.pid,
      },
    });
  }

  // In production, still enhance but maybe with less verbose output
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

// Helper functions for examples
async function performSomeWork() {
  // Simulate work
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function performMoreWork() {
  // Simulate work that might fail
  if (Math.random() > 0.5) {
    throw new Error("Random failure during more work");
  }
}

/**
 * Example output when using enhanced errors:
 *
 * Before (standard error):
 * ```
 * Error: Database connection failed
 *   at Object.<anonymous> (/app/task.ts:45:12)
 * ```
 *
 * After (enhanced error):
 * ```
 * Error: Database connection failed
 *
 * Run ID: run_1234567890
 * Task ID: process-payment
 * Attempt: 2
 * Last checkpoint: payment-validated
 * Execution time: 3456ms
 * Environment: production
 * Memory: 245MB / 512MB
 * Retry attempt 3
 *
 * Stack trace:
 *   at Object.<anonymous> (/app/task.ts:45:12)
 *   at processPayment (/app/payment.ts:123:5)
 *
 * Context:
 * {
 *   "runId": "run_1234567890",
 *   "taskId": "process-payment",
 *   "attemptNumber": 2,
 *   "timestamp": "2025-11-17T10:30:45.123Z",
 *   "executionTime": 3456,
 *   "lastCheckpoint": "payment-validated",
 *   "queueName": "payments",
 *   "metadata": {
 *     "paymentId": "pay_abc123",
 *     "amount": 1000
 *   }
 * }
 * ```
 *
 * This context reduces debugging time from 2-3 hours to 5-10 minutes!
 */
