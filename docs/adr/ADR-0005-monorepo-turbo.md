# ADR-0005: Monorepo with Turbo vs Polyrepo

**Status:** Accepted
**Date:** 2024-06-15
**Deciders:** Engineering Team
**Technical Story:** Repository Structure and Build System

## Context

Trigger.dev consists of multiple related codebases:
- SDK packages (TypeScript client libraries)
- Platform (API server, worker coordinator, webapp)
- Internal packages (shared utilities, database client)
- CLI tools
- Examples and templates

**Requirements:**
- Easy to make changes across packages (e.g., SDK + platform)
- Shared tooling (TypeScript, ESLint, Vitest)
- Fast builds and tests (CI and local)
- Clear package boundaries and dependencies
- Support for versioning and publishing

**Constraints:**
- Team size: 5 engineers (small team, high coordination)
- Need to ship fast (iterate on SDK + platform together)
- Open-source (public repository)

## Decision

Use **pnpm monorepo** with **Turbo** for build orchestration.

**Structure:**
```
trigger.dev/
├── apps/
│   ├── webapp/           # Remix dashboard
│   └── coordinator/      # Worker coordinator service
├── packages/
│   ├── trigger-sdk/      # Public SDK
│   ├── cli/              # CLI tool
│   └── database/         # Prisma schema + client
├── internal-packages/
│   ├── run-engine/       # Execution engine
│   └── queue/            # Queue implementation
├── pnpm-workspace.yaml   # Workspace config
└── turbo.json            # Turbo pipeline
```

**Key tools:**
- **pnpm**: Package manager with workspace support
- **Turbo**: Build system (caching, parallelization)
- **TypeScript**: Shared configuration across packages
- **Changesets**: Version management and changelogs

## Alternatives Considered

### Alternative 1: Polyrepo (Separate Repositories)

**How it works:**
- Separate repo for each package
- SDK in `trigger.dev/sdk`
- Platform in `trigger.dev/platform`
- Publish to npm, consume as dependencies

**Pros:**
- Clear boundaries (separate repos = separate concerns)
- Independent versioning (SDK v2 while platform is v3)
- Smaller clones (only need SDK repo to contribute to SDK)
- Easier to open-source parts (SDK public, platform private)

**Cons:**
- Hard to coordinate changes across repos
- Version hell (SDK v1.2.3 with platform v4.5.6)
- Slower iteration (need to publish SDK to test in platform)
- Duplicated tooling (ESLint, TypeScript config in each repo)
- PRs across repos are complex (need to merge in order)

**Why rejected:**
- Need to iterate on SDK + platform together (too slow with polyrepo)
- Small team (coordination overhead too high)
- Common use case: "Add SDK method, use it in platform" (one PR is easier)

**Example pain point:**
- Change SDK API → publish to npm → update platform → test
- With monorepo: Change SDK → use immediately in platform

---

### Alternative 2: Yarn Workspaces (without Turbo)

**How it works:**
- Yarn workspaces for monorepo
- No build orchestration (manual or npm scripts)

**Pros:**
- Simpler than pnpm + Turbo
- Yarn is popular, well-known
- Workspaces handle dependencies

**Cons:**
- Yarn slower than pnpm (install times)
- Yarn less strict with peer dependencies
- No build caching (slower CI)
- No parallelization (slower builds)
- Yarn 1 is deprecated, Yarn 2+ has issues

**Why rejected:**
- pnpm is faster (benchmark: 30% faster installs)
- pnpm stricter (catches peer dep issues)
- Turbo provides huge value (caching, parallel builds)

**Benchmark (internal testing):**
- Yarn: 45 seconds (clean install)
- pnpm: 30 seconds (clean install)

---

### Alternative 3: Nx (Alternative to Turbo)

**How it works:**
- Nx for monorepo orchestration
- pnpm or npm for package management
- More features than Turbo (code generation, etc.)

**Pros:**
- Mature (older than Turbo)
- More features (generators, graph visualization)
- Good for large enterprises

**Cons:**
- Heavier (more config, more complexity)
- Slower than Turbo (benchmarks show Turbo is faster)
- Overkill for our use case (don't need generators)

**Why rejected:**
- Turbo is simpler (less config)
- Turbo is faster (benchmark: 20% faster builds)
- Don't need Nx's extra features
- Turbo has better DX (easier to understand)

**Sources:**
- Nx vs Turbo benchmark: https://turbo.build/repo/docs/benchmarks

---

## Consequences

### Positive

**1. Single PR for cross-package changes**
- Change SDK method → use in platform (one PR)
- Atomic commits (SDK + platform change together)
- Easier to review (all changes in one place)

**2. Shared tooling**
- One ESLint config (`eslint-config-custom`)
- One TypeScript config (`tsconfig.json` at root)
- One Vitest config (shared test setup)
- Consistent code style across packages

**3. Fast builds with Turbo**
- Remote caching (CI and local)
- Incremental builds (only rebuild changed packages)
- Parallel execution (build multiple packages at once)

**Example:**
- Without Turbo: 5 minutes (build all packages sequentially)
- With Turbo (cache hit): 10 seconds
- With Turbo (cache miss): 2 minutes (parallel)

**4. Easy to run locally**
- `pnpm install` (all packages)
- `pnpm dev` (start all apps)
- `pnpm test` (run all tests)

**5. Type-safe dependencies**
- TypeScript resolves types across packages
- Can import types from internal packages
- Catch breaking changes at compile-time

### Negative

**1. Large repo**
- 1,724 files (as of 2024-06)
- Large clones (~500 MB)
- VS Code can be slow (indexing all files)
- **Mitigation:** Use `.gitignore`, exclude `node_modules` from search

**2. Build complexity**
- Need to understand Turbo pipelines
- `turbo.json` can be confusing
- **Mitigation:** Good documentation, examples

**3. Version management**
- Need Changesets to manage versions
- Can't version packages independently (easily)
- **Mitigation:** Changesets handles this well

**4. CI runs all tests**
- Even small SDK change runs platform tests
- Longer CI times
- **Mitigation:** Turbo only runs affected tests (with caching)

### Neutral

**1. Tooling lock-in**
- Committed to pnpm + Turbo
- Switching would be painful
- **Impact:** Both are open-source, low risk

**2. Learning curve**
- New contributors need to learn monorepo structure
- **Mitigation:** Good documentation in README

---

## Implementation

Completed in initial repository setup

**Components:**
- [x] pnpm workspace config (`pnpm-workspace.yaml`)
- [x] Turbo pipeline config (`turbo.json`)
- [x] Shared TypeScript config (`tsconfig.json`)
- [x] Shared ESLint config (`packages/eslint-config-custom`)
- [x] Changesets setup (`.changeset/config.json`)

**Turbo pipeline:**
```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    }
  }
}
```

**Performance:**
- Clean build: ~2 minutes (parallel)
- Incremental build: ~10-30 seconds
- Cache hit: ~5-10 seconds

---

## References

**Internal:**
- Workspace config: `pnpm-workspace.yaml`
- Turbo config: `turbo.json`
- Package structure: `packages/`, `apps/`, `internal-packages/`

**External:**
- pnpm workspaces: https://pnpm.io/workspaces
- Turbo docs: https://turbo.build/repo/docs
- Changesets: https://github.com/changesets/changesets

**Comparison articles:**
- Monorepo vs Polyrepo: https://monorepo.tools/
- pnpm vs Yarn vs npm: https://pnpm.io/benchmarks
- Turbo vs Nx: https://turbo.build/repo/docs/benchmarks

---

## Superseded By

None (still active as of 2025-11)

---

## Future Considerations

**1. Remote caching:**
- Use Vercel Remote Cache (Turbo)
- Share cache across team and CI
- **Decision:** Enabled in v2.0

**2. Module federation:**
- If packages become too large, consider splitting
- Use Module Federation for runtime sharing
- **Decision:** Not needed yet (repo size manageable)

**3. Splitting repos:**
- If codebase grows too large (>5000 files)
- Consider splitting SDK into separate repo
- **Decision:** Monitor repo size, not urgent

**4. Bazel (extreme alternative):**
- If we need even faster builds
- Bazel is more powerful but very complex
- **Decision:** Turbo is sufficient for now
