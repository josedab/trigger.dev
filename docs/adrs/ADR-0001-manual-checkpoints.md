# ADR-0001: Manual Checkpoints vs Automatic Checkpoints

**Status:** Accepted
**Date:** 2025-11-17
**Deciders:** Engineering Team, Product Team
**Tags:** architecture, core-feature, durability

## Context

Trigger.dev needs a mechanism to make long-running tasks durable and resumable. When a task crashes or is interrupted, we need to be able to resume from a known good state rather than restarting from the beginning.

There are two main approaches:
1. **Manual checkpoints**: Developers explicitly call `await ctx.checkpoint("name")` in their code
2. **Automatic checkpoints**: System automatically saves state at regular intervals or function boundaries

This decision is critical as it affects:
- Developer experience and ease of use
- System performance and overhead
- Reliability and predictability
- Debugging capabilities

## Decision

We will use **manual checkpoints** where developers explicitly control when state is saved.

**Key API:**
```typescript
export const processVideo = task({
  id: "process-video",
  run: async (payload, ctx) => {
    const video = await downloadVideo(payload.videoUrl);
    await ctx.checkpoint("downloaded"); // Explicit checkpoint

    const analyzed = await analyzeVideo(video);
    await ctx.checkpoint("analyzed"); // Explicit checkpoint

    return generateHighlights(analyzed);
  }
});
```

## Alternatives Considered

### Alternative 1: Automatic Checkpointing (Temporal-style)

**Description:**
Automatically save state at function boundaries, similar to Temporal's workflow approach. The system would intercept all async operations and create checkpoints transparently.

**Pros:**
- Zero developer cognitive load
- No chance of forgetting to checkpoint
- Simpler mental model for basic use cases

**Cons:**
- High performance overhead (100-200ms per checkpoint × potentially 100s of operations)
- Unpredictable behavior - developers don't know when state is saved
- Difficult to debug - checkpoint boundaries are invisible
- Large state storage costs - checkpoint after every operation
- Requires complex code instrumentation and AST manipulation
- Hard to optimize - can't skip unnecessary checkpoints

**Why not chosen:**
The performance overhead would be prohibitive for most real-world tasks. A task making 50 API calls would incur 5-10 seconds of checkpoint overhead alone. Additionally, the lack of developer control makes optimization impossible.

### Alternative 2: Hybrid Approach (Automatic + Manual Override)

**Description:**
Automatic checkpoints by default, but allow developers to disable or customize checkpoint points.

**Pros:**
- Easier for beginners (works automatically)
- Power users can optimize when needed
- Gradual learning curve

**Cons:**
- More complex system to build and maintain
- Two different mental models to learn
- Unclear default behavior could cause confusion
- Still requires code instrumentation
- Performance issues persist until developers add manual overrides

**Why not chosen:**
Adds complexity without solving the fundamental performance problem. Most developers would eventually need to learn manual checkpoints anyway for performance reasons, making the automatic mode a temporary crutch.

### Alternative 3: No Checkpoints (Simple Retry)

**Description:**
Don't implement checkpoints at all. Just retry failed tasks from the beginning.

**Pros:**
- Simplest implementation
- No state management complexity
- No performance overhead
- Easy to understand

**Cons:**
- Wasted compute on long-running tasks
- Expensive for tasks with costly operations (e.g., video processing)
- Poor developer experience for multi-hour tasks
- Not truly "durable execution"
- Fails Trigger.dev's core value proposition

**Why not chosen:**
Doesn't meet the core requirement of durable execution. Users would face massive compute costs and long retry times for tasks with expensive operations.

## Consequences

### Positive

- **Predictable performance**: Developers control when overhead occurs
- **Optimizable**: Can skip checkpoints for fast operations
- **Debuggable**: Clear visibility into recovery points
- **Cost-effective**: Only checkpoint when necessary (typical: 3-5 checkpoints per task)
- **Simple implementation**: No need for AST manipulation or code instrumentation
- **Clear mental model**: "Checkpoint after expensive or side-effectful operations"

### Negative

- **Developer responsibility**: Must remember to add checkpoints
- **Learning curve**: Requires understanding when to checkpoint
- **Inconsistent usage**: Different developers may checkpoint differently
- **Potential gaps**: Forgetting a checkpoint could waste compute

### Neutral

- **Trade-off accepted**: We chose predictability and performance over convenience
- **Documentation required**: Need clear guidelines on checkpoint best practices
- **Code review focus**: Teams should review checkpoint placement

## Implementation

### Required Changes

1. ✅ **Core API** (already implemented):
   ```typescript
   interface TaskContext {
     checkpoint(name: string): Promise<void>;
   }
   ```

2. ✅ **State serialization** (already implemented):
   - packages/run-engine/src/checkpoint.ts
   - Handles serialization, compression, and storage

3. ✅ **Recovery mechanism** (already implemented):
   - packages/run-engine/src/engine/resumeExecution.ts
   - Restores state from last checkpoint on retry

4. **Documentation needed**:
   - Best practices guide
   - Example patterns for common scenarios
   - Performance guidelines

### Checkpoint Best Practices

**DO checkpoint after:**
- ✅ Expensive API calls (>5 seconds)
- ✅ File uploads/downloads
- ✅ Database writes with side effects
- ✅ Payments or financial transactions
- ✅ External service integrations
- ✅ Every 5-15 minutes of computation

**DON'T checkpoint:**
- ❌ After every function call (too much overhead)
- ❌ Inside tight loops
- ❌ For fast operations (<100ms)
- ❌ Before pure computations (can re-run safely)

### Timeline

- **Phase 1** (Complete): Core implementation
- **Phase 2** (Complete): Integration with retry system
- **Phase 3** (Ongoing): Documentation and education
- **Phase 4** (Future): Tooling to suggest checkpoint placements

### Success Criteria

- ✅ Tasks can resume from last checkpoint on failure
- ✅ Checkpoint overhead <200ms per checkpoint
- ✅ State size remains manageable (<1MB typical)
- ✅ Developer satisfaction with API simplicity
- 🔄 Clear documentation and examples (in progress)

## References

- [Temporal's Deterministic Workflow Design](https://docs.temporal.io/workflows)
- [AWS Step Functions vs Temporal Comparison](https://temporal.io/blog/step-functions-vs-temporal)
- [Durable Execution Patterns](https://docs.trigger.dev/documentation/concepts/resumability)
- **Codebase**:
  - `packages/core/src/v3/tasks.ts:checkpoint()` - API definition
  - `internal-packages/run-engine/src/checkpoint.ts` - Implementation
  - `analysis-output/blog-series/02-deep-dive-checkpoint-resume.md` - Detailed analysis

## Notes

### Performance Data

From our analysis (commit `19fa66931819371d607eff001b561aa783547734`):

- Checkpoint latency: 100-220ms (average: 150ms)
- Typical task: 3-5 checkpoints
- Total overhead: 450-1,100ms per task
- State size: typically <100KB (gzip compressed)

**Example:**
```
Task: Process 1-hour video
- Download (30s) → checkpoint → +150ms
- Transcode (45min) → checkpoint → +150ms
- Upload (30s) → checkpoint → +150ms

Total overhead: 450ms / 46min = 0.016% overhead
```

The overhead is negligible compared to actual work, validating the manual approach.

### Future Considerations

1. **Linting tool**: Could build an ESLint rule to suggest checkpoints after expensive operations
2. **Telemetry**: Track checkpoint placement patterns to improve guidelines
3. **Warnings**: Runtime warnings for tasks >5min without checkpoints
4. **IDE integration**: VS Code extension to highlight recommended checkpoint locations

### Lessons Learned

This decision reflects our core philosophy: **Give developers power and control rather than magical abstraction**. We trust developers to make the right performance trade-offs for their specific use cases.
