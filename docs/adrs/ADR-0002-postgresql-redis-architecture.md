# ADR-0002: PostgreSQL + Redis Architecture vs Event Sourcing

**Status:** Accepted
**Date:** 2025-11-17
**Deciders:** Engineering Team, Infrastructure Team
**Tags:** architecture, database, infrastructure

## Context

Trigger.dev needs a data architecture that can:
- Store task definitions, runs, and execution state
- Handle high-throughput queue operations (10K+ tasks/sec at scale)
- Provide real-time updates to the web dashboard
- Support complex queries for analytics and debugging
- Scale horizontally as usage grows

## Decision

Use **PostgreSQL as primary datastore** + **Redis for queue and caching**, with ClickHouse for analytics.

**Architecture:**
```
PostgreSQL (primary)
  - Task definitions
  - Task runs & attempts
  - Checkpoints & execution state
  - User/org data

Redis (queue & cache)
  - Task queue (sorted sets)
  - Real-time state
  - Distributed locks
  - Rate limiting

ClickHouse (analytics)
  - Run statistics
  - Performance metrics
  - Cost analysis
```

## Alternatives Considered

### Alternative 1: Full Event Sourcing

**Description:**
Store all state changes as immutable events. Rebuild current state by replaying events. Use EventStoreDB or Kafka as event store.

**Pros:**
- Complete audit trail of all changes
- Time-travel debugging capabilities
- Natural fit for event-driven architecture
- Can reconstruct any historical state

**Cons:**
- Complex to implement and maintain
- Slow queries (must replay events)
- Large storage requirements
- Difficult to query current state
- Steep learning curve for team
- Eventual consistency challenges
- Hard to migrate/fix data issues

**Why not chosen:**
Over-engineering for our needs. Most queries need "current state" not "historical events". The complexity outweighs benefits.

### Alternative 2: NoSQL (MongoDB or DynamoDB)

**Description:**
Use document database for flexibility and horizontal scaling.

**Pros:**
- Easy horizontal scaling
- Flexible schema
- Fast writes
- Good for nested documents

**Cons:**
- Limited transaction support
- Complex joins require application logic
- Less mature tooling than PostgreSQL
- Team expertise in SQL, not NoSQL
- Migration from current Prisma+Postgres painful
- Eventual consistency issues

**Why not chosen:**
We need ACID transactions for task state transitions and complex joins for analytics. PostgreSQL provides this with excellent horizontal scaling via read replicas and partitioning.

### Alternative 3: Redis-Only Architecture

**Description:**
Use Redis for everything - both queue and persistence.

**Pros:**
- Simple architecture
- Extremely fast
- Easy to deploy

**Cons:**
- Redis is primarily in-memory (expensive at scale)
- Limited query capabilities
- No complex joins
- Persistence is not Redis's strength
- Risk of data loss
- Not suitable for analytics

**Why not chosen:**
Can't handle our persistence and query requirements. Redis is excellent for what it does (queuing, caching) but not as a primary database.

## Consequences

### Positive

- **Proven technology stack**: PostgreSQL + Redis is battle-tested
- **Team expertise**: Team already knows SQL and Prisma
- **Rich query capabilities**: Complex analytics queries supported
- **Strong consistency**: ACID transactions where needed
- **Horizontal scaling**: Read replicas + partitioning + Redis Cluster
- **Great tooling**: Prisma, pgAdmin, Redis Insight, etc.
- **Easy backups**: PostgreSQL has excellent backup solutions
- **Cost-effective**: Cheaper than specialized event stores

### Negative

- **Not pure event-driven**: Some events derived from state changes
- **Two systems to manage**: PostgreSQL + Redis operational overhead
- **Migration complexity**: Schema migrations require coordination
- **Eventual consistency**: Between Postgres and ClickHouse

### Neutral

- **Standard architecture**: Similar to most web applications
- **Clear separation of concerns**: Persistence (PG), Queue (Redis), Analytics (CH)

## Implementation

### Current State (v4.1.0)

**PostgreSQL Schema** (`packages/database/prisma/schema.prisma`):
```prisma
model TaskRun {
  id              String   @id @default(cuid())
  taskId          String
  status          RunStatus
  output          Json?
  checkpoints     TaskRunCheckpoint[]

  @@index([taskId, status])
  @@index([status, startedAt])
}

model TaskRunCheckpoint {
  id        String  @id @default(cuid())
  runId     String
  name      String
  state     Bytes   // Compressed state

  @@index([runId, name])
}
```

**Redis Queue** (`internal-packages/run-queue/src/redis.ts`):
```typescript
// Sorted set for priority queue
await redis.zadd("queue:pending", timestamp + priority, runId);

// Dequeue operations
const items = await redis.zrange("queue:pending", 0, 9);
```

**ClickHouse Analytics** (`internal-packages/clickhouse/src/taskRuns.ts`):
```sql
SELECT
  task_id,
  count(*) as total_runs,
  avg(duration_ms) as avg_duration
FROM task_runs
WHERE organization_id = ?
GROUP BY task_id
```

### Scaling Strategy

**PostgreSQL:**
- **Reads**: 3-5 read replicas
- **Writes**: Single primary with hot standby
- **Partitioning**: Table partitioning by month
- **Connection pooling**: PgBouncer

**Redis:**
- **Queue**: Redis Cluster with 6-10 nodes
- **Sharding**: Consistent hashing for queue distribution
- **Replication**: Sentinel for high availability

### Timeline

- ✅ **Phase 1** (Complete): Initial implementation
- ✅ **Phase 2** (Complete): Production deployment
- 🔄 **Phase 3** (Ongoing): Performance optimization
- 📋 **Phase 4** (Future): Automated partitioning

### Success Criteria

- ✅ Handle 10,000+ tasks/second (current: achieved)
- ✅ Sub-100ms queue operations (current: 2-5ms p95)
- ✅ Support 10M+ task runs in database
- ✅ Query response time <200ms for dashboard
- 🔄 99.9% uptime (ongoing)

## References

- [PostgreSQL Partitioning Guide](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Redis Queue Patterns](https://redis.io/docs/manual/patterns/queue/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- **Codebase**:
  - `packages/database/` - Schema and migrations
  - `internal-packages/run-queue/` - Redis queue implementation
  - `internal-packages/clickhouse/` - Analytics queries

## Notes

### Why Three Databases?

Each database serves a specific purpose:

1. **PostgreSQL**: Source of truth for persistent state
   - Complex relational data
   - ACID transactions
   - Durable storage

2. **Redis**: Operational speed
   - Queue operations (sub-ms latency)
   - Distributed locks
   - Real-time caching

3. **ClickHouse**: Analytics performance
   - Columnar storage (10x compression)
   - Fast aggregations
   - Time-series data

This separation of concerns allows each system to excel at its purpose.

### Performance Benchmarks

From production metrics:

| Operation | Latency (p50) | Latency (p95) |
|-----------|---------------|---------------|
| PG: Task run creation | 15ms | 45ms |
| PG: Checkpoint save | 50ms | 120ms |
| Redis: Enqueue | 1ms | 3ms |
| Redis: Dequeue (10 items) | 2ms | 5ms |
| CH: Analytics query | 30ms | 150ms |

### Future Considerations

- **Multi-region**: PostgreSQL logical replication for multi-region
- **Sharding**: If single PG instance can't handle write load (unlikely before 1M tasks/day)
- **Caching layer**: Redis cache for hot TaskRun queries
- **Read-your-writes**: Ensure web dashboard sees recent updates
