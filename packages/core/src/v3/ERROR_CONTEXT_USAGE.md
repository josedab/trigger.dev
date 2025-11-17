# Enhanced Error Context Usage Guide

This guide demonstrates how to use the enhanced error context features introduced in RFC-0006.

## Overview

The enhanced error context infrastructure provides:
- **TaskError class**: Rich error class with execution context (run ID, attempt number, trace info, etc.)
- **Error serialization**: Functions to serialize/deserialize errors across process boundaries
- **Enhanced OTEL attributes**: Automatic error context attributes in OpenTelemetry spans
- **Better debugging**: Reduced debugging time with comprehensive error information

## TaskError Class

### Basic Usage

```typescript
import { TaskError, createTaskErrorContext } from "@trigger.dev/core/v3";
import { TaskContextAPI } from "@trigger.dev/core/v3/taskContext";

// Get the current task context
const taskCtx = TaskContextAPI.getInstance().ctx;

if (taskCtx) {
  const errorContext = createTaskErrorContext({
    runId: taskCtx.run.id,
    taskId: taskCtx.task.id,
    attemptNumber: taskCtx.attempt.number,
    environment: taskCtx.environment.type,
    organizationSlug: taskCtx.organization.slug,
    projectRef: taskCtx.project.ref,
  });

  throw new TaskError("Failed to process video", errorContext);
}
```

### TaskError Output Example

When a TaskError is thrown, it provides comprehensive debugging information:

```
TaskError: Failed to process video

Context:
  Run ID: run_abc123
  Task ID: process-video
  Attempt: #2
  Environment: production
  Organization Slug: acme-corp
  Project Ref: my-project

View run: /orgs/acme-corp/projects/my-project/runs/run_abc123

Stack:
  at processVideo (task.ts:45)
  at runTask (engine.ts:123)
```

### With Optional Context

```typescript
import { TaskError, createTaskErrorContext } from "@trigger.dev/core/v3";

const errorContext = createTaskErrorContext({
  runId: "run_abc123",
  taskId: "fetch-data",
  attemptNumber: 2,
  environment: "production",
  checkpointName: "downloaded",  // Optional checkpoint
  traceId: "trace_xyz789",       // Optional trace ID
  spanId: "span_123456",         // Optional span ID
  userId: "user_789",            // Optional user ID
  organizationSlug: "acme-corp",
  projectRef: "my-project",
});

throw new TaskError("Network timeout", errorContext);
```

## Error Serialization

### Serializing Errors

Use `serializeError` to convert errors into plain objects that can be sent across process boundaries:

```typescript
import { serializeError, TaskError } from "@trigger.dev/core/v3";

try {
  // ... some code that might fail
} catch (error) {
  if (error instanceof Error) {
    const serialized = serializeError(error);

    // Send to another process, store in database, etc.
    await sendToCoordinator(serialized);
  }
}
```

### Deserializing Errors

Use `deserializeError` to reconstruct error objects:

```typescript
import { deserializeError } from "@trigger.dev/core/v3";

// Receive serialized error from another process
const receivedData = await receiveFromWorker();

// Reconstruct the error
const error = deserializeError(receivedData);

// If it was a TaskError, it will be reconstructed with full context
if (error.name === "TaskError") {
  console.log(error.toString()); // Shows full context
}
```

## Enhanced OpenTelemetry Attributes

The `recordSpanException` function now automatically adds error attributes to spans:

```typescript
import { recordSpanException } from "@trigger.dev/core/v3/otel";

const span = tracer.startSpan("process-task");

try {
  // ... task execution
} catch (error) {
  // Automatically adds error.type, error.message, and error.stack_trace attributes
  recordSpanException(span, error);

  // Optionally add custom attributes
  recordSpanException(span, error, {
    "task.checkpoint": "processing",
    "task.retries_remaining": 2,
  });
}
```

## Best Practices

### 1. Use TaskError for Task-Level Failures

```typescript
// ❌ Bad: Generic error without context
throw new Error("Task failed");

// ✅ Good: TaskError with full context
throw new TaskError("Task failed: API timeout", errorContext);
```

### 2. Include Relevant Context Fields

```typescript
// Minimal context
const minimalContext = createTaskErrorContext({
  runId: ctx.run.id,
  taskId: ctx.task.id,
  attemptNumber: ctx.attempt.number,
  environment: ctx.environment.type,
});

// Rich context (recommended)
const richContext = createTaskErrorContext({
  runId: ctx.run.id,
  taskId: ctx.task.id,
  attemptNumber: ctx.attempt.number,
  environment: ctx.environment.type,
  checkpointName: currentCheckpoint,
  organizationSlug: ctx.organization.slug,
  projectRef: ctx.project.ref,
  userId: currentUserId,
});
```

### 3. Serialize Errors When Crossing Boundaries

```typescript
// Worker process
try {
  await executeTask();
} catch (error) {
  const serialized = serializeError(error as Error);
  await coordinator.reportError(serialized);
}

// Coordinator process
const errorData = await worker.getError();
const error = deserializeError(errorData);
logError(error);
```

## Type Definitions

```typescript
export type TaskErrorContext = {
  runId: string;
  taskId: string;
  attemptNumber: number;
  environment: string;
  checkpointName?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  organizationSlug?: string;
  projectRef?: string;
};

export type SerializedErrorData = {
  name: string;
  message: string;
  stack?: string;
  context?: TaskErrorContext;
  customProperties?: Record<string, any>;
};
```

## Migration Guide

### Before (without enhanced context)

```typescript
try {
  await processData();
} catch (error) {
  console.error("Failed to process data:", error);
  throw error;
}
```

### After (with enhanced context)

```typescript
import { TaskError, createTaskErrorContext } from "@trigger.dev/core/v3";
import { TaskContextAPI } from "@trigger.dev/core/v3/taskContext";

try {
  await processData();
} catch (error) {
  const taskCtx = TaskContextAPI.getInstance().ctx;

  if (taskCtx) {
    const errorContext = createTaskErrorContext({
      runId: taskCtx.run.id,
      taskId: taskCtx.task.id,
      attemptNumber: taskCtx.attempt.number,
      environment: taskCtx.environment.type,
      organizationSlug: taskCtx.organization.slug,
      projectRef: taskCtx.project.ref,
    });

    throw new TaskError(`Failed to process data: ${error.message}`, errorContext);
  }

  throw error;
}
```

## Benefits

- **Faster debugging**: All context in one place, no need to search logs
- **Better error messages**: Clear identification of which run, attempt, and environment failed
- **Direct navigation**: Links to view run details in the dashboard
- **Improved observability**: Rich OTEL attributes for better tracing
- **Serialization safety**: Errors can cross process boundaries without losing context

## Related

- RFC-0006: Enhanced Error Context & Debugging
- OpenTelemetry Tracing SDK
- Task Context API
