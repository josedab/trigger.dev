# Patterns and Practices in Trigger.dev

**Part 3 of 5** in the "Building Durable AI Workflows" series
**Reading Time:** 12 minutes
**Analysis Commit:** [`19fa669`](https://github.com/triggerdotdev/trigger.dev/commit/19fa66931819371d607eff001b561aa783547734)

---

## Introduction

In Parts 1 and 2, we explored Trigger.dev's architecture and the checkpoint-resume system. Now let's examine the **design patterns and practices** that make this codebase maintainable, scalable, and enjoyable to work with.

Whether you're building a similar platform or just want to level up your TypeScript skills, these patterns are valuable lessons from a production-grade codebase.

---

## What You'll Learn

- Architectural patterns (Event-Driven Architecture, Domain-Driven Design, CQRS)
- Code organization strategies in a TypeScript monorepo
- Resilience patterns (retry, circuit breaker, bulkhead)
- Testing approaches for distributed systems
- Real-world examples from the Trigger.dev codebase

---

## Architectural Patterns

### 1. Event-Driven Architecture (EDA)

**Definition:** Components communicate via events instead of direct function calls.

**Why Trigger.dev uses it:**
- **Loose coupling:** Webapp, RunEngine, Coordinator don't need to know about each other
- **Scalability:** Add more workers without changing the webapp
- **Resilience:** Events can be retried if a service is down

**Example:** Run status changes

```typescript
// Webapp: Emit event when run completes
// File: apps/webapp/app/services/runEngine.ts
import { io } from '~/redis.server';

async function completeRun(runId: string, output: unknown) {
  // Update database
  await db.taskRun.update({
    where: { id: runId },
    data: { status: 'COMPLETED_SUCCESSFULLY', output },
  });

  // Emit event (decoupled from database update)
  io.emit(`run:${runId}`, {
    type: 'completed',
    runId,
    status: 'COMPLETED_SUCCESSFULLY',
    output,
  });
}
```

```typescript
// Frontend: Subscribe to events
// File: apps/webapp/app/components/RunMonitor.tsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function RunMonitor({ runId }: { runId: string }) {
  const [status, setStatus] = useState('PENDING');

  useEffect(() => {
    const socket = io('wss://cloud.trigger.dev');

    // Subscribe to run events
    socket.on(`run:${runId}`, (event) => {
      if (event.type === 'completed') {
        setStatus(event.status);
      }
    });

    return () => socket.disconnect();
  }, [runId]);

  return <div>Status: {status}</div>;
}
```

**Benefits:**
- Webapp doesn't block waiting for RunEngine
- Frontend gets real-time updates without polling
- Easy to add new subscribers (analytics, notifications)

**Trade-off:**
- More complex than direct calls
- Event ordering can be tricky

**Reference:** Martin Fowler's [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)

---

### 2. Domain-Driven Design (DDD)

**Definition:** Organize code around business domains (tasks, runs, checkpoints) rather than technical layers (controllers, services, models).

**Trigger.dev's domain model:**

```
Task (aggregate root)
├── BackgroundWorkerTask (database representation)
├── TaskRun (execution instance)
│   ├── TaskRunAttempt (retry attempts)
│   └── TaskRunCheckpoint (state snapshots)
└── TaskQueue (concurrency grouping)
```

**Example: TaskRun aggregate**

```typescript
// File: internal-packages/database/prisma/schema.prisma
model TaskRun {
  id          String   @id @default(cuid())
  friendlyId  String   @unique
  status      TaskRunStatus

  // Aggregate root relationships
  attempts    TaskRunAttempt[]    // Has many attempts
  checkpoints TaskRunCheckpoint[] // Has many checkpoints
  tags        TaskRunTag[]        // Has many tags

  // Business invariants enforced by application
  // Example: Can't complete if attempts are still running
}
```

**Invariants (business rules):**

```typescript
// File: internal-packages/run-engine/src/domain/TaskRun.ts
export class TaskRunAggregate {
  constructor(private run: TaskRun) {}

  canComplete(): boolean {
    // Invariant: All attempts must be finished
    const hasRunningAttempts = this.run.attempts.some(
      (a) => a.status === 'EXECUTING'
    );

    return !hasRunningAttempts;
  }

  async complete(output: unknown): Promise<void> {
    if (!this.canComplete()) {
      throw new Error('Cannot complete run with running attempts');
    }

    this.run.status = 'COMPLETED_SUCCESSFULLY';
    this.run.output = output;
    this.run.completedAt = new Date();

    await db.taskRun.update({
      where: { id: this.run.id },
      data: this.run,
    });
  }
}
```

**Benefits:**
- Business logic is centralized (not scattered across controllers)
- Domain experts can understand the code
- Easier to maintain (clear boundaries)

**Reference:** Eric Evans' [Domain-Driven Design](https://www.domainlanguage.com/ddd/) (2003)

---

### 3. Command Query Responsibility Segregation (CQRS)

**Definition:** Separate write operations (commands) from read operations (queries).

**Why Trigger.dev uses it:**
- **Write path:** Trigger task, update status (optimized for consistency)
- **Read path:** List runs, get run details (optimized for performance)
- **Analytics:** Complex queries go to ClickHouse (separate from operational DB)

**Example:**

**Command (write):**
```typescript
// File: apps/webapp/app/routes/api/v1/tasks/$taskId.trigger.ts
export async function action({ request, params }: ActionArgs) {
  const { payload, options } = await request.json();

  // Command: Create run (writes to PostgreSQL)
  const run = await db.taskRun.create({
    data: {
      taskIdentifier: params.taskId,
      status: 'PENDING',
      payload: JSON.stringify(payload),
      idempotencyKey: options.idempotencyKey,
    },
  });

  // Enqueue (writes to Redis)
  await queue.enqueue(run.id);

  return json({ id: run.id });
}
```

**Query (read):**
```typescript
// File: apps/webapp/app/routes/api/v1/runs.ts
export async function loader({ request }: LoaderArgs) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  // Query: Read runs (optimized with indexes)
  const runs = await db.taskRun.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    // Read from replica for scalability
    // (future optimization)
  });

  return json({ runs });
}
```

**Analytics (separate datastore):**
```typescript
// File: apps/webapp/app/routes/analytics/metrics.ts
export async function loader({ request }: LoaderArgs) {
  // Complex aggregation query on ClickHouse
  const metrics = await clickhouse.query(`
    SELECT
      toStartOfHour(createdAt) as hour,
      taskIdentifier,
      count() as runCount,
      avg(usageDurationMs) as avgDuration
    FROM TaskRunEvents
    WHERE createdAt > now() - INTERVAL 24 HOUR
    GROUP BY hour, taskIdentifier
    ORDER BY hour DESC
  `);

  return json({ metrics });
}
```

**Benefits:**
- Operational queries (writes) are fast and consistent
- Analytics queries don't slow down the application
- Can scale read and write sides independently

---

### 4. Saga Pattern (Orchestration)

**Definition:** Manage multi-step transactions across services.

**Trigger.dev uses orchestration (centralized):**

```
Coordinator (orchestrator)
    │
    ├─> Step 1: Assign task to worker
    ├─> Step 2: Execute task
    ├─> Step 3: Save checkpoint (if requested)
    ├─> Step 4: Resume from checkpoint
    └─> Step 5: Complete run
```

**Example: Coordinator orchestrates task execution**

```typescript
// File: apps/coordinator/src/index.ts
export class Coordinator {
  async orchestrateTaskExecution(run: TaskRun, attempt: TaskRunAttempt) {
    // Step 1: Find available worker
    const worker = await this.findWorker(run.machine);

    // Step 2: Execute task
    const result = await worker.execute({
      runId: run.id,
      payload: run.payload,
      context: { traceId: run.traceId },
    });

    // Step 3: Handle checkpoint (if requested)
    if (result.type === 'checkpoint') {
      await this.saveCheckpoint(run.id, result.checkpoint);
      await this.pauseExecution(run.id);
      return; // Pause here, resume later
    }

    // Step 4: Complete run
    if (result.type === 'success') {
      await this.completeRun(run.id, result.output);
    }

    // Step 5: Handle failure
    if (result.type === 'error') {
      await this.handleError(run.id, result.error);
    }
  }
}
```

**Alternative: Choreography (decentralized)**

```
Each service reacts to events independently:
  RunEngine → emits "run.created"
  Worker    → listens, executes task
  Worker    → emits "checkpoint.requested"
  RunEngine → listens, saves checkpoint
```

**Why Trigger.dev chose orchestration:**
- Easier to understand (central control flow)
- Simpler error handling (one place to retry)
- Better for complex workflows (multi-step tasks)

**Trade-off:**
- Coordinator is a single point of control (not failure—it's stateless)

**Reference:** Chris Richardson's [Saga Pattern](https://microservices.io/patterns/data/saga.html)

---

## Code Organization Patterns

### 1. Monorepo with Turbo

**Structure:**
```
trigger.dev/
├── apps/            # Applications (webapp, coordinator)
├── packages/        # Public packages (SDK, CLI)
└── internal-packages/  # Private packages (run-engine, database)
```

**Benefits:**
- **Atomic changes:** Update SDK + platform in one PR
- **Shared tooling:** ESLint, TypeScript, Vitest config
- **Type safety:** Internal packages can import each other

**Example: SDK uses internal database types**

```typescript
// packages/trigger-sdk/src/v3/types.ts
import type { TaskRun } from '@trigger.dev/database';

export type RunHandle = Pick<TaskRun, 'id' | 'status' | 'friendlyId'>;
```

**Tool:** [Turbo](https://turbo.build) for caching and parallel builds

---

### 2. Feature-Sliced Design (for Webapp)

**Routes organized by feature:**
```
apps/webapp/app/routes/
├── _app.tsx                    # Layout
├── _app.orgs.$organizationSlug/
│   ├── projects.$projectParam/
│   │   ├── env.$envParam/
│   │   │   ├── runs.$runParam.tsx     # Run detail page
│   │   │   ├── schedules.tsx          # Schedules page
│   │   │   └── settings.tsx           # Settings page
│   │   └── settings.tsx
│   └── settings.tsx
└── api/
    └── v1/
        ├── tasks/$taskId.trigger.ts   # API endpoint
        └── runs/$runId.ts
```

**Benefits:**
- **Colocation:** Related code lives together
- **Clear boundaries:** Each route is independent
- **Easy deletion:** Remove a feature by deleting its directory

---

### 3. Repository Pattern (Data Access)

**Definition:** Abstract database access behind interfaces.

**Example:**

```typescript
// File: apps/webapp/app/models/taskRun.server.ts
export class TaskRunRepository {
  async findById(id: string): Promise<TaskRun | null> {
    return await db.taskRun.findUnique({
      where: { id },
      include: {
        attempts: true,
        checkpoints: true,
      },
    });
  }

  async findPending(limit: number): Promise<TaskRun[]> {
    return await db.taskRun.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async updateStatus(id: string, status: TaskRunStatus): Promise<void> {
    await db.taskRun.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });
  }
}
```

**Benefits:**
- **Testable:** Can mock repository in tests
- **Swap implementations:** Could switch from Prisma to Drizzle later
- **Consistent queries:** Reuse common queries

---

## Resilience Patterns

### 1. Retry with Exponential Backoff

**Implementation:**

```typescript
// File: packages/trigger-sdk/src/v3/retry.ts
export function calculateBackoff(
  attempt: number,
  config: RetryConfig
): number {
  const { factor = 2, minTimeoutInMs = 1000, maxTimeoutInMs = 60000, randomize = true } = config;

  // Exponential: 1s, 2s, 4s, 8s, 16s...
  let delay = Math.min(
    minTimeoutInMs * Math.pow(factor, attempt - 1),
    maxTimeoutInMs
  );

  // Add jitter to prevent thundering herd
  if (randomize) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return delay;
}
```

**Usage:**
```typescript
task({
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    randomize: true,
  },
  run: async (payload) => {
    // Will retry: 1s, ~2s, ~4s if fails
  },
});
```

**Reference:** AWS Architecture Blog - [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

---

### 2. Bulkhead (Queue Isolation)

**Definition:** Isolate resources to prevent cascading failures.

**Example: Separate queues for different task types**

```typescript
// High-priority queue (fast tasks)
const apiQueue = queue({
  name: 'api-calls',
  concurrencyLimit: 10,
});

// Low-priority queue (slow tasks)
const videoQueue = queue({
  name: 'video-processing',
  concurrencyLimit: 2,
});

// If video-processing fails, api-calls are unaffected
```

**Benefits:**
- Prevents resource starvation (slow tasks don't block fast ones)
- Isolates failures (one queue failing doesn't affect others)

---

### 3. Idempotency

**Definition:** An operation can be safely retried without side effects.

**Implementation:**

```typescript
// File: packages/trigger-sdk/src/v3/shared.ts
await myTask.trigger(payload, {
  idempotencyKey: 'unique-key-123',
});

// If triggered again with same key, returns existing run
```

**Server-side enforcement:**

```typescript
// File: apps/webapp/app/routes/api/v1/tasks/$taskId.trigger.ts
export async function action({ request, params }: ActionArgs) {
  const { payload, options } = await request.json();

  // Check for existing run with idempotency key
  const existing = await db.taskRun.findUnique({
    where: { idempotencyKey: options.idempotencyKey },
  });

  if (existing) {
    return json({ id: existing.id }); // Return existing, don't create duplicate
  }

  // Create new run
  const run = await db.taskRun.create({
    data: {
      idempotencyKey: options.idempotencyKey,
      // ...
    },
  });

  return json({ id: run.id });
}
```

**Benefits:**
- Safe retries (won't charge customer twice, won't send duplicate emails)
- Exactly-once semantics

---

## Testing Strategies

### 1. Unit Tests (Vitest)

**Example: Testing retry logic**

```typescript
// File: packages/trigger-sdk/src/v3/retry.test.ts
import { describe, it, expect } from 'vitest';
import { calculateBackoff } from './retry';

describe('calculateBackoff', () => {
  it('should calculate exponential backoff', () => {
    const config = {
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 60000,
      randomize: false,
    };

    expect(calculateBackoff(1, config)).toBe(1000);  // 1s
    expect(calculateBackoff(2, config)).toBe(2000);  // 2s
    expect(calculateBackoff(3, config)).toBe(4000);  // 4s
    expect(calculateBackoff(4, config)).toBe(8000);  // 8s
  });

  it('should respect max timeout', () => {
    const config = {
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 5000,
      randomize: false,
    };

    expect(calculateBackoff(10, config)).toBe(5000); // Capped at max
  });
});
```

**Coverage:** ~40 unit tests in `/packages/trigger-sdk/src/v3/*.test.ts`

---

### 2. Integration Tests (Testcontainers)

**Example: Testing end-to-end task execution**

```typescript
// File: tests/integration/task-execution.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { task } from '@trigger.dev/sdk/v3';

describe('Task Execution', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;

  beforeAll(async () => {
    // Start real Postgres and Redis containers
    postgres = await new GenericContainer('postgres:14')
      .withExposedPorts(5432)
      .start();

    redis = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .start();

    // Set env vars
    process.env.DATABASE_URL = `postgresql://postgres@${postgres.getHost()}:${postgres.getMappedPort(5432)}/test`;
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  });

  afterAll(async () => {
    await postgres.stop();
    await redis.stop();
  });

  it('should execute task end-to-end', async () => {
    const testTask = task({
      id: 'integration-test',
      run: async (payload: { value: number }) => {
        return { result: payload.value * 2 };
      },
    });

    const run = await testTask.trigger({ value: 10 });

    // Wait for completion
    const result = await waitForCompletion(run.id);

    expect(result.status).toBe('COMPLETED_SUCCESSFULLY');
    expect(result.output.result).toBe(20);
  });
});
```

**Benefits:**
- Tests real database/Redis (not mocks)
- Catches integration issues
- Runs in CI (ephemeral containers)

---

### 3. E2E Tests (Playwright)

**Example: Testing dashboard UI**

```typescript
// File: tests/e2e/trigger-task.spec.ts
import { test, expect } from '@playwright/test';

test('user can trigger task from dashboard', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3030/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.click('button[type="submit"]');

  // Navigate to tasks
  await page.goto('http://localhost:3030/tasks');

  // Trigger task
  await page.click('button[aria-label="Trigger Task"]');
  await page.fill('textarea[name="payload"]', '{"value": 10}');
  await page.click('button[type="submit"]');

  // Verify run created
  await expect(page.locator('text=Run created')).toBeVisible();

  // Wait for completion (with timeout)
  await expect(page.locator('text=COMPLETED_SUCCESSFULLY')).toBeVisible({
    timeout: 10000,
  });
});
```

---

## Key Takeaways

1. **Event-Driven Architecture** enables loose coupling and scalability
2. **Domain-Driven Design** keeps complex logic organized and understandable
3. **CQRS** separates writes (consistency) from reads (performance)
4. **Resilience patterns** (retry, bulkhead, idempotency) make the system robust
5. **Testing at multiple levels** (unit, integration, E2E) ensures quality

---

## Further Reading

**Books:**
- *Domain-Driven Design* by Eric Evans (2003)
- *Enterprise Integration Patterns* by Hohpe & Woolf (2003)
- *Release It!* by Michael Nygard (2018) - Resilience patterns

**Articles:**
- Martin Fowler: [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- Chris Richardson: [Saga Pattern](https://microservices.io/patterns/data/saga.html)
- AWS: [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

**Next in series:** [Part 4: Extending and Integrating →](./04-extending-integrating.md)

---

**Did you find this useful?** Star the [repository](https://github.com/triggerdotdev/trigger.dev), join the [Discord](https://trigger.dev/discord), or share this post!
