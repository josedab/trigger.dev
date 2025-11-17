# RFC-0003: Add Architectural Decision Records (ADRs)

**Status:** Draft
**Priority:** P1 (Strategic)
**Effort:** 6 days
**Impact:** 4/5 (High - knowledge sharing, onboarding)

---

## Summary

Implement Architectural Decision Records (ADRs) to document key technical decisions, their context, alternatives considered, and consequences. This creates institutional knowledge and accelerates onboarding.

---

## Motivation

### Current Problem

**Lack of context:**
- New engineers ask "Why did we choose X over Y?"
- Decisions made in Slack/meetings are lost
- Repeated debates about already-decided topics
- Hard to understand trade-offs in architecture

**Example questions without answers:**
- Why manual checkpoints instead of automatic?
- Why PostgreSQL + Redis instead of pure event sourcing?
- Why Remix over Next.js?
- Why container-based workers instead of isolates?

**Consequences:**
- Slow onboarding (weeks to understand decisions)
- Wasted time re-debating settled questions
- Risk of reversing good decisions unknowingly
- Lost tribal knowledge when engineers leave

---

## Detailed Design

### ADR Format (Markdown)

**Template:** `.github/ADR-template.md`

```markdown
# ADR-XXXX: [Title]

**Status:** [Proposed | Accepted | Deprecated | Superseded]
**Date:** YYYY-MM-DD
**Deciders:** [Names]
**Technical Story:** [Issue/PR link]

## Context

What is the issue we're trying to solve? What factors are at play?
Include business context, technical constraints, team capacity.

## Decision

What decision did we make? Be specific and concrete.

## Alternatives Considered

### Alternative 1: [Name]
**Pros:**
- Benefit 1
- Benefit 2

**Cons:**
- Drawback 1
- Drawback 2

**Why rejected:** Clear reason

### Alternative 2: [Name]
...

## Consequences

### Positive
- What improves?
- What becomes easier?

### Negative
- What becomes harder?
- What technical debt are we accepting?

### Neutral
- What changes but isn't inherently good/bad?

## Implementation

- [ ] Task 1
- [ ] Task 2

## References

- [Link to discussion]
- [Link to prototype]
- [Link to benchmarks]
```

---

### Priority ADRs to Document

#### 1. ADR-0001: Manual Checkpoints vs. Automatic

**Context:** Durable execution requires state persistence. We had to choose between manual (Trigger.dev) vs. automatic (Temporal-style).

**Decision:** Manual checkpoints via `await ctx.checkpoint(name, state)`

**Alternatives:**
- **Automatic (Temporal):** Every function call is a checkpoint
  - Pros: No user code needed, complete history
  - Cons: Larger state, no control over granularity, complex internals
  - Why rejected: Less transparent, users don't control cost/performance

- **No checkpointing:** Rely on retries only
  - Pros: Simpler
  - Cons: Can't handle long-running tasks, wasteful retries
  - Why rejected: Doesn't solve timeout problem

**Consequences:**
- ✅ Positive: Developers control checkpoint frequency
- ✅ Positive: Smaller checkpoint state (only what's saved)
- ❌ Negative: Developers must remember to checkpoint
- ❌ Negative: More verbose code

**File:** `docs/adr/ADR-0001-manual-checkpoints.md`
**Effort:** 2 hours

---

#### 2. ADR-0002: PostgreSQL + Redis vs. Event Sourcing

**Context:** Task state persistence and queue management required data layer choice.

**Decision:** PostgreSQL (primary) + Redis (queue/cache)

**Alternatives:**
- **Event Sourcing (à la Temporal):** Store all events, rebuild state
  - Pros: Complete audit log, time-travel debugging, replay
  - Cons: Complex queries, eventual consistency, storage growth
  - Why rejected: Team expertise in RDBMS, simpler to query/debug

- **DynamoDB (AWS):** NoSQL with streams
  - Pros: Managed, scalable
  - Cons: Vendor lock-in, less flexible queries, eventual consistency
  - Why rejected: Self-hosting requirement

**Consequences:**
- ✅ Positive: Familiar technology, easy to query
- ✅ Positive: Strong consistency (PostgreSQL)
- ❌ Negative: No built-in audit log of all state changes
- ⚖️ Neutral: Need separate analytics DB (ClickHouse)

**File:** `docs/adr/ADR-0002-postgresql-redis.md`
**Effort:** 2 hours

---

#### 3. ADR-0003: Remix vs. Next.js for Webapp

**Context:** Full-stack framework choice for dashboard.

**Decision:** Remix 2.x

**Alternatives:**
- **Next.js:** Most popular React framework
  - Pros: Larger ecosystem, more examples
  - Cons: Complicated data fetching, RSC adds complexity
  - Why rejected: Remix's loader/action pattern is cleaner

- **SvelteKit:** Modern, fast
  - Pros: Smaller bundles, reactivity
  - Cons: Smaller ecosystem, team unfamiliar
  - Why rejected: Team expertise in React

**Consequences:**
- ✅ Positive: Clean data fetching (loaders/actions)
- ✅ Positive: Built-in form handling
- ❌ Negative: Smaller ecosystem than Next.js

**File:** `docs/adr/ADR-0003-remix-framework.md**
**Effort:** 1.5 hours

---

#### 4. ADR-0004: Container-Based Workers vs. Isolates

**Context:** Task execution environment choice.

**Decision:** Docker containers (and Kubernetes pods)

**Alternatives:**
- **V8 Isolates (Cloudflare Workers):** Lightweight, fast cold starts
  - Pros: <100ms cold start, efficient resource usage
  - Cons: Can't install system deps (FFmpeg, Chrome), limited Node.js APIs
  - Why rejected: Users need full Node.js runtime + system packages

- **AWS Lambda:** Serverless functions
  - Pros: Managed, auto-scaling
  - Cons: 15-minute timeout, vendor lock-in
  - Why rejected: Timeout is the problem we're solving

**Consequences:**
- ✅ Positive: Full Node.js runtime, custom dependencies
- ✅ Positive: Users can run Puppeteer, FFmpeg, Python scripts
- ❌ Negative: Slower cold starts (2-5 seconds)
- ❌ Negative: Higher memory overhead per worker

**File:** `docs/adr/ADR-0004-container-workers.md`
**Effort:** 2 hours

---

#### 5. ADR-0005: Monorepo with Turbo vs. Polyrepo

**Context:** Code organization for apps + packages.

**Decision:** pnpm monorepo with Turbo

**Alternatives:**
- **Polyrepo:** Separate repos for each package
  - Pros: Independent versioning, smaller clones
  - Cons: Harder to coordinate changes, version hell
  - Why rejected: Need to iterate across SDK + platform

- **Yarn workspaces:** Alternative monorepo tool
  - Pros: Similar features
  - Cons: Slower than pnpm, less strict
  - Why rejected: pnpm is faster, better at handling peer deps

**Consequences:**
- ✅ Positive: Single PR can update SDK + platform
- ✅ Positive: Shared tooling (ESLint, TypeScript, Vitest)
- ❌ Negative: Large repo (1,724 files can be slow)
- ⚖️ Neutral: Requires Turbo for efficient caching

**File:** `docs/adr/ADR-0005-monorepo-turbo.md`
**Effort:** 1.5 hours

---

#### 6. ADR-0006: OpenTelemetry for Observability

**Context:** Distributed tracing and observability stack.

**Decision:** OpenTelemetry (OTEL) across all services

**Alternatives:**
- **Datadog APM:** Commercial solution
  - Pros: All-in-one, great UI
  - Cons: Expensive, vendor lock-in
  - Why rejected: Self-hosting requirement, cost

- **Custom logging:** Build our own
  - Pros: Full control
  - Cons: Reinventing wheel, no standards
  - Why rejected: OTEL is industry standard

**Consequences:**
- ✅ Positive: Vendor-agnostic (can switch backends)
- ✅ Positive: Industry standard, good tooling
- ✅ Positive: Automatic instrumentation for Express, Prisma
- ❌ Negative: Learning curve for team

**File:** `docs/adr/ADR-0006-opentelemetry.md`
**Effort:** 1.5 hours

---

#### 7. ADR-0007: TypeScript Only (No JavaScript)

**Context:** Language choice for codebase.

**Decision:** TypeScript strict mode, no JavaScript

**Alternatives:**
- **JavaScript with JSDoc:** Type comments
  - Pros: No compilation step
  - Cons: Weaker type checking, verbose
  - Why rejected: Type safety is critical

- **Mixed TS/JS:** Allow both
  - Pros: Flexibility
  - Cons: Inconsistent, hard to enforce types
  - Why rejected: All-or-nothing for quality

**Consequences:**
- ✅ Positive: Excellent type safety (catch bugs at compile-time)
- ✅ Positive: Better IDE support (IntelliSense)
- ❌ Negative: Compilation step required

**File:** `docs/adr/ADR-0007-typescript-only.md`
**Effort:** 1 hour

---

#### 8. ADR-0008: Prisma vs. Drizzle for ORM

**Context:** Database ORM choice.

**Decision:** Prisma 4.x

**Alternatives:**
- **Drizzle:** Newer, TypeScript-first ORM
  - Pros: Lighter, SQL-like syntax, better TypeScript inference
  - Cons: Newer, smaller ecosystem, no admin UI
  - Why rejected: Prisma more mature, Prisma Studio useful

- **TypeORM:** Established ORM
  - Pros: Mature, decorator-based
  - Cons: Less type-safe, slower
  - Why rejected: Prisma's DX is better

**Consequences:**
- ✅ Positive: Great DX (Prisma Studio, migrations)
- ✅ Positive: Type-safe queries
- ❌ Negative: Can generate large client code
- ⚖️ Neutral: Migration to Drizzle possible later

**File:** `docs/adr/ADR-0008-prisma-orm.md`
**Effort:** 1.5 hours

---

### Directory Structure

```
docs/
└── adr/
    ├── README.md                     # Index of all ADRs
    ├── ADR-template.md               # Template for new ADRs
    ├── ADR-0001-manual-checkpoints.md
    ├── ADR-0002-postgresql-redis.md
    ├── ADR-0003-remix-framework.md
    ├── ADR-0004-container-workers.md
    ├── ADR-0005-monorepo-turbo.md
    ├── ADR-0006-opentelemetry.md
    ├── ADR-0007-typescript-only.md
    └── ADR-0008-prisma-orm.md
```

---

## Implementation Plan

### Week 1: Setup + Priority ADRs
**Day 1:**
- Create `docs/adr/` directory
- Add README.md with index
- Create ADR-template.md

**Day 2-3:**
- Write ADR-0001 (Manual Checkpoints) - 2 hours
- Write ADR-0002 (PostgreSQL + Redis) - 2 hours
- Write ADR-0003 (Remix) - 1.5 hours
- Write ADR-0004 (Container Workers) - 2 hours

**Day 4-5:**
- Write ADR-0005 (Monorepo) - 1.5 hours
- Write ADR-0006 (OpenTelemetry) - 1.5 hours
- Write ADR-0007 (TypeScript) - 1 hour
- Write ADR-0008 (Prisma) - 1.5 hours

**Effort:** 5 days (13 hours writing + reviews)

---

### Week 2: Process + Documentation

**Day 1:**
- Document ADR process in CONTRIBUTING.md
- Add ADR checklist to PR template

**Day 2:**
- Team training session (1 hour)
- Practice: Write ADR for recent decision

**Day 3:**
- Link ADRs from relevant code (comments)
- Add to onboarding docs

**Effort:** 1 day

---

## Example ADR (Full)

**File:** `docs/adr/ADR-0001-manual-checkpoints.md`

```markdown
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
```

---

## Example Usage

### Before ADRs
**Developer:** "Why did we choose Remix over Next.js?"
**Answer:** *Searches Slack for 30 minutes, asks 3 people, gets vague answers*

### After ADRs
**Developer:** "Why did we choose Remix over Next.js?"
**Answer:** Read `docs/adr/ADR-0003-remix-framework.md` (5 minutes)
- Clear decision: Remix
- Alternatives: Next.js (larger ecosystem), SvelteKit (unfamiliar)
- Reason: Cleaner data fetching pattern, team prefers loaders/actions
- Trade-offs: Smaller ecosystem accepted

---

## Success Criteria

### Week 2:
- ✅ 8 ADRs documented
- ✅ ADR template created
- ✅ Team trained on process

### Month 3:
- ✅ All new major decisions have ADRs
- ✅ Onboarding references ADRs
- ✅ 0 repeated debates on settled topics

### Month 6:
- ✅ 15+ ADRs total
- ✅ Onboarding time reduced 20%
- ✅ Engineers cite ADRs in code reviews

---

## Backwards Compatibility

✅ **No breaking changes** - documentation only

---

## Open Questions

1. **Who approves ADRs?**
   - **Proposal:** Tech lead + 1 senior engineer

2. **Do we need ADRs for everything?**
   - **Proposal:** Only for decisions that are:
     - Hard to reverse
     - Affect multiple components
     - Have significant trade-offs

3. **How often to review ADRs?**
   - **Proposal:** Quarterly review, mark as deprecated if superseded

---

## Appendix: ADR Tools

**Option 1: Simple Markdown (Chosen)**
- Pros: No tooling needed, searchable
- Cons: Manual index

**Option 2: ADR Tools CLI**
- Tool: `adr-tools` (https://github.com/npryce/adr-tools)
- Pros: Auto-numbering, templates
- Cons: Extra dependency

**Option 3: Decision Log Service**
- Tool: https://adr.github.io
- Pros: Nice UI
- Cons: External service, cost

**Decision:** Simple Markdown (low friction, easy to adopt)

---

**Status:** Ready for implementation
**Owner:** Engineering Lead
**Timeline:** Start Week 1 of Sprint 2
