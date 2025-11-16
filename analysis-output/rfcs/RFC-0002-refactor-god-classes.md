# RFC-0002: Refactor God Classes (RunEngine, Coordinator)

**Status:** Draft
**Priority:** P1 (Strategic)
**Effort:** 6 days
**Impact:** 5/5 (Critical for maintainability)

---

## Summary

Refactor `RunEngine` (~57KB) and `Coordinator` (~57KB) into smaller, focused classes using the **Subsystem Pattern**. This improves maintainability, testability, and onboarding.

---

## Motivation

### Problem: God Classes
**Current state:**
- `RunEngine`: ~57KB, 20+ responsibilities
- `Coordinator`: ~57KB, handles orchestration + communication + state
- **Consequences:**
  - Hard to understand (cognitive overload)
  - Difficult to test (too many dependencies)
  - Merge conflicts (everyone edits same file)

**Example (current):**
```typescript
class RunEngine {
  async dequeueAndExecute() { /*...*/ }
  async handleCheckpoint() { /*...*/ }
  async handleRetry() { /*...*/ }
  async handleBatch() { /*...*/ }
  async handleWaitpoint() { /*...*/ }
  async handleSchedule() { /*...*/ }
  // ... 15 more methods
}
```

---

## Detailed Design

### Refactored Architecture

**RunEngine → 6 Subsystems:**
```
RunEngine (Facade)
├── DequeueSystem
│   └── Responsibilities: Queue polling, lock acquisition
├── AttemptSystem
│   └── Responsibilities: Attempt lifecycle, retry logic
├── CheckpointSystem
│   └── Responsibilities: Checkpoint CRUD, state serialization
├── WaitpointSystem
│   └── Responsibilities: Human-in-the-loop pauses
├── BatchSystem
│   └── Responsibilities: Batch operations
└── TelemetrySystem
    └── Responsibilities: Metrics, traces, events
```

**Example (refactored):**
```typescript
// internal-packages/run-engine/src/systems/DequeueSystem.ts
export class DequeueSystem {
  constructor(
    private redis: Redis,
    private lockManager: LockManager
  ) {}

  async dequeue(): Promise<TaskRun | null> {
    // 1. Get next run from queue
    const runId = await this.redis.zrange('queue:main', 0, 0);
    if (!runId) return null;

    // 2. Acquire distributed lock
    const locked = await this.lockManager.acquire(runId);
    if (!locked) return null;

    // 3. Return run
    return await this.db.taskRun.findUnique({ where: { id: runId } });
  }
}

// internal-packages/run-engine/src/systems/CheckpointSystem.ts
export class CheckpointSystem {
  async save(runId: string, name: string, state: unknown): Promise<void> {
    await this.db.taskRunCheckpoint.create({
      data: {
        taskRunId: runId,
        checkpointName: name,
        state: JSON.stringify(state),
      },
    });
  }

  async restore(runId: string): Promise<Checkpoint | null> {
    return await this.db.taskRunCheckpoint.findFirst({
      where: { taskRunId: runId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

// internal-packages/run-engine/src/RunEngine.ts
export class RunEngine {
  private dequeue: DequeueSystem;
  private checkpoints: CheckpointSystem;
  private attempts: AttemptSystem;

  constructor(deps: Dependencies) {
    this.dequeue = new DequeueSystem(deps.redis, deps.lockManager);
    this.checkpoints = new CheckpointSystem(deps.db);
    this.attempts = new AttemptSystem(deps.db);
  }

  async processNextRun(): Promise<void> {
    const run = await this.dequeue.dequeue();
    if (!run) return;

    const attempt = await this.attempts.create(run);
    await this.coordinator.execute(run, attempt);
  }

  async handleCheckpoint(runId: string, checkpoint: CheckpointData): Promise<void> {
    await this.checkpoints.save(runId, checkpoint.name, checkpoint.state);
    await this.attempts.pause(runId);
  }
}
```

---

## Implementation Plan

### Phase 1: Extract Systems (Week 1)
1. Create `systems/` directory
2. Extract `DequeueSystem` (1 day)
3. Extract `CheckpointSystem` (1 day)
4. Extract `AttemptSystem` (1 day)

### Phase 2: Integrate & Test (Week 2)
5. Update `RunEngine` to use systems (1 day)
6. Write tests for each system (2 days)
7. Integration test full flow (1 day)

**Total:** 6 days

---

## Success Criteria

- ✅ RunEngine.ts: 57KB → <15KB
- ✅ Each system: <200 lines
- ✅ Test coverage: 80%+ per system
- ✅ No regressions (all tests pass)

---

## Backwards Compatibility

✅ **No breaking changes** (internal refactoring only)

---

**Status:** Ready for Sprint 2
