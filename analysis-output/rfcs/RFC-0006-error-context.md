# RFC-0006: Enhanced Error Context & Debugging

**Status:** Draft
**Priority:** P0 (Quick Win)
**Effort:** 2 days
**Impact:** 4/5 (High - significantly improves troubleshooting)

---

## Summary

Enhance error messages with rich context (runId, attemptNumber, checkpoint state, trace links) to reduce debugging time from hours to minutes.

---

## Motivation

### Current State

**Poor error messages:**
```
Error: Failed to process task
  at processVideo (task.ts:45)
  at runTask (engine.ts:123)
```

**Missing context:**
- Which run failed?
- Which attempt? (retry #1, #2, #3?)
- What checkpoint was it at?
- How to view logs/trace?

**Impact:**
- Engineers spend hours debugging
- Can't reproduce issues
- Support tickets take days

---

## Detailed Design

### Enhanced Error Class

```typescript
// packages/core/src/v3/errors.ts
export class TaskError extends Error {
  constructor(
    message: string,
    public context: {
      runId: string;
      taskId: string;
      attemptNumber: number;
      checkpointName?: string;
      traceId: string;
      spanId: string;
      userId?: string;
      environment: string;
    }
  ) {
    super(message);
    this.name = 'TaskError';
  }

  toString() {
    return `
TaskError: ${this.message}

Context:
  Run ID: ${this.context.runId}
  Task ID: ${this.context.taskId}
  Attempt: #${this.context.attemptNumber}
  Checkpoint: ${this.context.checkpointName || 'none'}
  Environment: ${this.context.environment}

View logs: https://cloud.trigger.dev/runs/${this.context.runId}
View trace: https://cloud.trigger.dev/traces/${this.context.traceId}

Stack:
${this.stack}
    `.trim();
  }
}
```

**Usage:**
```typescript
// Inside RunEngine
try {
  await executeTask(run);
} catch (error) {
  throw new TaskError('Task execution failed', {
    runId: run.id,
    taskId: run.taskIdentifier,
    attemptNumber: attempt.attemptNumber,
    checkpointName: lastCheckpoint?.name,
    traceId: run.traceId,
    spanId: run.spanId,
    environment: run.environment.type,
  });
}
```

---

### Serializable Errors

**Problem:** Errors lose context when crossing process boundaries (worker → coordinator → webapp)

**Solution:** Serialize all error properties

```typescript
export function serializeError(error: Error): SerializedError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    // Preserve custom properties
    ...Object.getOwnPropertyNames(error).reduce((acc, key) => {
      acc[key] = (error as any)[key];
      return acc;
    }, {} as any),
  };
}

export function deserializeError(data: SerializedError): Error {
  const error = new Error(data.message);
  error.name = data.name;
  error.stack = data.stack;
  Object.assign(error, data);
  return error;
}
```

---

### Contextual Logging

**Add context to every log:**
```typescript
// Before
logger.error('Task failed');

// After
logger.error('Task failed', {
  runId: 'run_abc123',
  taskId: 'process-video',
  attemptNumber: 2,
  checkpointName: 'downloaded',
  traceId: 'trace_xyz',
  userId: 'user_123',
});
```

**OpenTelemetry span attributes:**
```typescript
span.setAttributes({
  'task.run_id': runId,
  'task.attempt_number': attemptNumber,
  'task.checkpoint': checkpointName,
  'task.error.type': error.name,
  'task.error.message': error.message,
});
```

---

### Error Dashboard

**Webapp enhancement:**
```typescript
// apps/webapp/app/routes/errors.tsx
export async function loader({ request }: LoaderArgs) {
  const errors = await prisma.taskRunAttempt.findMany({
    where: { status: 'FAILED' },
    include: {
      taskRun: { include: { task: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Group by error type
  const grouped = groupBy(errors, (e) => e.error.name);

  return json({ errors, grouped });
}
```

**UI:**
```
┌─────────────────────────────────────────────┐
│ Failed Tasks (Last 24h)                     │
├─────────────────────────────────────────────┤
│ TypeError (15 occurrences)                  │
│   ├─ process-video: 8 failures             │
│   └─ send-email: 7 failures                │
│                                             │
│ NetworkError (5 occurrences)                │
│   └─ fetch-data: 5 failures                │
│                                             │
│ ValidationError (2 occurrences)             │
│   └─ parse-webhook: 2 failures             │
└─────────────────────────────────────────────┘
```

---

## Implementation Plan

### Day 1: Error Infrastructure
**Morning:**
- Create `TaskError` class
- Add `serializeError/deserializeError`
- Update error handling in RunEngine

**Afternoon:**
- Add span attributes for errors
- Update logger to include context
- Write tests

### Day 2: Dashboard & Rollout
**Morning:**
- Build error dashboard UI
- Add filtering, grouping
- Link to logs/traces

**Afternoon:**
- Deploy to staging
- Test error scenarios
- Deploy to production

**Effort:** 2 days

---

## Example (Before/After)

### Before
```
Error: Failed to fetch data
  at fetch (node:internal/fetch:123)
  at processTask (task.ts:45)

# Engineer's investigation:
# 1. Search logs for "Failed to fetch" (1000 results)
# 2. Guess which run failed
# 3. Find trace manually
# 4. Reproduce locally
# Time: 2-3 hours
```

### After
```
TaskError: Failed to fetch data

Context:
  Run ID: run_abc123
  Task ID: fetch-data
  Attempt: #2 (of 3)
  Checkpoint: none
  Environment: production

View logs: https://cloud.trigger.dev/runs/run_abc123
View trace: https://cloud.trigger.dev/traces/trace_xyz

Stack:
  at fetch (node:internal/fetch:123)
  at processTask (task.ts:45)

# Engineer's investigation:
# 1. Click "View logs" link
# 2. See full context immediately
# 3. Check trace for slow requests
# Time: 5-10 minutes
```

---

## Success Criteria

- ✅ All errors include runId, attemptNumber, traceId
- ✅ Error dashboard shows grouped failures
- ✅ Mean time to debug: -70% (from 2h to 20min)
- ✅ Support ticket resolution time: -50%

---

## Backwards Compatibility

✅ **Backward compatible:**
- Existing errors still work
- New context is additive
- No breaking changes

---

**Status:** Ready for Sprint 1
**Owner:** Backend Engineer
**Timeline:** Days 3-4 of Sprint 1
