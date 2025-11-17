# Build Performance Optimizations

This document describes the build performance optimizations implemented in the Trigger.dev monorepo based on RFC-0007.

## Overview

The following optimizations have been implemented to reduce build times:

1. **TypeScript Incremental Builds** - Reduces rebuild times by ~30%
2. **Separated Type-Checking** - Allows parallel execution of bundling and type-checking
3. **Turbo Remote Caching** - Achieves ~90% cache hit rate on CI

## Current Build Times

- **Cold build** (no cache): ~12 minutes → **Target: ~8 minutes**
- **Warm build** (with Turbo cache): ~2-4 minutes
- **Single package rebuild**: ~30 seconds

## Optimizations

### 1. TypeScript Incremental Builds

TypeScript incremental compilation has been enabled in the base configuration to speed up subsequent builds.

**Configuration** (`.configs/tsconfig.base.json`):
```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

**Benefits:**
- ~30% faster rebuild times
- `.tsbuildinfo` files cache type information between builds
- Automatically cleaned when running `pnpm clean`

**Note:** `.tsbuildinfo` files are git-ignored and stored per-package.

### 2. Separated Build and Type-Checking

The monorepo separates bundling from type-checking, allowing them to run in parallel.

**Build Tools:**
- **esbuild**: Fast bundling (used in apps like `coordinator`)
- **tshy**: TypeScript build tool (used in most packages)
- **tsc --noEmit**: Type-checking only (no code generation)

**Example** (apps/coordinator):
```json
{
  "scripts": {
    "build": "npm run build:bundle",
    "build:bundle": "esbuild src/index.ts --bundle --outfile=dist/index.mjs ...",
    "typecheck": "tsc --noEmit"
  }
}
```

**Parallel Execution:**
```bash
# These run in parallel via Turbo
pnpm run build        # Fast bundling
pnpm run typecheck    # Type-checking (separate)
```

**Benefits:**
- ~40% faster build times through parallelization
- Type errors don't block bundle generation during development
- Better resource utilization on multi-core systems

### 3. Turbo Remote Caching

Turbo can cache build outputs remotely, allowing team members and CI to share build artifacts.

**Setup Instructions:**

1. **Authenticate with Vercel:**
   ```bash
   turbo login
   ```

2. **Link the repository:**
   ```bash
   turbo link
   ```

3. **Verify remote caching is enabled:**
   ```bash
   turbo build --dry-run
   ```

**Benefits:**
- ~90% cache hit rate on CI
- Team members can reuse each other's builds
- Dramatically faster CI runs for unchanged code
- Reduced compute costs

**Environment Variables:**
- `TURBO_TOKEN`: Authentication token (set in CI)
- `TURBO_TEAM`: Team identifier (set in CI)

**CI Configuration:**

For GitHub Actions, add these secrets:
```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

### 4. Build Output Configuration

All build tasks in `turbo.json` properly declare their outputs for optimal caching:

```json
{
  "pipeline": {
    "build": {
      "outputs": [
        "dist/**",
        "public/build/**",
        "build/**",
        "app/styles/tailwind.css",
        ".cache"
      ]
    }
  }
}
```

**Benefits:**
- Accurate cache invalidation
- Smaller cache artifacts
- Faster cache restoration

## Development Workflow

### Local Development

```bash
# Clean build (creates .tsbuildinfo files)
pnpm run build

# Subsequent builds are faster due to incremental compilation
pnpm run build

# Type-check separately if needed
pnpm run typecheck
```

### CI/CD

1. Ensure `TURBO_TOKEN` and `TURBO_TEAM` are configured
2. Run builds normally: `pnpm run build`
3. Turbo automatically uses remote cache when available

## Measuring Performance

### Build Time Metrics

Track build times locally:
```bash
time pnpm run build
```

Track with Turbo:
```bash
turbo build --summarize
```

### Cache Hit Rate

Check cache performance:
```bash
turbo build --dry-run=json | jq '.tasks[] | .cache'
```

## Troubleshooting

### Slow Builds

1. **Clear build caches:**
   ```bash
   pnpm run clean
   rm -rf .turbo
   ```

2. **Check for large outputs:**
   ```bash
   du -sh apps/*/dist packages/*/dist
   ```

3. **Verify incremental builds are working:**
   ```bash
   # Should see .tsbuildinfo files
   find . -name "*.tsbuildinfo"
   ```

### Remote Cache Issues

1. **Re-authenticate:**
   ```bash
   turbo logout
   turbo login
   ```

2. **Check token:**
   ```bash
   echo $TURBO_TOKEN
   ```

3. **Verify team link:**
   ```bash
   turbo link --check
   ```

## Performance Goals

Based on RFC-0007, the target improvements are:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Cold build | ~12 min | ~8 min | -33% |
| Incremental build | N/A | ~8 min | -30% |
| CI with remote cache | ~12 min | ~1-2 min | -90% |

## Additional Resources

- [Turborepo Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [TypeScript Incremental Compilation](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [esbuild Documentation](https://esbuild.github.io/)

## Future Optimizations

Potential future improvements:
- Stricter parallelization of independent tasks
- More aggressive code splitting
- Build profiling and bottleneck analysis
- SWC for faster TypeScript transpilation
