# Build Performance Optimization Guide (RFC-0007)

This guide implements RFC-0007 to optimize build performance from 12min → 8min.

## Current Performance (Baseline)

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Cold build | 12min | 8min | -33% |
| Warm build | 4min | 2min | -50% |
| TypeScript compilation | 6min | 4min | -33% |
| Type checking only | 3min | 2min | -33% |

## Optimization 1: TypeScript Incremental Builds

### Enable Incremental Compilation

**File:** `.configs/tsconfig.base.json`

```json
{
  "compilerOptions": {
    // ... existing options ...

    // Enable incremental compilation
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo",

    // Composite projects for project references
    "composite": true,

    // Skip type checking of declaration files
    "skipLibCheck": true,

    // Faster but less safe type checking (optional)
    "skipDefaultLibCheck": true
  }
}
```

**Impact:** -30% build time on warm builds

### Use Project References

Project references allow TypeScript to build only changed packages.

**Example** (`packages/core/tsconfig.json`):
```json
{
  "extends": "../../.configs/tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "outDir": "./dist",
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../database" },
    { "path": "../../internal-packages/run-engine" }
  ]
}
```

**Build with project references:**
```bash
tsc --build --verbose
```

**Impact:** Only rebuilds changed projects + dependents

---

## Optimization 2: Separate Type Checking from Bundling

### Use esbuild for bundling, tsc for type checking

**Problem:** TypeScript's `tsc` is slow at both type checking AND bundling.

**Solution:** Use esbuild (40x faster) for bundling, tsc only for type checking.

**File:** `packages/core/package.json`

```json
{
  "scripts": {
    "build": "pnpm run build:types && pnpm run build:bundle",
    "build:types": "tsc --noEmit",
    "build:bundle": "esbuild src/index.ts --bundle --outdir=dist --platform=node --format=esm"
  }
}
```

**Comparison:**
| Tool | Type Check | Bundle | Total |
|------|------------|--------|-------|
| tsc only | 3min | 3min | 6min |
| tsc + esbuild | 3min | 30s | 3.5min |
| **Savings** | - | -2.5min | **-42%** |

---

## Optimization 3: Turbo Remote Caching

### Enable Remote Cache for Team

Turbo can share build caches across team members and CI.

**File:** `turbo.json`

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", ".tsbuildinfo"],
      "cache": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "cache": true
    }
  },
  "remoteCache": {
    "enabled": true
  }
}
```

**Setup Vercel Remote Cache (free for open source):**

```bash
# Link to Vercel
npx turbo login
npx turbo link

# Now builds will share cache with team
turbo run build
```

**Alternative: Self-hosted cache:**

Use S3, R2, or any S3-compatible storage:

```bash
# Set environment variables
export TURBO_API="https://your-cache-server.com"
export TURBO_TOKEN="your-token"
export TURBO_TEAM="your-team"

turbo run build
```

**Impact:** 90% cache hit rate = 90% faster builds for most devs

---

## Optimization 4: Optimize Turbo Pipeline

### Current Issues

- Some tasks run unnecessarily
- Dependencies not optimized
- No parallelization

### Optimized Configuration

**File:** `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [
        "dist/**",
        ".next/**",
        "build/**",
        ".tsbuildinfo"
      ],
      "cache": true,
      "persistent": false
    },

    "dev": {
      "cache": false,
      "persistent": true
    },

    "lint": {
      "outputs": [],
      "cache": true
    },

    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "cache": true,
      "inputs": [
        "src/**/*.ts",
        "src/**/*.tsx",
        "test/**/*.ts",
        "test/**/*.tsx"
      ]
    },

    "typecheck": {
      "outputs": [],
      "cache": true
    }
  },
  "globalDependencies": [
    "tsconfig.json",
    ".configs/tsconfig.base.json"
  ],
  "globalEnv": [
    "NODE_ENV"
  ]
}
```

**Key improvements:**
- `outputs`: Tells Turbo what to cache
- `inputs`: Only rebuild when these files change
- `globalDependencies`: Invalidate cache when these change

---

## Optimization 5: Parallel Builds

### Use Multiple CPU Cores

**Current:** Turbo uses all cores by default ✅

**Verify:**
```bash
turbo run build --concurrency=10
```

**For CI (limited cores):**
```bash
turbo run build --concurrency=4
```

---

## Optimization 6: Skip Unnecessary Steps

### Skip Tests in Development

```bash
# Development: Fast iteration
pnpm build --filter @trigger.dev/core --no-deps

# CI: Full build with tests
turbo run build test lint
```

### Skip Type Checking in Watch Mode

**File:** `packages/core/package.json`

```json
{
  "scripts": {
    "dev": "esbuild src/index.ts --bundle --watch --outdir=dist",
    "build": "pnpm run typecheck && pnpm run build:bundle",
    "typecheck": "tsc --noEmit"
  }
}
```

**Development workflow:**
```bash
# Terminal 1: Fast bundling (no type check)
pnpm dev

# Terminal 2: Type checking in watch mode (separate)
tsc --watch --noEmit
```

---

## Optimization 7: Reduce TypeScript Strictness (Optional)

**⚠️ Use with caution - reduces type safety**

For extremely fast builds, you can reduce strictness:

**File:** `.configs/tsconfig.fast.json`

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    // Skip checking node_modules
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,

    // Don't check unused variables (faster)
    "noUnusedLocals": false,
    "noUnusedParameters": false,

    // Don't generate declaration files (faster)
    "declaration": false,
    "declarationMap": false
  }
}
```

**Use only for local dev:**
```bash
tsc --project tsconfig.fast.json
```

**⚠️ CI should still use strict config!**

---

## Optimization 8: Build Cache Cleanup

### Clean Stale Caches

```bash
# Clean all build artifacts
turbo run clean

# Clean Turbo cache
rm -rf .turbo

# Clean TypeScript build info
find . -name ".tsbuildinfo" -delete

# Clean node_modules (nuclear option)
pnpm clean:node_modules
```

### Automated Cache Cleanup

**File:** `package.json`

```json
{
  "scripts": {
    "clean": "turbo run clean",
    "clean:cache": "rm -rf .turbo && find . -name '.tsbuildinfo' -delete",
    "clean:full": "pnpm clean:cache && pnpm clean:node_modules && pnpm install"
  }
}
```

---

## Optimization 9: CI/CD Optimizations

### GitHub Actions Example

**File:** `.github/workflows/ci.yml`

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'

      # Cache Turbo builds
      - name: Cache Turbo
        uses: actions/cache@v3
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-

      - run: pnpm install --frozen-lockfile

      # Build with Turbo caching
      - run: turbo run build test --cache-dir=.turbo

      # Upload coverage
      - uses: codecov/codecov-action@v3
        if: always()
```

**Key optimizations:**
- Cache pnpm store
- Cache Turbo builds
- Use frozen lockfile (faster install)
- Parallel builds with Turbo

---

## Expected Results

After implementing all optimizations:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Cold build** | 12min | 8min | **-33%** |
| **Warm build** | 4min | 2min | **-50%** |
| **CI build (cached)** | 12min | 2min | **-83%** |
| **Dev rebuild** | 30s | 5s | **-83%** |
| **Type check only** | 3min | 2min | **-33%** |

---

## Implementation Checklist

### Phase 1: TypeScript Incremental (2 days)

- [ ] Add `"incremental": true` to tsconfig.base.json
- [ ] Add `"composite": true` to all package tsconfigs
- [ ] Set up project references between packages
- [ ] Test build performance

### Phase 2: esbuild Integration (3 days)

- [ ] Install esbuild in all packages
- [ ] Add `build:bundle` scripts using esbuild
- [ ] Separate `build:types` (tsc) from `build:bundle` (esbuild)
- [ ] Update turbo.json to use new scripts
- [ ] Test all builds

### Phase 3: Turbo Remote Cache (2 days)

- [ ] Set up Vercel remote cache (or self-hosted)
- [ ] Update turbo.json with `remoteCache` config
- [ ] Update CI to use remote cache
- [ ] Test cache hit rates

### Phase 4: CI Optimization (1 day)

- [ ] Add Turbo cache to GitHub Actions
- [ ] Optimize cache keys
- [ ] Test CI build times

### Phase 5: Documentation (1 day)

- [ ] Document build process
- [ ] Create troubleshooting guide
- [ ] Train team on new workflow

**Total:** 9 days (vs 12 days in RFC estimate)

---

## Troubleshooting

### Build is still slow

1. Check Turbo cache:
   ```bash
   turbo run build --dry-run
   ```

2. Profile TypeScript:
   ```bash
   tsc --extendedDiagnostics
   ```

3. Check for circular dependencies:
   ```bash
   npx madge --circular --extensions ts ./packages
   ```

### Type errors after enabling incremental

- Clean build info: `find . -name ".tsbuildinfo" -delete`
- Rebuild: `turbo run build --force`

### Remote cache not working

- Check authentication: `turbo login`
- Verify connection: `turbo run build --dry-run`
- Check cache dir permissions

---

## Monitoring

### Track Build Performance

**File:** `.github/workflows/build-metrics.yml`

```yaml
name: Build Metrics

on: [push]

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3

      - run: pnpm install

      - name: Build with timing
        run: |
          START=$(date +%s)
          turbo run build
          END=$(date +%s)
          echo "Build time: $((END - START)) seconds"

      - name: Report metrics
        run: |
          echo "Build completed in $((END - START))s" >> $GITHUB_STEP_SUMMARY
```

---

## References

- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [esbuild Documentation](https://esbuild.github.io/)
- [RFC-0007: Build Performance Optimization](../analysis-output/rfcs/RFC-0007-build-performance.md)
