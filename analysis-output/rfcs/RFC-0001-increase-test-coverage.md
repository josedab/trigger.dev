# RFC-0001: Increase Test Coverage

**Status:** Draft
**Author:** Technical Analysis Team
**Created:** November 16, 2025
**Analysis Commit:** [`19fa669`](https://github.com/triggerdotdev/trigger.dev/commit/19fa66931819371d607eff001b561aa783547734)

---

## Summary

Increase test coverage from current **~5%** to **30%+** by adding unit, integration, and E2E tests for critical paths. Focus initially on high-risk areas: RunEngine, Coordinator, CheckpointSystem, and SDK trigger logic.

---

## Motivation

### Current State
- **Test files:** 85 out of 1,724 TypeScript files (~4.9%)
- **Coverage:** Estimated < 10% (no automated tracking)
- **Critical paths:** Under-tested (checkpoint, retry, queue logic)

**Risks:**
- ⚠️ Regressions introduced during refactoring
- ⚠️ Difficult to validate bug fixes
- ⚠️ Slows down development (fear of breaking things)
- ⚠️ Hard to onboard new engineers (no reference tests)

### Desired State
- **Coverage:** 30%+ overall, 80%+ for critical paths
- **Automated tracking:** Codecov integration
- **CI enforcement:** PRs must maintain or improve coverage
- **Test categories:** Unit (60%), Integration (30%), E2E (10%)

---

## Detailed Design

### Phase 1: Infrastructure Setup (2 days)

#### 1.1 Add Coverage Tooling

**Install dependencies:**
```bash
pnpm add -D @vitest/coverage-v8 codecov
```

**Configure Vitest** (`vitest.config.ts`):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'packages/*/src/**/*.ts',
        'internal-packages/*/src/**/*.ts',
        'apps/*/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/node_modules/**',
        '**/dist/**',
      ],
      all: true,
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 30,
        statements: 30,
      },
    },
  },
});
```

**Add CI job** (`.github/workflows/test-coverage.yml`):
```yaml
name: Test Coverage

on:
  pull_request:
  push:
    branches: [main]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm test --coverage

      - name: Upload to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests

      - name: Comment PR with coverage
        uses: codecov/codecov-action@v3
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
```

**Effort:** 1 day

---

### Phase 2: Critical Path Tests (5 days)

#### 2.1 RunEngine Tests

**Priority:** **Critical** (core execution logic)

**Test file:** `internal-packages/run-engine/src/engine/index.test.ts`

**Coverage targets:**
- `dequeueAndExecute()`: 80%
- `handleResult()`: 80%
- `handleCheckpoint()`: 90%
- `handleRetry()`: 85%

**Example tests:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunEngine } from './index';
import { PrismaClient } from '@trigger.dev/database';
import { Redis } from 'ioredis';

describe('RunEngine', () => {
  let engine: RunEngine;
  let prisma: PrismaClient;
  let redis: Redis;

  beforeEach(() => {
    prisma = new PrismaClient();
    redis = new Redis();
    engine = new RunEngine(prisma, redis);
  });

  describe('dequeueAndExecute', () => {
    it('should dequeue pending run and create attempt', async () => {
      // Arrange
      const run = await prisma.taskRun.create({
        data: {
          id: 'run_test',
          status: 'PENDING',
          payload: JSON.stringify({ test: true }),
        },
      });
      await redis.zadd('queue:main', Date.now(), run.id);

      // Act
      await engine.dequeueAndExecute();

      // Assert
      const updatedRun = await prisma.taskRun.findUnique({
        where: { id: run.id },
      });
      expect(updatedRun?.status).toBe('STARTED');

      const attempt = await prisma.taskRunAttempt.findFirst({
        where: { taskRunId: run.id },
      });
      expect(attempt).toBeDefined();
      expect(attempt?.attemptNumber).toBe(1);
    });

    it('should acquire distributed lock before execution', async () => {
      // Arrange
      const run = await prisma.taskRun.create({
        data: { id: 'run_test', status: 'PENDING' },
      });
      await redis.zadd('queue:main', Date.now(), run.id);

      // Simulate another worker acquiring lock
      await redis.set(`lock:run:${run.id}`, 'worker-2', 'NX', 'EX', 300);

      // Act
      await engine.dequeueAndExecute();

      // Assert - should not update run (lock already held)
      const updatedRun = await prisma.taskRun.findUnique({
        where: { id: run.id },
      });
      expect(updatedRun?.status).toBe('PENDING');
    });

    it('should handle checkpoint request', async () => {
      // Arrange
      const run = await prisma.taskRun.create({
        data: { id: 'run_test', status: 'EXECUTING' },
      });

      // Act
      await engine.handleCheckpoint(run.id, {
        name: 'step1',
        state: { progress: 50 },
      });

      // Assert
      const checkpoint = await prisma.taskRunCheckpoint.findFirst({
        where: {
          taskRunId: run.id,
          checkpointName: 'step1',
        },
      });
      expect(checkpoint).toBeDefined();
      expect(checkpoint?.state).toEqual({ progress: 50 });

      const updatedRun = await prisma.taskRun.findUnique({
        where: { id: run.id },
      });
      expect(updatedRun?.status).toBe('WAITING');
    });
  });

  describe('retry logic', () => {
    it('should retry failed run with exponential backoff', async () => {
      // Arrange
      const run = await prisma.taskRun.create({
        data: {
          id: 'run_test',
          status: 'STARTED',
          retry: JSON.stringify({
            maxAttempts: 3,
            factor: 2,
            minTimeoutInMs: 1000,
          }),
        },
      });
      await prisma.taskRunAttempt.create({
        data: {
          taskRunId: run.id,
          attemptNumber: 1,
          status: 'FAILED',
        },
      });

      // Act
      await engine.handleRetry(run.id, new Error('Test error'));

      // Assert
      const attempt2 = await prisma.taskRunAttempt.findFirst({
        where: {
          taskRunId: run.id,
          attemptNumber: 2,
        },
      });
      expect(attempt2).toBeDefined();
      expect(attempt2?.status).toBe('QUEUED');

      // Check backoff delay (2^1 * 1000ms = 2000ms)
      const queuedAt = await redis.zscore('queue:main', run.id);
      expect(queuedAt).toBeGreaterThan(Date.now() + 1900);
    });

    it('should mark run as FAILED after max attempts', async () => {
      // Arrange
      const run = await prisma.taskRun.create({
        data: {
          id: 'run_test',
          status: 'STARTED',
          retry: JSON.stringify({ maxAttempts: 2 }),
        },
      });
      await prisma.taskRunAttempt.createMany({
        data: [
          { taskRunId: run.id, attemptNumber: 1, status: 'FAILED' },
          { taskRunId: run.id, attemptNumber: 2, status: 'FAILED' },
        ],
      });

      // Act
      await engine.handleRetry(run.id, new Error('Final error'));

      // Assert
      const updatedRun = await prisma.taskRun.findUnique({
        where: { id: run.id },
      });
      expect(updatedRun?.status).toBe('FAILED');
    });
  });
});
```

**Effort:** 2 days

---

#### 2.2 SDK Tests

**Priority:** **Critical** (user-facing API)

**Test file:** `packages/trigger-sdk/src/v3/shared.test.ts`

**Coverage targets:**
- `task()` factory: 80%
- `trigger()` method: 85%
- `triggerAndWait()` method: 85%
- `batchTrigger()` method: 75%

**Example tests:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { task } from './shared';

describe('task()', () => {
  it('should create task with default config', () => {
    const myTask = task({
      id: 'test-task',
      run: async (payload: { message: string }) => {
        return { processed: true };
      },
    });

    expect(myTask.id).toBe('test-task');
    expect(myTask.run).toBeDefined();
  });

  it('should trigger task and return RunHandle', async () => {
    const myTask = task({
      id: 'test-task',
      run: async (payload) => ({ result: payload.value * 2 }),
    });

    const run = await myTask.trigger({ value: 5 });

    expect(run.id).toMatch(/^run_/);
    expect(run.taskIdentifier).toBe('test-task');
  });

  it('should wait for task completion with triggerAndWait', async () => {
    const myTask = task({
      id: 'test-task',
      run: async (payload) => ({ result: payload.value * 2 }),
    });

    const result = await myTask.triggerAndWait({ value: 5 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.result).toBe(10);
    }
  });

  it('should handle schema validation with schemaTask', async () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().min(18),
    });

    const myTask = schemaTask({
      id: 'schema-task',
      schema,
      run: async (payload) => ({ valid: true }),
    });

    // Valid payload
    const result = await myTask.trigger({
      email: 'test@example.com',
      age: 25,
    });
    expect(result.id).toBeDefined();

    // Invalid payload - should throw
    await expect(
      myTask.trigger({ email: 'invalid', age: 15 })
    ).rejects.toThrow();
  });
});
```

**Effort:** 1 day

---

#### 2.3 Integration Tests

**Priority:** **High** (end-to-end flows)

**Test file:** `tests/integration/task-execution.test.ts`

**Scenarios:**
- ✅ Trigger → Execute → Complete (happy path)
- ✅ Trigger → Checkpoint → Resume → Complete
- ✅ Trigger → Fail → Retry → Complete
- ✅ Trigger → Fail (max retries) → Mark FAILED
- ✅ Batch trigger → Multiple runs

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { task } from '@trigger.dev/sdk/v3';
import { PrismaClient } from '@trigger.dev/database';

describe('Task Execution Integration', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Start Postgres via Testcontainers
    postgres = await new GenericContainer('postgres:14')
      .withEnvironment({
        POSTGRES_PASSWORD: 'password',
        POSTGRES_DB: 'trigger_test',
      })
      .withExposedPorts(5432)
      .start();

    // Start Redis
    redis = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .start();

    // Connect Prisma
    const dbUrl = `postgresql://postgres:password@${postgres.getHost()}:${postgres.getMappedPort(5432)}/trigger_test`;
    process.env.DATABASE_URL = dbUrl;

    prisma = new PrismaClient();
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    // Run migrations
    await exec('pnpm prisma migrate deploy');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await postgres.stop();
    await redis.stop();
  });

  it('should execute task end-to-end', async () => {
    // Define task
    const testTask = task({
      id: 'integration-test',
      run: async (payload: { value: number }) => {
        return { result: payload.value * 2 };
      },
    });

    // Trigger
    const run = await testTask.trigger({ value: 10 });

    // Wait for completion (with timeout)
    const result = await waitForCompletion(run.id, { timeout: 5000 });

    // Assert
    expect(result.status).toBe('COMPLETED_SUCCESSFULLY');
    expect(result.output.result).toBe(20);
  });

  it('should handle checkpoint and resume', async () => {
    let checkpointCalled = false;

    const testTask = task({
      id: 'checkpoint-test',
      run: async (payload, ctx) => {
        const step1 = await expensiveOperation1();
        await ctx.checkpoint('step1', { step1Result: step1 });
        checkpointCalled = true;

        const step2 = await expensiveOperation2(step1);
        return { result: step2 };
      },
    });

    const run = await testTask.trigger({});

    // Wait for checkpoint
    await waitForStatus(run.id, 'WAITING');
    expect(checkpointCalled).toBe(true);

    // Verify checkpoint saved
    const checkpoint = await prisma.taskRunCheckpoint.findFirst({
      where: { taskRunId: run.id },
    });
    expect(checkpoint?.checkpointName).toBe('step1');

    // Resume (automatic in real system)
    await resumeRun(run.id);

    // Wait for final completion
    const result = await waitForCompletion(run.id);
    expect(result.status).toBe('COMPLETED_SUCCESSFULLY');
  });
});
```

**Effort:** 2 days

---

### Phase 3: Webapp & Routes Tests (3 days)

#### 3.1 API Route Tests

**Test files:**
- `apps/webapp/app/routes/api/v1/tasks/$taskId.trigger.test.ts`
- `apps/webapp/app/routes/api/v1/runs/$runId.test.ts`

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { createRemixStub } from '@remix-run/testing';
import { action as triggerAction } from './api/v1/tasks/$taskId.trigger';

describe('POST /api/v1/tasks/:taskId/trigger', () => {
  it('should create run with valid payload', async () => {
    const stub = createRemixStub([
      {
        path: '/api/v1/tasks/:taskId/trigger',
        action: triggerAction,
      },
    ]);

    const response = await stub.action('/api/v1/tasks/my-task/trigger', {
      method: 'POST',
      headers: { Authorization: 'Bearer test_key' },
      body: JSON.stringify({ payload: { test: true } }),
    });

    const data = await response.json();
    expect(data.id).toMatch(/^run_/);
    expect(data.status).toBe('PENDING');
  });

  it('should reject unauthorized requests', async () => {
    const response = await stub.action('/api/v1/tasks/my-task/trigger', {
      method: 'POST',
      headers: {}, // No auth header
    });

    expect(response.status).toBe(401);
  });

  it('should validate payload against schema', async () => {
    // Task with Zod schema
    const response = await stub.action('/api/v1/tasks/schema-task/trigger', {
      method: 'POST',
      body: JSON.stringify({ payload: { invalid: 'data' } }),
    });

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('validation');
  });
});
```

**Effort:** 1 day

---

#### 3.2 Real-time Tests

**Test file:** `apps/webapp/app/services/realtime.test.ts`

**Scenarios:**
- ✅ WebSocket connection establishment
- ✅ Run status updates emitted
- ✅ Log streaming
- ✅ Disconnect/reconnect handling

**Effort:** 1 day

---

#### 3.3 E2E Tests (Playwright)

**Test file:** `tests/e2e/task-trigger.spec.ts`

**Scenarios:**
- ✅ User triggers task from dashboard
- ✅ Live log streaming displayed
- ✅ Run status updates in real-time
- ✅ Output displayed on completion

**Effort:** 1 day

---

## Example Usage

### Before (No Tests)
```bash
$ pnpm test
# 85 test files across entire codebase
# No coverage tracking
# Fear of refactoring
```

### After (With Tests)
```bash
$ pnpm test --coverage

 ✓ packages/trigger-sdk/src/v3/shared.test.ts (15 tests)
 ✓ internal-packages/run-engine/src/engine/index.test.ts (28 tests)
 ✓ apps/webapp/app/routes/api/v1/tasks/$taskId.trigger.test.ts (12 tests)

Test Files  45 passed (45)
     Tests  250 passed (250)
  Duration  12.5s

--------------------|---------|----------|---------|---------|
File                | % Stmts | % Branch | % Funcs | % Lines |
--------------------|---------|----------|---------|---------|
All files           |   32.1  |   28.5   |   31.8  |   32.3  |
 packages/trigger-sdk |  85.2  |   82.1   |   87.3  |   85.5  |
 run-engine        |   78.9  |   74.3   |   79.1  |   79.2  |
 webapp/routes     |   15.3  |   12.8   |   14.2  |   15.7  |
--------------------|---------|----------|---------|---------|
```

---

## Implementation Plan

### Milestone 1: Infrastructure (Week 1)
- ✅ Add Vitest coverage tooling
- ✅ Configure Codecov
- ✅ Add CI workflow
- ✅ Set baseline thresholds (10%)

**Owner:** DevOps + Lead Engineer
**Effort:** 2 days

---

### Milestone 2: Critical Paths (Week 2-3)
- ✅ RunEngine tests (80% coverage)
- ✅ SDK tests (80% coverage)
- ✅ Integration tests (5 scenarios)

**Owner:** Senior Engineer (Run Engine expert)
**Effort:** 5 days

---

### Milestone 3: Webapp & Routes (Week 4)
- ✅ API route tests
- ✅ Real-time tests
- ✅ E2E tests (Playwright)

**Owner:** Full-stack Engineer
**Effort:** 3 days

---

### Milestone 4: Continuous Improvement (Ongoing)
- ✅ Increase thresholds: 10% → 20% → 30%
- ✅ Add tests for new features (mandatory)
- ✅ Quarterly coverage reviews

**Owner:** Entire team
**Effort:** Ongoing

---

## Backwards Compatibility

✅ **No breaking changes** - this is purely additive.

**Risk:** None (tests don't affect runtime)

---

## Alternatives Considered

### Alternative 1: Continue Without Tests
**Pros:** No effort required
**Cons:** High bug risk, slow development, hard to onboard

**Verdict:** ❌ Rejected (unsustainable)

---

### Alternative 2: Aim for 80%+ Coverage Immediately
**Pros:** Best quality
**Cons:** Too slow (3+ months)

**Verdict:** ❌ Rejected (diminishing returns)

---

### Alternative 3: 30% Coverage (Chosen)
**Pros:** Balances quality and speed
**Cons:** Still requires discipline

**Verdict:** ✅ **Chosen** (pragmatic approach)

---

## Open Questions

1. **What coverage threshold should fail CI?**
   - **Proposal:** Start at 10%, increase to 30% over 3 months

2. **Should we enforce 80% coverage on new code?**
   - **Proposal:** Yes, via PR checks

3. **Who reviews test quality?**
   - **Proposal:** Tech lead + peer review

---

## Success Criteria

### Week 4:
- ✅ Coverage infrastructure in place
- ✅ Codecov reporting to PRs
- ✅ 15%+ overall coverage

### Month 3:
- ✅ 30%+ overall coverage
- ✅ 80%+ coverage on critical paths
- ✅ All PRs maintain/improve coverage

### Month 6:
- ✅ 50%+ overall coverage
- ✅ Zero critical bugs due to missing tests
- ✅ Onboarding time reduced 30%

---

## Dependencies

- **Blockers:** None
- **Blocked by:** None
- **Enables:** RFC-0002 (refactoring), RFC-0004 (upgrades)

---

## Appendix: Test Template

**File:** `tests/__template__.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('functionName', () => {
    it('should handle happy path', () => {
      // Arrange
      const input = { test: true };

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBeDefined();
    });

    it('should handle error case', () => {
      // Assert error thrown
      expect(() => functionUnderTest(null)).toThrow();
    });
  });
});
```

---

**Status:** Ready for review
**Next:** Implementation in Sprint 1
