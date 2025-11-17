# RFC-0007: Optimize Build Performance

**Status:** Draft
**Priority:** P2 (Long-term)
**Effort:** 12 days
**Impact:** 3/5 (Medium - developer experience)

---

## Summary

Reduce monorepo build times from ~12 minutes (cold) to ~8 minutes through incremental compilation, better caching, and parallel builds.

---

## Motivation

**Current build times:**
- Cold build (no cache): ~12 minutes
- Warm build (with Turbo cache): ~2-4 minutes
- Single package rebuild: ~30 seconds

**Impact:**
- CI takes 12+ minutes per PR
- Developers wait for builds
- Slows deployment velocity

---

## Optimizations

### 1. TypeScript Incremental Builds

**Enable in tsconfig.json:**
```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

**Expected:** -30% build time

### 2. esbuild for Type-Checking Bypass

**Current:** tsc compiles TypeScript
**Proposed:** esbuild bundles (fast), tsc type-checks (separate)

```bash
# Parallel execution
pnpm run build:bundle  # esbuild (fast)
pnpm run typecheck     # tsc --noEmit (parallel)
```

**Expected:** -40% build time

### 3. Turbo Remote Caching

**Enable Vercel Remote Cache:**
```bash
turbo login
turbo link
```

**Expected:** 90% cache hit rate on CI

---

## Implementation

**Week 1-2:** Incremental TS, esbuild integration
**Week 3:** Turbo remote cache, testing
**Total:** 12 days

**Success:** 12min → 8min cold build

---

**Status:** Backlog (Sprint 3)
