# ADR-0001: Manual Checkpoints for Durable Execution

**Status:** Accepted
**Date:** 2024-06-15
**Deciders:** Engineering Team
**Technical Story:** #1234 (Checkpoint System Design)

## Context

Trigger.dev needs durable execution: tasks must survive crashes and resume from where they left off. This solves the serverless timeout problem (AWS Lambda: 15 min, Vercel: 5 min).

**Requirements:**
- Tasks can run for hours/days
- Crashes don't lose work
- Users control when state is saved
- State size manageable (not GBs)

**Constraints:**
- Team size: 5 engineers
- Users: TypeScript developers
- Hosting: Self-hosted + cloud

## Decision

Implement **manual checkpoints** where developers explicitly save state:

```typescript
task({
  run: async (payload, ctx) => {
    const data = await step1();
    await ctx.checkpoint("step1", { data });

    const result = await step2(data);
    return result;
  }
})
```

**Key aspects:**
- Developer calls `await checkpoint(name, state)`
- State serialized to PostgreSQL
- Task pauses, releases worker
- On crash, resumes from last checkpoint

## Alternatives Considered

### Alternative 1: Automatic Checkpoints (Temporal-style)

**How it works:**
```typescript
// Every function call is automatically checkpointed
const data = await activities.step1(); // Auto checkpoint
const result = await activities.step2(data); // Auto checkpoint
```

**Pros:**
- No user code needed
- Complete execution history (all events stored)
- Time-travel debugging
- Replay capability

**Cons:**
- Larger state size (every function call saved)
- More complex internals (event sourcing)
- Less transparent (magic happening behind the scenes)
- Users can't control checkpoint frequency (performance/cost)

**Why rejected:**
- Team too small to maintain event sourcing infrastructure
- Users lose control over performance trade-offs
- Transparency valued for debugging

**Sources:**
- Temporal docs: https://docs.temporal.io/workflows
- Event Sourcing, Martin Fowler (2005)

---

### Alternative 2: No Checkpointing (Retry Only)

**How it works:**
```typescript
// If task fails, restart from beginning
task({
  run: async (payload) => {
    const data = await step1(); // Re-runs on failure
    const result = await step2(data);
    return result;
  }
})
```

**Pros:**
- Simplest implementation
- No state management needed

**Cons:**
- Wasteful (re-do expensive work)
- Doesn't solve timeout problem (can't pause)
- Idempotency required for all operations

**Why rejected:**
- Doesn't meet core requirement (long-running tasks)
- Wasteful for expensive operations (video processing, AI inference)

---

### Alternative 3: Automatic via Serialization (Durable Objects)

**How it works:**
- Serialize entire JavaScript execution state
- Resume from snapshot

**Pros:**
- No user code
- Complete state capture

**Cons:**
- Very complex (closures, async execution)
- Unpredictable state size
- Hard to debug (opaque state)

**Why rejected:**
- Too complex to implement reliably
- JavaScript doesn't support execution serialization natively

---

## Consequences

### Positive

**1. Developer control**
- Choose checkpoint frequency (balance durability vs. performance)
- Choose what to save (only IDs, not full objects)
- Predictable cost

**2. Transparency**
- Can see exactly when state is saved
- Easy to debug (checkpoint name shows in UI)
- State is JSON (can inspect in DB)

**3. Smaller state size**
- Only save what's needed (not entire execution history)
- Example: Save `userId`, not entire `User` object

**4. Simpler implementation**
- No event sourcing infrastructure
- Standard CRUD on PostgreSQL

### Negative

**1. User must remember**
- Developer must call `checkpoint()` explicitly
- Easy to forget (no compile-time check)
- **Mitigation:** Linter rule, docs, examples

**2. More verbose code**
```typescript
// Manual (more lines)
const data = await step1();
await ctx.checkpoint("step1", { data });
const result = await step2(data);

// Auto (fewer lines)
const data = await activities.step1();
const result = await activities.step2(data);
```

**3. Can't replay from arbitrary point**
- Can only resume from checkpoints (not between)
- **Mitigation:** Document best practices (checkpoint frequently)

### Neutral

**1. Different mental model**
- Not like Temporal (activities/workflows)
- Not like serverless (stateless functions)
- **Mitigation:** Clear documentation, examples

**2. Trade-off visibility**
- Users see checkpoint overhead (~100-200ms)
- Can optimize by reducing frequency
- **Benefit:** Performance is controllable

---

## Implementation

Completed in PR #1234 (merged 2024-06-20)

**Components:**
- [x] `CheckpointSystem` class (internal-packages/run-engine)
- [x] Database schema (`TaskRunCheckpoint` table)
- [x] SDK API (`ctx.checkpoint(name, state)`)
- [x] Recovery logic (crash detection → resume)
- [x] Tests (unit + integration)
- [x] Documentation (docs.trigger.dev)

**Performance:**
- Checkpoint latency: ~100-200ms (DB write + serialization)
- State size limit: 1 MB (configurable)
- Recovery time: ~2-5 seconds (cold start + state restore)

---

## References

**Internal:**
- Design doc: https://notion.so/triggerdotdev/checkpoint-design
- Prototype: https://github.com/triggerdotdev/trigger.dev/pull/1200

**External:**
- Temporal Workflows: https://docs.temporal.io/workflows
- Event Sourcing (Fowler): https://martinfowler.com/eaaDev/EventSourcing.html
- Durable Execution (research): https://arxiv.org/abs/2304.00642

**Alternatives analyzed:**
- Temporal: https://temporal.io
- Inngest: https://inngest.com (auto step functions)
- AWS Step Functions: https://aws.amazon.com/step-functions/

---

## Superseded By

None (still active as of 2025-11)

---

## Notes

**Team feedback (3 months later):**
- ✅ Developers like the control
- ⚠️  Some forget to checkpoint (addressed with linter)
- ✅ Easy to debug (checkpoint names helpful)
- Considering: Optional auto-checkpoint mode (RFC-0099)
