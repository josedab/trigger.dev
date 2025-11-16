# Trigger.dev Repository Structure

**Analysis Date:** November 16, 2025
**Commit SHA:** `19fa66931819371d607eff001b561aa783547734` (v4.1.0)

---

## Overview

Trigger.dev uses a **pnpm monorepo** structure managed by **Turbo**, containing:
- **5 applications** (backend services)
- **11 public packages** (published to npm)
- **15 internal packages** (infrastructure)
- **13+ reference examples** (testing and demos)

---

## Directory Tree

```
trigger.dev/
├── apps/                              # Backend applications (microservices)
│   ├── webapp/                        # Remix full-stack web app (dashboard + API)
│   ├── coordinator/                   # Task orchestration coordinator
│   ├── supervisor/                    # Worker lifecycle supervisor
│   ├── docker-provider/               # Docker container execution provider
│   └── kubernetes-provider/           # Kubernetes pod execution provider
│
├── packages/                          # Public npm packages
│   ├── trigger-sdk/                   # Main SDK (@trigger.dev/sdk)
│   ├── core/                          # Core runtime APIs (@trigger.dev/core)
│   ├── cli-v3/                        # CLI tool (trigger command)
│   ├── build/                         # Build extensions (@trigger.dev/build)
│   ├── react-hooks/                   # React hooks (@trigger.dev/react-hooks)
│   ├── rsc/                           # React Server Components integration
│   ├── python/                        # Python SDK (experimental)
│   ├── redis-worker/                  # Redis worker utilities
│   └── schema-to-json/                # Schema validation helpers
│
├── internal-packages/                 # Internal infrastructure (not published)
│   ├── database/                      # Prisma schema + migrations
│   ├── run-engine/                    # Task execution engine
│   ├── run-queue/                     # Redis-backed distributed queue
│   ├── schedule-engine/               # Cron and scheduled tasks
│   ├── cache/                         # Distributed caching layer
│   ├── redis/                         # Redis client wrapper
│   ├── tracing/                       # OpenTelemetry instrumentation
│   ├── clickhouse/                    # ClickHouse analytics integration
│   ├── otlp-importer/                 # OTLP protocol trace importer
│   ├── replication/                   # Database replication utilities
│   ├── emails/                        # Email sending service
│   ├── zod-worker/                    # Zod validation worker
│   └── testcontainers/                # Testing infrastructure
│
├── references/                        # Example projects and testing
│   ├── hello-world/                   # Basic task examples
│   ├── test-tasks/                    # Comprehensive task test suite
│   ├── nextjs-realtime/               # Next.js integration example
│   ├── realtime-streams/              # Streaming examples
│   ├── d3-chat/                       # AI chat demo
│   ├── d3-openai-agents/              # OpenAI agents demo
│   ├── bun-catalog/                   # Bun runtime examples
│   ├── python-catalog/                # Python task examples
│   └── effect/                        # Effect library integration
│
├── docker/                            # Docker configurations
│   ├── docker-compose.yml             # Full local stack (Postgres, Redis, ClickHouse)
│   ├── dev-compose.yml                # Development stack
│   ├── Dockerfile.postgres            # Custom Postgres with extensions
│   └── config/                        # Service configurations
│
├── docs/                              # Documentation source files
│
├── .github/                           # GitHub workflows and templates
│   └── workflows/                     # CI/CD pipelines
│       ├── pr_checks.yml              # Pull request validation
│       ├── unit-tests.yml             # Unit test runner
│       ├── typecheck.yml              # TypeScript type checking
│       ├── release.yml                # Release automation
│       ├── publish.yml                # Package publishing
│       └── publish-webapp.yml         # Webapp deployment
│
├── rules/                             # Build rules and linting configs
├── scripts/                           # Utility scripts
├── tests/                             # E2E tests (Playwright)
├── patches/                           # pnpm patches for dependencies
│
├── .changeset/                        # Changesets for versioning
├── .configs/                          # Shared configurations
├── .vscode/                           # VS Code workspace settings
│
├── package.json                       # Root package.json (monorepo config)
├── pnpm-workspace.yaml                # pnpm workspace definition
├── turbo.json                         # Turbo pipeline configuration
├── tsconfig.json                      # Base TypeScript config
├── prettier.config.js                 # Code formatting rules
├── .eslintignore                      # ESLint ignore patterns
├── .gitignore                         # Git ignore patterns
├── .env.example                       # Environment variables template
│
├── README.md                          # Project overview
├── CONTRIBUTING.md                    # Developer setup guide
├── LICENSE                            # Apache 2.0 license
├── CHANGESETS.md                      # Changesets documentation
├── RELEASE.md                         # Release process
└── CODE_OF_CONDUCT.md                 # Community guidelines
```

---

## Detailed Breakdown

### 📦 `apps/` - Backend Applications

#### `apps/webapp/`
**Purpose:** Main web application (dashboard + REST API + realtime)

**Technology:** Remix 2.1, React 18, Express, Socket.io

**Key Directories:**
```
webapp/
├── app/
│   ├── routes/                        # Remix routes (file-based routing)
│   │   ├── _app.tsx                   # Authenticated app layout
│   │   ├── api/                       # REST API endpoints
│   │   │   └── v1/                    # API v1
│   │   │       ├── tasks/             # Task trigger endpoints
│   │   │       ├── runs/              # Run management endpoints
│   │   │       └── schedules/         # Schedule management
│   │   ├── _app.orgs.$organizationSlug/  # Organization routes
│   │   └── login/                     # Authentication routes
│   ├── components/                    # React components
│   ├── services/                      # Business logic services
│   ├── models/                        # Domain models
│   ├── hooks/                         # React hooks
│   ├── utils/                         # Utility functions
│   ├── entry.server.tsx               # Server-side entry point
│   └── entry.client.tsx               # Client-side entry point
├── public/                            # Static assets
├── server.ts                          # Express server setup
├── package.json
└── tsconfig.json
```

**Responsibilities:**
- User authentication (GitHub OAuth, magic links)
- Project/organization management
- Task registry and run monitoring
- REST API for SDK
- Real-time updates via WebSocket
- Run logs and trace visualization

**Port:** 3030 (development)

---

#### `apps/coordinator/`
**Purpose:** Orchestrates task execution across workers

**Key Files:**
```
coordinator/
├── src/
│   ├── index.ts                       # Main orchestrator (~57KB)
│   ├── checkpointer.ts                # Checkpoint management
│   ├── exec.ts                        # Execution controller
│   └── types.ts                       # Type definitions
```

**Responsibilities:**
- Monitor worker pool
- Route tasks to available workers
- Handle task lifecycle (start, pause, resume, complete)
- Coordinate with RunEngine for state management

---

#### `apps/supervisor/`
**Purpose:** Monitors health and resource usage of workers

**Key Files:**
```
supervisor/
├── src/
│   ├── index.ts                       # Main supervisor
│   ├── resourceMonitor.ts             # CPU/memory tracking
│   └── workloadManager/               # Load distribution
```

**Responsibilities:**
- Health checks on workers
- Resource utilization tracking
- Auto-scaling decisions
- Failure detection and recovery

---

#### `apps/docker-provider/` & `apps/kubernetes-provider/`
**Purpose:** Execute tasks in isolated containers/pods

**Responsibilities:**
- Build container images from user code
- Manage container lifecycle
- Stream logs back to platform
- Handle resource allocation

---

### 📚 `packages/` - Public npm Packages

#### `packages/trigger-sdk/` (@trigger.dev/sdk)
**Size:** ~51KB (main file: `src/v3/shared.ts`)

**Exports:**
```typescript
// Main exports (src/v3/index.ts)
export { task }           // Define tasks
export { wait }           // Wait utilities
export { runs }           // Run management
export { auth }           // Authentication
export { cache }          // Distributed caching
export { streams }        // Realtime streaming
export { metadata }       // Run metadata
export { queue }          // Queue management
export { schemaTask }     // Schema-validated tasks
```

**Key Files:**
- `src/v3/shared.ts` - Task creation and triggering (51KB)
- `src/v3/streams.ts` - Realtime streaming API (19KB)
- `src/v3/wait.ts` - Wait/pause functionality (20KB)
- `src/v3/retry.ts` - Retry logic (16KB)
- `src/v3/runs.ts` - Run management APIs (14KB)
- `src/v3/ai.ts` - AI/LLM integrations

---

#### `packages/core/` (@trigger.dev/core)
**Purpose:** Core runtime APIs shared between SDK and platform

**Exports:**
```typescript
// Runtime APIs
export { logger }         // Structured logging
export { tracer }         // OpenTelemetry tracer
export { SemanticAttributes }  // Trace attributes
export { ApiClient }      // HTTP client
export { MACHINES }       // Machine presets
```

**Key Files:**
- `src/v3/logger-api.ts` - Logging infrastructure
- `src/v3/task-context-api.ts` - Task execution context
- `src/v3/tracer.ts` - Tracing instrumentation
- `src/v3/zodfetch.ts` - Zod-validated fetch client

---

#### `packages/cli-v3/` (trigger command)
**Purpose:** CLI tool for development and deployment

**Commands:**
```bash
trigger init              # Initialize project
trigger dev               # Local development
trigger deploy            # Deploy to cloud
trigger login/logout      # Authentication
trigger env               # Environment variables
trigger preview           # Preview branches
trigger promote           # Promote between environments
```

**Key Files:**
- `src/cli/index.ts` - CLI setup and command registration
- `src/commands/deploy.ts` - Deployment logic
- `src/commands/dev.ts` - Local development server

---

#### `packages/build/` (@trigger.dev/build)
**Purpose:** Build extensions for customizing task execution environment

**Available Extensions:**
```
extensions/
├── core/                 # Base utilities
├── prisma/               # Prisma ORM support
├── typescript/           # TypeScript compilation
├── puppeteer/            # Browser automation
├── playwright/           # Browser testing
├── audioWaveform/        # Audio processing
└── lightpanda/           # HTML parsing
```

**Usage:**
```typescript
// In trigger.config.ts
export default defineConfig({
  build: {
    extensions: [
      prismaExtension(),
      puppeteerExtension(),
    ]
  }
});
```

---

#### `packages/react-hooks/` (@trigger.dev/react-hooks)
**Purpose:** React hooks for frontend integration

**Exports:**
```typescript
export { useRun }          // Subscribe to run status
export { useTrigger }      // Trigger tasks from frontend
export { useRuns }         // List runs
export { useRealtimeRun }  // Realtime run updates
```

**Example:**
```typescript
const { run, isLoading } = useRun({ runId });
const { trigger } = useTrigger("my-task");
```

---

### 🔒 `internal-packages/` - Internal Infrastructure

#### `internal-packages/database/`
**Purpose:** Shared Prisma schema and database client

**Structure:**
```
database/
├── prisma/
│   ├── schema.prisma                  # 2,300+ lines, 100+ models
│   ├── migrations/                    # Database migrations
│   └── seed.ts                        # Seed data
├── generated/                         # Prisma client (auto-generated)
└── src/
    └── index.ts                       # Database client export
```

**Key Models:**
- **Users & Auth:** `User`, `Organization`, `OrgMember`, `PersonalAccessToken`
- **Tasks:** `BackgroundWorker`, `BackgroundWorkerTask`, `TaskRun`, `TaskRunAttempt`
- **Execution:** `TaskRunCheckpoint`, `Checkpoint`, `ExecutionSnapshot`
- **Scheduling:** `TaskSchedule`, `TaskScheduleInstance`
- **Queue:** `TaskQueue`, `BatchTaskRun`
- **Observability:** `TaskEvent`, `TaskRunTag`, `TaskRunCounter`
- **Advanced:** `Waitpoint`, `BulkActionGroup`, `ProjectAlert`

---

#### `internal-packages/run-engine/`
**Purpose:** Core task execution engine

**Size:** Main file ~57KB (`src/engine/index.ts`)

**Key Systems:**
```typescript
class RunEngine {
  dequeueSystem          // Dequeue runs from queue
  runAttemptSystem       // Manage attempt lifecycle
  executionSnapshotSystem // Capture execution state
  checkpointSystem       // Handle durability checkpoints
  waitpointSystem        // Human-in-the-loop pauses
  batchSystem            // Batch operations
  delayedRunSystem       // Delayed execution
  ttlSystem              // Time-to-live cleanup
  raceSimulationSystem   // Test race conditions
}
```

**Responsibilities:**
- Enqueue runs to Redis queue
- Dequeue and assign to workers
- Manage retry logic
- Handle checkpoints for durability
- Coordinate with Coordinator for execution

---

#### `internal-packages/run-queue/`
**Purpose:** Distributed task queue using Redis

**Features:**
- Fair queue selection strategy
- Distributed locks (prevent duplicate execution)
- Concurrency control per queue
- Priority ordering

**Implementation:**
```typescript
class RunQueue {
  async enqueue(runId, priority)
  async dequeue(limit)
  async acquireLock(runId)
  async releaseLock(runId)
}
```

---

#### `internal-packages/schedule-engine/`
**Purpose:** Manages scheduled/cron tasks

**Key Files:**
- `src/engine/index.ts` - Schedule execution logic (28KB)
- `src/engine/distributedScheduling.ts` - Distributed coordination
- `src/engine/scheduleCalculation.ts` - Cron parsing and next run calculation

**Features:**
- Cron expression parsing
- Distributed scheduling (prevents duplicate triggers)
- Schedule instance creation
- Timezone support

---

#### `internal-packages/tracing/`
**Purpose:** OpenTelemetry instrumentation

**Exports:**
```typescript
export { tracer }          // OpenTelemetry tracer
export { instrumentExpress } // Express instrumentation
export { instrumentPrisma }  // Prisma instrumentation
```

**Collects:**
- Distributed traces (spans across services)
- Metrics (counters, gauges, histograms)
- Logs (structured with trace context)

---

#### `internal-packages/clickhouse/`
**Purpose:** ClickHouse analytics integration

**Schema:**
- Event analytics (task events, run metrics)
- Trace data (span durations, attributes)
- Usage metrics (billing, quotas)

**Migrations:** Goose-based SQL migrations in `migrations/`

---

### 🧪 `references/` - Example Projects

#### `references/hello-world/`
**Purpose:** Basic task examples for local testing

**Usage:** Manual testing ground for SDK/CLI changes

**Tasks:**
```typescript
src/trigger/
├── hello-world.ts         # Simple task
├── scheduled.ts           # Scheduled task
├── retries.ts             # Retry examples
├── checkpoints.ts         # Checkpoint examples
└── streaming.ts           # Realtime streaming
```

**Setup:**
```bash
cd references/hello-world
pnpm exec trigger dev
```

---

#### `references/test-tasks/`
**Purpose:** Comprehensive test suite for task features

**Coverage:**
- All task lifecycle hooks
- Error handling scenarios
- Concurrency patterns
- Wait/pause functionality
- Batch operations

---

### 🐳 `docker/` - Docker Configurations

#### `docker-compose.yml`
**Services:**
- **database** - PostgreSQL 14 with `pg_partman` extension
- **redis** - Redis 7
- **clickhouse** - ClickHouse 25.6.2
- **electric** - Electric SQL sync layer
- **toxiproxy** - Network chaos testing
- **nginx-h2** - HTTP/2 proxy

**Usage:**
```bash
pnpm run docker        # Start all services
pnpm run docker:stop   # Stop services
```

---

### ⚙️ Configuration Files

#### `turbo.json`
**Purpose:** Turbo pipeline configuration for monorepo builds

**Pipelines:**
```json
{
  "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
  "dev": { "cache": false, "dependsOn": ["^build"] },
  "test": { "dependsOn": ["^build"] },
  "typecheck": { "dependsOn": ["^build"] }
}
```

**Global Environment Variables:**
- `DATABASE_URL`, `DIRECT_URL`
- `SESSION_SECRET`, `ENCRYPTION_KEY`
- `AUTH_GITHUB_CLIENT_ID/SECRET`
- `TRIGGER_API_KEY`, `TRIGGER_API_URL`

---

#### `pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'integrations/*'
```

**Patches Applied:**
- `graphile-worker@0.16.6` - Custom patches
- `redlock@5.0.0-beta.2` - Lock improvements
- `@kubernetes/client-node@1.0.0` - K8s fixes

---

## Package Dependency Graph

```
┌─────────────────────────────────────────────────────┐
│                   End Users                          │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  @trigger.dev/sdk           │  (Public)
         └─────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  @trigger.dev/core          │  (Public)
         └─────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│  webapp          │      │  CLI (trigger)   │  (Public)
└──────────────────┘      └──────────────────┘
          │                         │
          └────────────┬────────────┘
                       ▼
         ┌─────────────────────────────┐
         │  @internal/database         │  (Internal)
         └─────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│ @internal/       │      │ @internal/       │
│ run-engine       │      │ schedule-engine  │
└──────────────────┘      └──────────────────┘
          │                         │
          └────────────┬────────────┘
                       ▼
         ┌─────────────────────────────┐
         │  @internal/run-queue        │
         └─────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│ @internal/redis  │      │ @internal/cache  │
└──────────────────┘      └──────────────────┘
```

---

## File Naming Conventions

### TypeScript Files
- **Components:** PascalCase (`TaskRunPanel.tsx`)
- **Utilities:** camelCase (`formatDuration.ts`)
- **Types:** PascalCase (`types.ts` with exported `TaskRun` type)
- **Hooks:** camelCase with `use` prefix (`useRun.ts`)
- **Services:** camelCase (`taskService.ts`)

### Test Files
- Unit tests: `*.test.ts` or `*.spec.ts`
- E2E tests: `*.e2e.ts` (in `/tests/`)

### Configuration
- TypeScript: `tsconfig.json`, `tsconfig.build.json`
- Build: `turbo.json`, `package.json`
- Linting: `.eslintrc.js`, `.prettierrc`

---

## Build Artifacts

**Generated Directories (gitignored):**
```
node_modules/          # Dependencies
dist/                  # Compiled TypeScript
build/                 # Build output
.turbo/                # Turbo cache
.tshy/                 # tshy build cache
public/build/          # Frontend bundles
generated/             # Prisma client
```

---

## Summary

The repository structure reflects a **mature, well-organized monorepo** with:
- Clear separation between public packages, internal infrastructure, and applications
- Consistent naming conventions
- Comprehensive tooling (Turbo, pnpm, Prisma, OpenTelemetry)
- Strong developer experience (hot reload, local Docker stack)

**Strengths:**
- ✅ Logical organization by concern (apps, packages, internal)
- ✅ Effective use of monorepo tooling (Turbo, pnpm workspaces)
- ✅ Clear public vs. internal package distinction

**Opportunities:**
- ⚠️  Large monorepo can be slow without optimized caching
- ⚠️  Could benefit from more granular package splitting (e.g., separate auth package)

---

**Next:** [Dependency Graph →](./dependency-graph.md)
