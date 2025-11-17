# ADR-0008: Prisma vs Drizzle for ORM

**Status:** Accepted
**Date:** 2024-06-15
**Deciders:** Engineering Team
**Technical Story:** Database ORM Selection

## Context

Trigger.dev uses PostgreSQL as the primary database (see ADR-0002). We need an ORM (Object-Relational Mapping) to:
- Define database schema (tables, columns, relationships)
- Generate type-safe database client
- Manage migrations (schema changes)
- Query the database (CRUD operations)
- Ensure data integrity (constraints, transactions)

**Requirements:**
- TypeScript support (full type safety)
- PostgreSQL support (primary database)
- Migration management (version control for schema)
- Good developer experience (easy to use, good errors)
- Active maintenance and community

**Constraints:**
- Team expertise: Moderate SQL, prefer type-safe queries
- Schema complexity: Moderate (20-30 tables, relationships)
- Performance: Important but not extreme (thousands of QPS, not millions)

## Decision

Use **Prisma 4.x** as the ORM.

**Schema example:**
```prisma
// packages/database/prisma/schema.prisma
model TaskRun {
  id              String   @id @default(cuid())
  taskId          String
  status          RunStatus
  payload         Json
  checkpoints     TaskRunCheckpoint[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  task            Task     @relation(fields: [taskId], references: [id])

  @@index([status, createdAt])
  @@index([taskId])
}
```

**Usage example:**
```typescript
// Type-safe queries
const run = await prisma.taskRun.findUnique({
  where: { id: runId },
  include: { task: true, checkpoints: true }
});

// Type-safe create
const newRun = await prisma.taskRun.create({
  data: {
    taskId: task.id,
    status: 'PENDING',
    payload: { foo: 'bar' }
  }
});
```

**Key features used:**
- Prisma schema for database models
- Prisma Client (auto-generated, type-safe)
- Prisma Migrate (manage schema changes)
- Prisma Studio (database GUI)

## Alternatives Considered

### Alternative 1: Drizzle ORM

**How it works:**
- Newer TypeScript-first ORM
- SQL-like query builder
- Lighter than Prisma (smaller client)
- Schema defined in TypeScript

**Example:**
```typescript
// Schema in TypeScript
const taskRuns = pgTable('task_runs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  status: text('status').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow()
});

// SQL-like queries
const run = await db
  .select()
  .from(taskRuns)
  .where(eq(taskRuns.id, runId))
  .leftJoin(tasks, eq(taskRuns.taskId, tasks.id));
```

**Pros:**
- Lighter (smaller client, faster startup)
- SQL-like syntax (feels more like SQL)
- Better TypeScript inference (for complex queries)
- No schema file (schema in TypeScript)
- Faster query execution (less overhead)

**Cons:**
- Newer (less mature, smaller community)
- No admin UI (like Prisma Studio)
- Fewer examples and tutorials
- Migration story less polished
- Team unfamiliar (need to learn)

**Why rejected:**
- Prisma more mature (battle-tested)
- Prisma Studio is very useful (GUI for debugging)
- Team prefers Prisma's schema language (clearer for non-SQL experts)
- Larger community (more Stack Overflow answers)
- Migration could happen later (not locked in)

**Note:** Drizzle is a strong alternative. We may migrate in the future if it proves significantly better.

**Sources:**
- Drizzle docs: https://orm.drizzle.team/
- Drizzle vs Prisma: https://orm.drizzle.team/docs/prisma

---

### Alternative 2: TypeORM

**How it works:**
- Mature ORM (older than Prisma)
- Decorator-based schema definition
- Similar to Java Hibernate

**Example:**
```typescript
@Entity()
class TaskRun {
  @PrimaryColumn()
  id: string;

  @Column()
  taskId: string;

  @Column({ type: 'enum', enum: RunStatus })
  status: RunStatus;

  @ManyToOne(() => Task)
  task: Task;

  @CreateDateColumn()
  createdAt: Date;
}
```

**Pros:**
- Mature (around since 2016)
- Active Directory pattern (familiar to Java/C# devs)
- Supports many databases
- Large community

**Cons:**
- Less type-safe (reflection-based, lose types easily)
- Slower than Prisma (benchmarks show ~2x slower)
- Decorator-based syntax is verbose
- Migration story is complex
- TypeScript support is weaker (added after JS version)

**Why rejected:**
- Prisma has better type safety (generates client from schema)
- Prisma has better DX (simpler, clearer errors)
- TypeORM slower (performance matters)
- Team prefers Prisma's approach

**Sources:**
- TypeORM docs: https://typeorm.io/
- Prisma vs TypeORM: https://www.prisma.io/docs/concepts/more/comparisons/prisma-and-typeorm

---

### Alternative 3: Kysely (SQL query builder)

**How it works:**
- Type-safe SQL query builder (not full ORM)
- No schema definition (infer types from DB)
- Very close to raw SQL

**Example:**
```typescript
const run = await db
  .selectFrom('task_runs')
  .selectAll()
  .where('id', '=', runId)
  .executeTakeFirst();
```

**Pros:**
- Type-safe (infers from database schema)
- Very close to SQL (full control)
- Lightweight (no ORM overhead)
- Fast (minimal abstraction)

**Cons:**
- Not a full ORM (no schema definition, no migrations)
- More verbose (need to write SQL-like queries)
- No relation loading (need JOINs manually)
- Need separate migration tool

**Why rejected:**
- Want ORM features (schema definition, migrations, relations)
- Kysely too low-level for most queries
- Prefer Prisma's higher-level API

**Note:** Kysely is great for complex raw SQL. We use it occasionally alongside Prisma.

---

## Consequences

### Positive

**1. Excellent developer experience**
- Prisma Studio (GUI for browsing data)
- Great error messages (clear, actionable)
- Auto-formatting for schema file
- VS Code extension (syntax highlighting, autocomplete)

**2. Type-safe queries**
- Generated TypeScript client (100% type-safe)
- Autocomplete for all fields and relations
- Compile-time errors for invalid queries

**Example:**
```typescript
// TypeScript knows all fields
const run = await prisma.taskRun.findUnique({
  where: { id: runId },
  select: {
    id: true,
    status: true,
    task: { select: { name: true } } // Nested select
  }
});

// Type: { id: string; status: RunStatus; task: { name: string } }
```

**3. Prisma Migrate (schema management)**
- Version-controlled migrations
- Auto-generate migration SQL
- Rollback support
- Seed data support

**Example workflow:**
```bash
# 1. Change schema.prisma
# 2. Generate migration
pnpm prisma migrate dev --name add-priority-field
# 3. Prisma generates SQL migration file
# 4. Apply migration to database
```

**4. Relation handling**
- Easy to load relations (`include`, `select`)
- Type-safe nested creates

**Example:**
```typescript
// Create task run with checkpoints in one query
const run = await prisma.taskRun.create({
  data: {
    status: 'RUNNING',
    checkpoints: {
      create: [
        { name: 'step1', state: { data: 'foo' } },
        { name: 'step2', state: { data: 'bar' } }
      ]
    }
  },
  include: { checkpoints: true }
});
```

**5. Prisma Studio (admin UI)**
- Browse data visually (great for debugging)
- Edit records (useful in development)
- No need to write SQL for simple queries

### Negative

**1. Large client code**
- Prisma Client is large (~5-10 MB generated code)
- Slow to generate (can take 10-30 seconds)
- **Mitigation:** Generate once, cache in CI

**2. Not ideal for complex queries**
- Some SQL queries are awkward in Prisma
- Complex JOINs, window functions, CTEs
- **Mitigation:** Use `$queryRaw` for complex SQL

**Example:**
```typescript
// For complex queries, use raw SQL
const result = await prisma.$queryRaw`
  SELECT *, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at) as rn
  FROM task_runs
  WHERE status = 'COMPLETED'
`;
```

**3. Migration in production is manual**
- Need to run `prisma migrate deploy` manually
- Not automatic (unlike some ORMs)
- **Mitigation:** Add to deployment script

**4. Schema in separate file**
- Prisma schema is not TypeScript (custom DSL)
- Need to learn Prisma schema language
- **Mitigation:** Simple syntax, good docs

### Neutral

**1. Drizzle is gaining popularity**
- Drizzle might become better choice in future
- Can migrate later (both use SQL databases)
- **Impact:** Not urgent, but worth monitoring

**2. Performance vs Drizzle**
- Drizzle is faster (benchmarks show ~20% faster)
- Prisma is "fast enough" for our use case
- **Impact:** Not a bottleneck yet

---

## Implementation

Completed in initial platform release

**Components:**
- [x] Prisma schema (`packages/database/prisma/schema.prisma`)
- [x] Prisma Client generation (post-install script)
- [x] Migrations (in `packages/database/prisma/migrations/`)
- [x] Seed data (`packages/database/prisma/seed.ts`)
- [x] Database package (`packages/database`) exported to all apps

**Schema structure:**
- ~25 models (tables)
- Relationships: 1-to-many, many-to-many
- Indexes on common queries
- JSON fields for flexible data (payload, state)

**Performance:**
- Query latency: ~5-20ms (simple queries)
- Complex queries: ~50-100ms (with JOINs)
- Client generation: ~15 seconds (full monorepo)

**Migration workflow:**
1. Edit `schema.prisma`
2. Run `pnpm prisma migrate dev --name <name>`
3. Prisma generates SQL migration
4. Review migration SQL
5. Commit migration to Git
6. Deploy: `pnpm prisma migrate deploy` (production)

---

## References

**Internal:**
- Prisma schema: `packages/database/prisma/schema.prisma`
- Database package: `packages/database/`
- Migrations: `packages/database/prisma/migrations/`

**External:**
- Prisma docs: https://www.prisma.io/docs/
- Prisma Migrate: https://www.prisma.io/docs/concepts/components/prisma-migrate
- Prisma Client: https://www.prisma.io/docs/concepts/components/prisma-client

**Comparison articles:**
- Prisma vs Drizzle: https://orm.drizzle.team/docs/prisma
- Prisma vs TypeORM: https://www.prisma.io/docs/concepts/more/comparisons/prisma-and-typeorm

**Benchmarks:**
- ORM performance: https://github.com/lucia-auth/benchmarks (Drizzle is faster)

---

## Superseded By

None (still active as of 2025-11)

---

## Future Considerations

**1. Drizzle migration:**
- Monitor Drizzle ecosystem maturity
- Consider migration if:
  - Performance becomes bottleneck
  - Drizzle gets admin UI
  - Team wants SQL-like syntax
- **Decision:** Revisit in 6-12 months

**2. Read replicas:**
- Use PostgreSQL read replicas for scaling
- Prisma supports read replicas (via connection URL)
- **Decision:** Implement when read load is high

**3. Prisma 5.x:**
- Upgrade to Prisma 5 (released 2023)
- New features: JSON protocol, faster queries
- **Decision:** Upgrade in progress

**4. Custom query caching:**
- Prisma Accelerate (managed caching layer)
- Or build custom caching with Redis
- **Decision:** Evaluate if query performance becomes issue
