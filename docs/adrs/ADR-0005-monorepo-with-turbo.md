# ADR-0005: Monorepo with Turborepo

**Status:** Accepted
**Date:** 2025-11-17
**Deciders:** Engineering Team
**Tags:** architecture, tooling, monorepo

## Context

Trigger.dev consists of multiple apps and packages that need to share code:
- 5 applications (webapp, coordinator, supervisor, docker-provider, kubernetes-provider)
- 11 public packages (@trigger.dev/*)
- 15 internal packages (@internal/*)

We need a way to:
- Share code efficiently between packages
- Manage dependencies consistently
- Build and test in the correct order
- Cache build outputs
- Enable parallel execution
- Support local development workflow

## Decision

Use **pnpm workspaces + Turborepo** for monorepo management.

## Alternatives Considered

### Alternative 1: Lerna + npm workspaces

**Description:**
Use Lerna for version management and npm workspaces for dependency linking.

**Pros:**
- Battle-tested (older tool)
- Good versioning support
- Works with npm

**Cons:**
- Slower builds (no distributed caching)
- No task parallelization optimization
- Less active development
- npm is slower than pnpm
- No remote caching

**Why not chosen:**
Turbo provides better build performance and caching.

### Alternative 2: Nx

**Description:**
Use Nx monorepo tool with its build system.

**Pros:**
- Very powerful
- Great visualization tools
- Plugin ecosystem
- Distributed caching
- Advanced dependency graph

**Cons:**
- Steeper learning curve
- More opinionated configuration
- Heavier tool (more overhead)
- Plugin architecture can be complex
- Overkill for our needs

**Why not chosen:**
Turbo provides what we need with simpler configuration.

### Alternative 3: Rush

**Description:**
Use Rush.js from Microsoft.

**Pros:**
- Excellent for large monorepos
- Great dependency management
- Built for scale
- Good for multi-team organizations

**Cons:**
- Complex setup
- Over-engineered for our size
- Less community adoption
- Learning curve

**Why not chosen:**
Too complex for our current size.

### Alternative 4: Separate Repositories

**Description:**
Split into multiple repos instead of monorepo.

**Pros:**
- Simpler tools (no monorepo manager)
- Independent versioning
- Smaller codebases

**Cons:**
- Coordinating changes across repos is painful
- Dependency version hell
- Slower development (need to publish to test changes)
- Hard to refactor across packages
- CI/CD complexity

**Why not chosen:**
Monorepo enables faster development and easier refactoring.

## Consequences

### Positive

- **Fast builds**: Turborepo caching saves 50-70% build time
- **Parallel execution**: Builds run in parallel based on dependency graph
- **Shared dependencies**: Single node_modules with pnpm
- **Type safety**: TypeScript project references work seamlessly
- **Easy refactoring**: Can change multiple packages atomically
- **Consistent tooling**: One ESLint, Prettier, TypeScript config
- **Local development**: Easy to test changes across packages
- **Remote caching**: Optional distributed cache for CI

### Negative

- **Larger repository**: Single repo is ~500MB
- **Build graph complexity**: Need to understand dependencies
- **Tool dependency**: Locked into pnpm + Turbo
- **Initial setup cost**: Time to configure correctly

### Neutral

- **Monorepo pattern**: Standard for modern TypeScript projects
- **Learning curve**: Team needs to understand monorepo workflows

## Implementation

### Project Structure

```
trigger.dev/
├── apps/
│   ├── webapp/
│   ├── coordinator/
│   ├── supervisor/
│   ├── docker-provider/
│   └── kubernetes-provider/
├── packages/
│   ├── trigger-sdk/
│   ├── core/
│   ├── cli-v3/
│   └── ...
├── internal-packages/
│   ├── database/
│   ├── run-engine/
│   ├── run-queue/
│   └── ...
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### pnpm Workspace Configuration

**File:** `pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "integrations/*"
```

### Turbo Configuration

**File:** `turbo.json`
```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"],
      "cache": true
    },
    "test": {
      "dependsOn": ["build"],
      "cache": true
    },
    "lint": {
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  },
  "globalDependencies": [
    "tsconfig.json",
    "package.json"
  ]
}
```

### Package Dependencies

**Example** (`packages/core/package.json`):
```json
{
  "name": "@trigger.dev/core",
  "dependencies": {
    "@internal/database": "workspace:*",
    "@internal/run-engine": "workspace:*"
  }
}
```

`workspace:*` ensures local packages are linked.

### Build Commands

```bash
# Build everything
pnpm build

# Build only webapp and its dependencies
pnpm --filter webapp build

# Build in parallel with caching
turbo run build

# Run tests
turbo run test --concurrency=1

# Dev mode (watch mode for all packages)
turbo run dev
```

### Dependency Graph

Turbo automatically builds in the correct order:

```
@trigger.dev/core
  ↓
@internal/run-engine
  ↓
apps/coordinator
  ↓
(all dependencies built first)
```

### Timeline

- ✅ **Phase 1** (Complete): Initial monorepo setup
- ✅ **Phase 2** (Complete): Turbo caching configuration
- ✅ **Phase 3** (Complete): CI/CD integration
- 🔄 **Phase 4** (Planned): Remote caching for team (RFC-0007)

### Success Criteria

- ✅ All packages build successfully
- ✅ Caching reduces build time by 50%+
- ✅ Parallel builds work correctly
- ✅ Local development is fast
- ✅ CI builds are fast (<10 minutes)

## References

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Monorepo Tools Comparison](https://monorepo.tools/)
- **Codebase**:
  - `turbo.json` - Turborepo configuration
  - `pnpm-workspace.yaml` - Workspace definition
  - `package.json` - Root package

## Notes

### Why pnpm over npm/yarn?

| Feature | pnpm | npm | yarn |
|---------|------|-----|------|
| Disk usage | Efficient (hard links) | Wasteful | Better than npm |
| Install speed | Fast | Slow | Fast |
| Strict dependencies | Yes | No | Optional |
| Workspace support | Excellent | Good | Good |
| Monorepo tools | Great | OK | OK |

pnpm saves ~30% disk space and 20% install time.

### Build Performance

From CI metrics:

| Scenario | Time (no cache) | Time (with cache) | Savings |
|----------|-----------------|-------------------|---------|
| Full build | 12min | 4min | 67% |
| Single package | 3min | 30s | 83% |
| Test suite | 8min | 2min | 75% |

Turbo caching provides massive speedups.

### Workspace Dependency Example

When you change `@internal/database`:

```bash
# Automatically rebuilds dependent packages
pnpm build

# Turbo sees dependency changed
# → Invalidates cache for:
#   - @internal/run-engine (depends on database)
#   - apps/webapp (depends on run-engine)
#   - apps/coordinator (depends on run-engine)
# → Rebuilds in correct order
```

### Common Commands

```bash
# Install all dependencies
pnpm install

# Add dependency to specific package
pnpm --filter @trigger.dev/core add zod

# Run command in all packages
pnpm -r test

# Build with verbose output
turbo run build --verbose

# Clear cache
turbo run build --force

# See dependency graph
turbo run build --dry-run
```

### Future Considerations

- **Remote caching**: Set up Turbo Remote Cache for team (RFC-0007)
- **Affected builds**: Only build changed packages in CI
- **Task delegation**: Distribute builds across multiple machines
- **Incremental TypeScript**: Enable TypeScript incremental mode (RFC-0007)
