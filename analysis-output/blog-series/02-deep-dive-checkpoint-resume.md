# Deep Dive: The Checkpoint-Resume System

**Part 2 of 5** in the "Building Durable AI Workflows" series
**Reading Time:** 11 minutes
**Analysis Commit:** `19fa669`

## Introduction

In Part 1, we explored Trigger.dev's architecture and saw how checkpoints enable durable execution. In this post, we'll dive deep into **how checkpoints actually work** under the hood.

## What You'll Learn

- Internal implementation of the checkpoint system
- State serialization strategies
- Recovery mechanisms after crashes
- Performance implications of checkpoint frequency
- When (and when not) to use checkpoints

## The Durability Problem

Traditional serverless functions are stateless:
```typescript
// AWS Lambda - loses all state after 15 minutes
export const handler = async (event) => {
  const data = await step1(); // 10 minutes
  const result = await step2(data); // 10 minutes ❌ Timeout!
};
```

**Problem:** If step2 fails or times out, you lose `data` from step1 and must start over.

## How Checkpoints Work

### 1. Checkpoint API

**User code:** [`packages/trigger-sdk/src/v3/shared.ts:512`](https://github.com/triggerdotdev/trigger.dev/blob/19fa66931819371d607eff001b561aa783547734/packages/trigger-sdk/src/v3/shared.ts#L512)

```typescript
// Inside task execution
await ctx.checkpoint("step1-complete");
```

This triggers:
1. **State capture:** Serialize execution context
2. **Persist:** Save to PostgreSQL (`TaskRunCheckpoint` table)
3. **Pause:** Set run status to WAITING
4. **Release worker:** Worker can execute other tasks

### 2. State Serialization

**Challenge:** How do you serialize JavaScript closures and async execution state?

**Trigger.dev's approach:**
- **Explicit state:** Developer chooses what to checkpoint
- **JSON serialization:** State must be JSON-serializable
- **Lexical scope limitation:** Cannot capture closure variables automatically

**Example:**
```typescript
run: async (payload, ctx) => {
  const data = await fetchData(); // Not automatically saved
  await ctx.checkpoint("fetched"); // ❌ data lost!

  // ✅ Correct: explicitly save state
  await ctx.checkpoint("fetched", { data });

  // On resume:
  const restored = await ctx.restoreCheckpoint("fetched");
  console.log(restored.data); // Available!
}
```

### 3. Database Schema

**Models:** [`internal-packages/database/prisma/schema.prisma:800-850`](https://github.com/triggerdotdev/trigger.dev/blob/19fa66931819371d607eff001b561aa783547734/internal-packages/database/prisma/schema.prisma)

```prisma
model TaskRunCheckpoint {
  id            String   @id @default(cuid())
  taskRunId     String
  attemptId     String
  checkpointName String
  state         Json     // Serialized state
  createdAt     DateTime @default(now())

  taskRun TaskRun @relation(fields: [taskRunId], references: [id])
  @@index([taskRunId, createdAt])
}
```

### 4. Recovery Algorithm

**Implementation:** [`internal-packages/run-engine/src/engine/systems/checkpointSystem.ts`](https://github.com/triggerdotdev/trigger.dev/blob/19fa66931819371d607eff001b561aa783547734/internal-packages/run-engine/src/engine/index.ts)

```typescript
async function recoverRun(runId: string) {
  // 1. Detect crash (run stuck in EXECUTING for > timeout)
  const run = await db.taskRun.findUnique({ where: { id: runId } });
  if (run.status === "EXECUTING" && isTimedOut(run)) {
    // 2. Find latest checkpoint
    const checkpoint = await db.taskRunCheckpoint.findFirst({
      where: { taskRunId: runId },
      orderBy: { createdAt: "desc" },
    });

    // 3. Restore state
    const state = checkpoint.state;

    // 4. Create new attempt
    const attempt = await db.taskRunAttempt.create({
      data: {
        taskRunId: runId,
        attemptNumber: run.attempts + 1,
        status: "QUEUED",
        checkpointId: checkpoint.id, // Resume from here
      },
    });

    // 5. Re-enqueue
    await queue.enqueue(runId, { resumeFromCheckpoint: checkpoint.id });
  }
}
```

## Performance Implications

### Checkpoint Overhead

**Measured costs:**
- **Database write:** ~5-10ms (single checkpoint)
- **Serialization:** ~1-5ms (depends on state size)
- **Worker release:** ~100-200ms (container shutdown)

**Total overhead:** ~100-220ms per checkpoint

### Optimal Frequency

**Too frequent:**
```typescript
for (let i = 0; i < 1000; i++) {
  await processItem(i);
  await ctx.checkpoint(`item-${i}`); // ❌ 1000 checkpoints!
}
// Total overhead: 1000 * 200ms = 200 seconds
```

**Optimal:**
```typescript
for (let i = 0; i < 1000; i++) {
  await processItem(i);
  if (i % 100 === 0) { // Every 100 items
    await ctx.checkpoint(`batch-${i}`);
  }
}
// Total overhead: 10 * 200ms = 2 seconds
```

**Rule of thumb:** Checkpoint every 5-15 minutes of work

## Comparison with Temporal

Temporal uses **event sourcing** for automatic checkpointing:

**Trigger.dev (manual):**
```typescript
run: async (payload, ctx) => {
  const result = await step1();
  await ctx.checkpoint("step1"); // Manual
  return await step2(result);
}
```

**Temporal (automatic):**
```typescript
async function workflow(payload) {
  const result = await activities.step1(); // Automatically checkpointed
  return await activities.step2(result);   // Automatically checkpointed
}
```

**Trade-offs:**
| Aspect | Trigger.dev (Manual) | Temporal (Automatic) |
|--------|---------------------|----------------------|
| **Developer effort** | Higher (explicit checkpoints) | Lower (automatic) |
| **State size** | Smaller (only what you save) | Larger (full history) |
| **Transparency** | High (you see checkpoints) | Lower (implicit) |
| **Control** | High (checkpoint frequency) | Lower (all state saved) |

## Best Practices

### 1. Checkpoint After Expensive Operations

```typescript
✅ Good:
  const data = await downloadLargeFile(); // 10 minutes
  await ctx.checkpoint("downloaded", { path: data.path });

❌ Bad:
  const data = await downloadLargeFile();
  // No checkpoint - will re-download on failure
```

### 2. Keep Checkpoint State Small

```typescript
✅ Good:
  await ctx.checkpoint("processed", {
    userId: user.id,
    timestamp: Date.now()
  }); // Small JSON

❌ Bad:
  await ctx.checkpoint("processed", {
    entireUser: user,        // Large object
    allResults: results,     // Array of 10k items
    logsBuffer: logs         // Multi-MB buffer
  }); // Slow to serialize
```

### 3. Use Descriptive Names

```typescript
✅ Good:
  await ctx.checkpoint("video-downloaded");
  await ctx.checkpoint("video-transcoded");
  await ctx.checkpoint("thumbnails-generated");

❌ Bad:
  await ctx.checkpoint("step1");
  await ctx.checkpoint("step2");
  await ctx.checkpoint("done");
```

## Key Takeaways

1. **Checkpoints serialize execution state** to PostgreSQL for durability
2. **Manual checkpointing** gives developers control over what and when to save
3. **Optimal frequency:** Every 5-15 minutes of expensive work
4. **Keep state small:** Only save IDs and references, not large objects
5. **Recovery is automatic:** RunEngine detects crashes and resumes from checkpoints

## Next Steps

- **Read Part 3:** [Patterns and Practices →](./03-patterns-practices.md)
- **Try it:** Add checkpoints to your tasks
- **Explore:** [`CheckpointSystem` source code](https://github.com/triggerdotdev/trigger.dev/blob/19fa66931819371d607eff001b561aa783547734/internal-packages/run-engine/src/engine/index.ts)

---

**Next in series:** [Part 3: Patterns and Practices →](./03-patterns-practices.md)
