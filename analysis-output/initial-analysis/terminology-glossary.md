# Trigger.dev Terminology Glossary

**Analysis Date:** November 16, 2025
**Commit SHA:** `19fa66931819371d607eff001b561aa783547734` (v4.1.0)

---

## Purpose

This glossary defines project-specific terms, domain concepts, and technical jargon used throughout the Trigger.dev codebase. Understanding these terms is essential for contributing to the project.

---

## Core Domain Concepts

### Task
**Definition:** A user-defined function that can be triggered, retried, and monitored by the Trigger.dev platform.

**Usage:**
```typescript
export const myTask = task({
  id: "my-task",
  run: async (payload) => {
    // Task logic here
  }
});
```

**Related Terms:** Run, Attempt, BackgroundWorkerTask
**Database Model:** `BackgroundWorkerTask`

---

### Run
**Definition:** A single execution instance of a task, triggered by a user or schedule.

**Properties:**
- Unique `runId` (e.g., `run_abc123`)
- Status (PENDING, EXECUTING, COMPLETED_SUCCESSFULLY, FAILED, etc.)
- Payload (input data)
- Output (result data)
- Timestamps (createdAt, startedAt, completedAt)

**Related Terms:** Task, Attempt, RunHandle
**Database Model:** `TaskRun`

---

### Attempt
**Definition:** A retry attempt within a run. If a run fails, it may be retried multiple times, creating multiple attempts.

**Example:**
- Run 1, Attempt 1 (fails due to network error)
- Run 1, Attempt 2 (succeeds)

**Related Terms:** Retry, Run
**Database Model:** `TaskRunAttempt`

---

### Checkpoint
**Definition:** A saved execution state within a task. Allows tasks to pause and resume from a specific point, preventing redundant work.

**Usage:**
```typescript
await checkpoint("step1-complete");
// If task crashes here, it will resume from this checkpoint
```

**How it Works:**
1. Task calls `checkpoint(name)`
2. Execution state serialized to database
3. Task status set to WAITING
4. On resume, state restored, execution continues

**Related Terms:** Durability, Resume, ExecutionSnapshot
**Database Model:** `TaskRunCheckpoint`, `Checkpoint`

---

### Waitpoint
**Definition:** A programmatic pause point in a task where execution halts until human approval or external input.

**Use Cases:**
- Manual approval for sensitive operations
- Human-in-the-loop AI decisions
- External system synchronization

**Usage:**
```typescript
const approval = await ctx.createWaitpoint({
  type: "approval",
  message: "Approve payment of $1000?"
});

if (approval.approved) {
  await processPayment();
}
```

**Related Terms:** Human-in-the-Loop, Pause, Resume
**Database Model:** `Waitpoint`

---

### Queue
**Definition:** A named queue for grouping tasks with shared concurrency limits and priority rules.

**Purpose:**
- Control how many tasks run concurrently
- Prioritize certain tasks over others
- Prevent resource exhaustion

**Usage:**
```typescript
const apiQueue = queue({
  name: "api-calls",
  concurrencyLimit: 5
});

export const apiTask = task({
  id: "api-task",
  queue: apiQueue,
  run: async () => { /* ... */ }
});
```

**Related Terms:** Concurrency, Priority, Dequeue
**Database Model:** `TaskQueue`

---

### Schedule
**Definition:** A recurring trigger for a task, defined by a cron expression or interval.

**Usage:**
```typescript
export const dailyBackup = task({
  id: "daily-backup",
  run: async () => { /* ... */ }
});

schedules.create({
  task: dailyBackup,
  cron: "0 2 * * *" // Daily at 2 AM
});
```

**Related Terms:** Cron, Recurring, ScheduleInstance
**Database Model:** `TaskSchedule`, `TaskScheduleInstance`

---

### Machine
**Definition:** Compute resources (vCPU, RAM) allocated to a task execution.

**Presets:**
- `micro`: 0.25 vCPU, 0.5 GB RAM
- `small`: 0.5 vCPU, 1 GB RAM
- `medium`: 1 vCPU, 2 GB RAM (default)
- `large`: 2 vCPU, 4 GB RAM
- `xlarge`: 4 vCPU, 8 GB RAM
- `2xlarge`: 8 vCPU, 16 GB RAM

**Usage:**
```typescript
export const heavyTask = task({
  id: "process-video",
  machine: "xlarge",
  run: async () => { /* ... */ }
});
```

**Related Terms:** Resources, vCPU, RAM
**Database Model:** `Machine`

---

### Environment
**Definition:** Isolated execution context for tasks (DEV, STAGING, PREVIEW, PROD).

**Purpose:**
- Separate development from production
- Test changes in preview branches
- Isolate customer data

**Types:**
- **DEVELOPMENT:** Local `trigger dev` server
- **STAGING:** Pre-production testing
- **PREVIEW:** Feature branch deployments
- **PRODUCTION:** Live production

**Related Terms:** RuntimeEnvironment, Project
**Database Model:** `RuntimeEnvironment`

---

## Execution Lifecycle Terms

### Trigger
**Verb:** To initiate a task execution.

**Methods:**
```typescript
await myTask.trigger(payload);           // Fire and forget
await myTask.triggerAndWait(payload);    // Wait for result
await myTask.batchTrigger([...]);        // Trigger multiple
```

**Related Terms:** Run, Enqueue

---

### Enqueue
**Verb:** To add a run to the execution queue.

**Process:**
1. User triggers task
2. System creates `TaskRun` record (status: PENDING)
3. Run added to Redis queue
4. Worker dequeues and executes

**Related Terms:** Dequeue, Queue, RunEngine

---

### Dequeue
**Verb:** To remove a run from the queue for execution.

**Process:**
1. Worker requests next run from queue
2. RunEngine selects run using fair selection strategy
3. Distributed lock acquired (prevents duplicate execution)
4. Run assigned to worker

**Related Terms:** Enqueue, Lock, FairQueueSelection

---

### Resume
**Verb:** To continue execution of a paused task from a checkpoint or waitpoint.

**Triggers:**
- Checkpoint reached → automatic resume
- Waitpoint approved → manual resume
- Crash recovery → automatic resume from last checkpoint

**Related Terms:** Checkpoint, Waitpoint, Pause

---

### Retry
**Verb:** To attempt a failed run again.

**Configuration:**
```typescript
task({
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    randomize: true
  }
});
```

**Backoff Strategies:**
- **Exponential:** delay = base * (factor ^ attemptNumber)
- **Linear:** delay = base * attemptNumber
- **Fixed:** delay = constant

**Related Terms:** Attempt, Backoff, Failure

---

### Idempotency
**Noun:** Property that ensures a task can be safely retried without side effects.

**Implementation:**
```typescript
await myTask.trigger(payload, {
  idempotencyKey: "unique-key-123"
});
// If triggered again with same key, returns existing run
```

**Purpose:**
- Prevent duplicate charges
- Safe retries
- Exactly-once semantics

**Related Terms:** IdempotencyKey, Deduplication

---

## Architecture Terms

### Coordinator
**Definition:** Microservice that orchestrates task execution across workers.

**Responsibilities:**
- Monitor worker pool
- Route tasks to workers
- Handle task lifecycle (start, pause, resume, complete)
- Coordinate with RunEngine

**Related Terms:** Orchestration, Worker, RunEngine
**Location:** `apps/coordinator/`

---

### Supervisor
**Definition:** Microservice that monitors worker health and resource usage.

**Responsibilities:**
- Health checks
- CPU/memory tracking
- Auto-scaling decisions
- Failure detection

**Related Terms:** Worker, Health, Monitoring
**Location:** `apps/supervisor/`

---

### RunEngine
**Definition:** Core execution engine that manages task run lifecycle.

**Subsystems:**
- **DequeueSystem:** Dequeue runs from queue
- **RunAttemptSystem:** Manage attempt lifecycle
- **CheckpointSystem:** Handle checkpoints
- **WaitpointSystem:** Manage waitpoints
- **RetrySystem:** Handle retries
- **BatchSystem:** Batch operations

**Related Terms:** TaskRun, Attempt, Checkpoint
**Location:** `internal-packages/run-engine/`

---

### Provider
**Definition:** Execution environment for running tasks (Docker or Kubernetes).

**Types:**
- **DockerProvider:** Runs tasks in Docker containers
- **KubernetesProvider:** Runs tasks in Kubernetes pods

**Related Terms:** Worker, Container, Pod
**Location:** `apps/docker-provider/`, `apps/kubernetes-provider/`

---

### Worker
**Definition:** Compute instance that executes task code.

**Lifecycle:**
1. Worker starts
2. Registers with Coordinator
3. Receives task execution packets
4. Executes task code
5. Reports results
6. Waits for next task

**Related Terms:** Provider, Coordinator, BackgroundWorker
**Database Model:** `BackgroundWorker`, `WorkerDeployment`

---

## Observability Terms

### Trace
**Definition:** Distributed trace that tracks a request across multiple services.

**Components:**
- **Trace ID:** Unique identifier for the entire trace
- **Span:** Individual operation within a trace
- **Attributes:** Metadata attached to spans

**Tools:**
- **OpenTelemetry:** Instrumentation standard
- **ClickHouse:** Trace storage
- **Webapp:** Trace visualization

**Related Terms:** Span, OpenTelemetry, Distributed Tracing

---

### Span
**Definition:** A single operation within a distributed trace.

**Properties:**
- Name (e.g., "task.run", "db.query")
- Start/end timestamps
- Parent span (for nested operations)
- Attributes (metadata)

**Example:**
```
Trace: process-order
├─ Span: task.run (parent)
│  ├─ Span: db.query (select order)
│  ├─ Span: http.request (payment API)
│  └─ Span: db.query (update order)
```

**Related Terms:** Trace, OpenTelemetry

---

### Event
**Definition:** A logged occurrence during task execution.

**Types:**
- **Log:** Structured log message
- **Span:** Execution trace
- **Metric:** Quantitative measurement
- **Error:** Exception or failure

**Related Terms:** TaskEvent, Logging, Metrics
**Database Model:** `TaskEvent`

---

### Metric
**Definition:** Quantitative measurement of system behavior.

**Examples:**
- Task execution duration
- Queue depth
- Error rate
- Throughput (tasks/second)

**Tools:**
- **Prometheus:** Metrics collection (prom-client)
- **ClickHouse:** Metrics storage

**Related Terms:** Observability, Monitoring

---

## Data Flow Terms

### Payload
**Definition:** Input data passed to a task when triggered.

**Types:**
- **JSON:** Any JSON-serializable object
- **Schema-validated:** Using Zod schemas

**Example:**
```typescript
const run = await myTask.trigger({
  userId: "123",
  action: "send-email"
});
```

**Related Terms:** Input, Schema, Validation

---

### Output
**Definition:** Result data returned by a task after execution.

**Example:**
```typescript
task({
  run: async (payload) => {
    return { success: true, orderId: "456" };
  }
});
```

**Related Terms:** Result, Return Value

---

### Stream
**Definition:** Real-time data flow from backend to frontend.

**Use Cases:**
- AI completion streaming (OpenAI, Anthropic)
- Progress updates
- Log streaming

**Usage:**
```typescript
// Backend
await streams.pipe("completion", aiResponse);

// Frontend
for await (const chunk of stream) {
  console.log(chunk);
}
```

**Related Terms:** Realtime, WebSocket, SSE

---

## SDK Terms

### SDK
**Acronym:** Software Development Kit

**Packages:**
- **@trigger.dev/sdk:** Main SDK for defining and triggering tasks
- **@trigger.dev/core:** Core runtime APIs
- **@trigger.dev/cli:** Command-line tool
- **@trigger.dev/react-hooks:** React integration

**Related Terms:** API, Client Library

---

### CLI
**Acronym:** Command-Line Interface

**Commands:**
```bash
trigger init      # Initialize project
trigger dev       # Local development
trigger deploy    # Deploy to cloud
trigger login     # Authenticate
```

**Related Terms:** trigger command, Dev Mode

---

### Build Extension
**Definition:** Plugin that customizes the task execution environment.

**Available Extensions:**
- `prismaExtension()` - Prisma ORM support
- `puppeteerExtension()` - Browser automation
- `ffmpegExtension()` - Video processing

**Usage:**
```typescript
// trigger.config.ts
export default defineConfig({
  build: {
    extensions: [prismaExtension()]
  }
});
```

**Related Terms:** Plugin, Customization

---

## Authentication Terms

### API Key
**Definition:** Secret token for authenticating API requests.

**Types:**
- **Public API Key:** Safe to expose in frontend (limited permissions)
- **Secret API Key:** Never expose (full permissions)

**Usage:**
```typescript
import { configure } from "@trigger.dev/sdk";

configure({
  apiKey: process.env.TRIGGER_API_KEY
});
```

**Related Terms:** Authentication, Authorization

---

### Personal Access Token (PAT)
**Definition:** Long-lived token for CLI authentication.

**Generation:**
1. Log in to dashboard
2. Navigate to settings
3. Create PAT
4. Use with `trigger login`

**Related Terms:** CLI, Authentication
**Database Model:** `PersonalAccessToken`

---

### Organization
**Definition:** Top-level entity that owns projects and members.

**Hierarchy:**
```
Organization
├── Projects
│   └── Environments (DEV, STAGING, PROD)
│       └── Tasks
└── Members (with roles)
```

**Related Terms:** Org, Team, Multi-tenancy
**Database Model:** `Organization`, `OrgMember`

---

## Infrastructure Terms

### Monorepo
**Definition:** Repository containing multiple packages and applications.

**Tools:**
- **pnpm workspaces:** Package management
- **Turbo:** Build orchestration

**Structure:**
```
trigger.dev/
├── apps/        # Applications
├── packages/    # Public packages
└── internal-packages/  # Internal packages
```

**Related Terms:** pnpm, Turbo, Workspace

---

### Workspace
**Definition:** A package within the monorepo (pnpm term).

**Configuration:**
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'internal-packages/*'
```

**Related Terms:** Monorepo, pnpm

---

### Changeset
**Definition:** A file describing a change to a package for versioning.

**Workflow:**
1. Make code changes
2. Run `pnpm changeset:add`
3. Describe changes
4. Commit changeset file
5. On release, changesets generate changelogs and version bumps

**Related Terms:** Versioning, Release, Changelog

---

## Database Terms

### Prisma
**Definition:** ORM (Object-Relational Mapping) for database access.

**Schema:**
```prisma
model TaskRun {
  id          String   @id @default(cuid())
  friendlyId  String   @unique
  status      TaskRunStatus
  payload     Json
  output      Json?
  // ...
}
```

**Related Terms:** ORM, Database, Schema
**Location:** `internal-packages/database/prisma/schema.prisma`

---

### Migration
**Definition:** Database schema change tracked in version control.

**Commands:**
```bash
pnpm run db:migrate      # Apply migrations
pnpm run db:migrate:dev  # Create migration
```

**Related Terms:** Prisma, Schema, Database

---

### Partition
**Definition:** Database table split into smaller chunks for performance.

**Example:**
- `TaskRun` table partitioned by `createdAt` (monthly)
- Improves query performance on recent runs
- Enables efficient archival

**Tool:** `pg_partman` (PostgreSQL extension)

**Related Terms:** Database, Performance, Optimization

---

## Real-time Terms

### WebSocket
**Definition:** Bi-directional communication protocol for real-time updates.

**Implementation:**
- **Socket.io:** WebSocket library
- **Redis Adapter:** Shared state across servers

**Usage:**
- Run status updates
- Log streaming
- Live task list

**Related Terms:** Realtime, Streaming, Socket.io

---

### Server-Sent Events (SSE)
**Definition:** One-way communication from server to client.

**Usage:**
- Long-polling alternative
- Used in some realtime streams

**Related Terms:** EventSource, Streaming

---

## Testing Terms

### Unit Test
**Definition:** Test of a single function or class in isolation.

**Framework:** Vitest

**Example:**
```typescript
test("task triggers successfully", async () => {
  const run = await myTask.trigger({ data: "test" });
  expect(run.id).toBeDefined();
});
```

**Related Terms:** Vitest, Testing

---

### Integration Test
**Definition:** Test of multiple components working together.

**Tools:**
- **Testcontainers:** Spin up Postgres/Redis for tests
- **Vitest:** Test framework

**Related Terms:** Testing, Testcontainers

---

### E2E Test
**Definition:** End-to-end test simulating real user workflows.

**Framework:** Playwright

**Example:**
```typescript
test("user can trigger task from dashboard", async ({ page }) => {
  await page.goto("/tasks");
  await page.click("button[aria-label='Trigger Task']");
  // ...
});
```

**Related Terms:** Playwright, Testing

---

## Common Acronyms

| Acronym | Full Term | Meaning |
|---------|-----------|---------|
| **SDK** | Software Development Kit | Client library for developers |
| **CLI** | Command-Line Interface | Terminal tool (`trigger` command) |
| **API** | Application Programming Interface | HTTP endpoints for integration |
| **ORM** | Object-Relational Mapping | Database abstraction (Prisma) |
| **OTEL** | OpenTelemetry | Observability standard |
| **SSE** | Server-Sent Events | One-way server→client streaming |
| **WS** | WebSocket | Bi-directional real-time protocol |
| **TTL** | Time To Live | Duration before expiration |
| **PAT** | Personal Access Token | Long-lived auth token |
| **MFA** | Multi-Factor Authentication | 2FA security |
| **CRUD** | Create, Read, Update, Delete | Basic database operations |
| **DDD** | Domain-Driven Design | Architectural pattern |
| **CQRS** | Command Query Responsibility Segregation | Separate reads from writes |
| **ADR** | Architectural Decision Record | Document design decisions |

---

## Domain-Specific Jargon

### "Durability"
**Meaning:** Task execution survives crashes and can resume from checkpoints.

**Why it matters:** Unlike serverless functions that lose state, Trigger.dev tasks are durable.

---

### "Fair Queue Selection"
**Meaning:** Algorithm that ensures all queues get a fair share of workers.

**Implementation:** Round-robin with priority adjustments.

---

### "Checkpoint-Resume"
**Meaning:** Pattern where tasks save state periodically and resume from that state after failures.

**Alternative Names:** Durable execution, persistent workflows

---

### "Human-in-the-Loop"
**Meaning:** Workflow pattern where tasks pause for human approval or input.

**Use Cases:** Approval workflows, manual verification, compliance

---

### "Realtime Streams"
**Meaning:** Live data streams from backend to frontend (e.g., AI completions).

**Implementation:** WebSocket + Redis for pub/sub

---

## Glossary Usage Tips

**For New Contributors:**
1. Read this glossary first
2. Refer back when encountering unfamiliar terms
3. Suggest additions via PR

**For Documentation:**
- Link to this glossary when using technical terms
- Use consistent terminology across docs

**For Code Reviews:**
- Use proper terminology in comments
- Correct misuse of terms politely

---

**Next:** [Blog Series Overview →](../blog-series/00-series-outline.md)
