# ADR-0002: PostgreSQL + Redis vs Event Sourcing

**Status:** Accepted
**Date:** 2024-06-15
**Deciders:** Engineering Team
**Technical Story:** Task State Persistence and Queue Management

## Context

Trigger.dev requires a robust data layer for:
- Task state persistence (execution state, checkpoints, results)
- Queue management (task scheduling, priority queues)
- Real-time updates (task status changes, logs)
- Analytics and reporting (task history, performance metrics)

**Requirements:**
- Strong consistency for task state
- Fast queue operations (enqueue, dequeue, priority)
- Self-hosting capability
- Familiar to team for maintenance and debugging

**Constraints:**
- Team expertise: Strong in relational databases (PostgreSQL)
- Hosting: Self-hosted + cloud options
- Budget: Open-source preferred

## Decision

Use **PostgreSQL as primary database** with **Redis for queue and cache**:

**PostgreSQL for:**
- Task run state (status, results, checkpoints)
- User data (organizations, projects, API keys)
- Configuration (environments, schedules)
- Analytics (aggregated metrics)

**Redis for:**
- Task queue (pending tasks, priorities)
- Real-time presence (active workers)
- Rate limiting
- Session cache

**Architecture:**
```
┌─────────────┐
│   Workers   │ ← Redis Queue → ┌────────┐
└─────────────┘                 │ Redis  │
       ↓                        └────────┘
  PostgreSQL ← State/Results
```

## Alternatives Considered

### Alternative 1: Event Sourcing (Temporal-style)

**How it works:**
- Store all events (TaskStarted, CheckpointCreated, TaskCompleted)
- Rebuild current state from event log
- Event store as source of truth

**Pros:**
- Complete audit log (every state change recorded)
- Time-travel debugging (replay to any point)
- Natural fit for task execution (event-driven)
- Can rebuild state if corrupted

**Cons:**
- Complex queries (must replay events)
- Eventual consistency (rebuilding state takes time)
- Storage growth (events accumulate forever)
- Team unfamiliar with event sourcing patterns
- More complex to implement and maintain

**Why rejected:**
- Team expertise in RDBMS (PostgreSQL), not event sourcing
- Simpler to query current state directly (SQL)
- Strong consistency preferred over eventual consistency
- Storage costs would grow faster (all events vs snapshots)

**Sources:**
- Event Sourcing (Martin Fowler): https://martinfowler.com/eaaDev/EventSourcing.html
- Temporal architecture: https://docs.temporal.io/clusters

---

### Alternative 2: DynamoDB (AWS NoSQL)

**How it works:**
- DynamoDB for all data
- DynamoDB Streams for real-time updates
- GSIs for querying

**Pros:**
- Fully managed (no ops)
- Auto-scaling
- Built-in streams
- High availability

**Cons:**
- AWS vendor lock-in (hard to self-host)
- Less flexible queries (no JOINs, limited WHERE)
- Eventual consistency by default
- More expensive at scale
- Team less familiar

**Why rejected:**
- Self-hosting requirement (some users want on-premise)
- Less flexible queries (need complex access patterns)
- Vendor lock-in conflicts with multi-cloud strategy

---

### Alternative 3: Pure PostgreSQL (No Redis)

**How it works:**
- PostgreSQL for everything (state + queue)
- Use `LISTEN/NOTIFY` for real-time
- Use `SELECT FOR UPDATE SKIP LOCKED` for queues

**Pros:**
- Single database (simpler ops)
- Strong consistency everywhere
- Familiar technology

**Cons:**
- PostgreSQL not optimized for queue operations
- Higher load on single database
- Slower queue performance (disk vs memory)
- LISTEN/NOTIFY has limitations (message size, reliability)

**Why rejected:**
- Redis significantly faster for queue operations (memory vs disk)
- Separation of concerns (queue vs persistent state)
- Risk of overloading PostgreSQL with queue traffic

**Note:** Considered but deemed too slow for high-throughput queue

---

## Consequences

### Positive

**1. Familiar technology**
- Team has deep PostgreSQL expertise
- Easy to query (SQL) and debug
- Well-understood operational patterns

**2. Strong consistency**
- ACID transactions (critical for task state)
- No eventual consistency issues
- Reliable for financial/critical tasks

**3. Flexible queries**
- Can query task history with complex filters
- JOINs for relationships (tasks → runs → checkpoints)
- Easy to build analytics

**4. Self-hosting friendly**
- PostgreSQL and Redis are open-source
- Can run on-premise or any cloud
- No vendor lock-in

**5. Fast queue operations**
- Redis optimized for queue (in-memory)
- Sub-millisecond enqueue/dequeue
- Supports priority queues efficiently

### Negative

**1. No built-in audit log**
- Only current state stored (not all changes)
- Can't replay history to debug
- **Mitigation:** Add event log table if needed later

**2. Two systems to maintain**
- PostgreSQL + Redis (instead of one)
- More operational complexity
- **Mitigation:** Both are mature, well-supported

**3. Data consistency across systems**
- Queue (Redis) and state (PostgreSQL) must stay in sync
- Risk of queue having stale task references
- **Mitigation:** Periodic cleanup jobs, idempotent workers

### Neutral

**1. Need separate analytics database**
- PostgreSQL not ideal for large-scale analytics
- Will add ClickHouse later for analytics
- **Impact:** Planned architecture, not a problem

**2. State vs events trade-off**
- Store snapshots (current state) vs events (all changes)
- Chose snapshots for simplicity
- **Impact:** Can add events later if needed

---

## Implementation

Completed in initial platform release

**Components:**
- [x] PostgreSQL schema (Prisma migrations)
- [x] Redis connection pool (ioredis)
- [x] Queue implementation (BullMQ on Redis)
- [x] Transactional task state updates
- [x] Cleanup jobs (remove completed tasks from Redis)

**Database schema highlights:**
- `TaskRun` table (main execution state)
- `TaskRunCheckpoint` table (checkpoint snapshots)
- `TaskRunLog` table (execution logs)
- Indexes on common queries (status, organizationId, createdAt)

**Queue design:**
- BullMQ for queue management
- Priority queues per environment
- Dead letter queue for failed tasks
- Rate limiting with Redis

---

## References

**Internal:**
- Database schema: `packages/database/prisma/schema.prisma`
- Queue implementation: `internal-packages/queue`

**External:**
- PostgreSQL docs: https://www.postgresql.org/docs/
- Redis docs: https://redis.io/docs/
- BullMQ (queue library): https://docs.bullmq.io/
- Event Sourcing (Fowler): https://martinfowler.com/eaaDev/EventSourcing.html

**Comparison articles:**
- PostgreSQL vs DynamoDB: https://www.percona.com/blog/postgresql-vs-dynamodb/
- Event Sourcing trade-offs: https://www.eventstore.com/blog/what-is-event-sourcing

---

## Superseded By

None (still active as of 2025-11)

---

## Future Considerations

**1. Analytics database (planned):**
- Add ClickHouse for large-scale analytics
- Keep PostgreSQL for operational queries
- ETL from PostgreSQL to ClickHouse

**2. Event log (optional):**
- Could add event log table to PostgreSQL
- Store all state changes for audit
- Would not replace current state tables

**3. Multi-region:**
- PostgreSQL replication for read replicas
- Redis clusters for queue distribution
- Careful planning needed for consistency
