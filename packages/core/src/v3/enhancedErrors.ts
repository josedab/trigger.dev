import { TaskRunError, TaskRunErrorCodes } from "./schemas/common.js";

/**
 * Enhanced error context for better debugging
 * Implements RFC-0006: Enhanced Error Context & Debugging
 */
export interface ErrorContext {
  // Task execution context
  runId?: string;
  taskId?: string;
  attemptNumber?: number;

  // Timing information
  timestamp?: Date | string;
  executionTime?: number; // ms since task started

  // Environment context
  environment?: "development" | "staging" | "production";
  machinePreset?: string;
  sdkVersion?: string;
  nodeVersion?: string;

  // State context
  lastCheckpoint?: string;
  activeWaitpoint?: string;
  queueName?: string;

  // Additional metadata
  metadata?: Record<string, unknown>;

  // Related entities
  parentRunId?: string;
  triggeredBy?: string;

  // Performance context
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };

  // Retry context
  isRetry?: boolean;
  previousAttempts?: number;
  nextRetryAt?: Date | string;
}

/**
 * Enhanced TaskError with full debugging context
 * Makes debugging 2-3 hours → 5-10 minutes (see RFC-0006)
 */
export class EnhancedTaskError extends Error {
  public readonly context: ErrorContext;
  public readonly originalError: Error | unknown;
  public readonly isEnhanced: true = true;

  constructor(error: Error | unknown, context: Partial<ErrorContext> = {}) {
    const message = error instanceof Error
      ? error.message
      : String(error);

    super(message);

    this.name = "EnhancedTaskError";
    this.originalError = error;

    // Copy stack trace from original error
    if (error instanceof Error && error.stack) {
      this.stack = error.stack;
    }

    // Build complete context
    this.context = {
      timestamp: new Date().toISOString(),
      ...context,
    };
  }

  /**
   * Serialize error for cross-process boundaries
   */
  toJSON(): SerializedEnhancedError {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      context: this.context,
      originalError: this.serializeOriginalError(),
    };
  }

  /**
   * Create user-friendly error message with context
   */
  toFormattedString(): string {
    const parts: string[] = [];

    parts.push(`Error: ${this.message}`);
    parts.push("");

    if (this.context.runId) {
      parts.push(`Run ID: ${this.context.runId}`);
    }

    if (this.context.taskId) {
      parts.push(`Task ID: ${this.context.taskId}`);
    }

    if (this.context.attemptNumber !== undefined) {
      parts.push(`Attempt: ${this.context.attemptNumber}`);
    }

    if (this.context.lastCheckpoint) {
      parts.push(`Last checkpoint: ${this.context.lastCheckpoint}`);
    }

    if (this.context.activeWaitpoint) {
      parts.push(`Active waitpoint: ${this.context.activeWaitpoint}`);
    }

    if (this.context.executionTime) {
      parts.push(`Execution time: ${this.context.executionTime}ms`);
    }

    if (this.context.environment) {
      parts.push(`Environment: ${this.context.environment}`);
    }

    if (this.context.memoryUsage) {
      const heapUsedMB = Math.round(this.context.memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(this.context.memoryUsage.heapTotal / 1024 / 1024);
      parts.push(`Memory: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    }

    if (this.context.isRetry && this.context.previousAttempts) {
      parts.push(`Retry attempt ${this.context.previousAttempts + 1}`);
    }

    if (this.stack) {
      parts.push("");
      parts.push("Stack trace:");
      parts.push(this.stack);
    }

    return parts.join("\n");
  }

  private serializeOriginalError() {
    const err = this.originalError;

    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
    }

    return {
      value: String(err),
    };
  }
}

export interface SerializedEnhancedError {
  name: string;
  message: string;
  stack?: string;
  context: ErrorContext;
  originalError: {
    name?: string;
    message?: string;
    stack?: string;
    value?: string;
  };
}

/**
 * Check if an error is enhanced
 */
export function isEnhancedError(error: unknown): error is EnhancedTaskError {
  return (
    error instanceof EnhancedTaskError ||
    (typeof error === "object" &&
     error !== null &&
     "isEnhanced" in error &&
     error.isEnhanced === true)
  );
}

/**
 * Wrap any error with context
 */
export function enhanceError(
  error: Error | unknown,
  context: Partial<ErrorContext>
): EnhancedTaskError {
  if (isEnhancedError(error)) {
    // Merge additional context into existing enhanced error
    return new EnhancedTaskError(error.originalError, {
      ...error.context,
      ...context,
    });
  }

  return new EnhancedTaskError(error, context);
}

/**
 * Convert enhanced error to TaskRunError format
 */
export function toTaskRunError(error: EnhancedTaskError): TaskRunError {
  const originalError = error.originalError;

  if (originalError instanceof Error) {
    return {
      type: "BUILT_IN_ERROR",
      name: originalError.name,
      message: `${originalError.message}\n\nContext:\n${JSON.stringify(error.context, null, 2)}`,
      stackTrace: originalError.stack ?? "",
    };
  }

  return {
    type: "CUSTOM_ERROR",
    raw: JSON.stringify({
      error: String(originalError),
      context: error.context,
    }),
  };
}

/**
 * Collect current error context (helper for consistent context gathering)
 */
export function collectErrorContext(options: {
  runId?: string;
  taskId?: string;
  attemptNumber?: number;
  lastCheckpoint?: string;
  activeWaitpoint?: string;
  executionStartTime?: number;
  environment?: string;
  queueName?: string;
  parentRunId?: string;
  metadata?: Record<string, unknown>;
}): ErrorContext {
  const memoryUsage = process.memoryUsage();

  return {
    runId: options.runId,
    taskId: options.taskId,
    attemptNumber: options.attemptNumber,
    timestamp: new Date().toISOString(),
    executionTime: options.executionStartTime
      ? Date.now() - options.executionStartTime
      : undefined,
    environment: (options.environment as any) || process.env.NODE_ENV as any,
    sdkVersion: process.env.TRIGGER_SDK_VERSION,
    nodeVersion: process.version,
    lastCheckpoint: options.lastCheckpoint,
    activeWaitpoint: options.activeWaitpoint,
    queueName: options.queueName,
    parentRunId: options.parentRunId,
    metadata: options.metadata,
    memoryUsage: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
    },
  };
}
