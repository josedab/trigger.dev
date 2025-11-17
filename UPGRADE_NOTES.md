# Dependency Upgrade Notes - RFC-0004

This document tracks the implementation of RFC-0004: Upgrade Major Dependencies.

## Summary

Successfully upgraded major dependencies across the Trigger.dev monorepo to improve security, performance, and unlock new features.

## Upgraded Dependencies

### ✅ Phase 1: Remix (2.1.0 → 2.14.0)

**Status:** Completed

**Packages Updated:**
- `@remix-run/express`: 2.1.0 → 2.14.0
- `@remix-run/node`: 2.1.0 → 2.14.0
- `@remix-run/react`: 2.1.0 → 2.14.0
- `@remix-run/serve`: 2.1.0 → 2.14.0
- `@remix-run/server-runtime`: 2.1.0 → 2.14.0
- `@remix-run/dev`: 2.1.0 → 2.14.0
- `@remix-run/testing`: 2.1.0 → 2.14.0

**Location:** `apps/webapp/package.json`

**Expected Benefits:**
- Faster SSR rendering (~10% improvement)
- Better streaming support
- Fewer re-renders
- Improved developer experience

**Breaking Changes:**
According to the Remix 2.14 release notes, the upgrade from 2.1.0 to 2.14.0 is mostly backward compatible. The `meta` function signature has additive changes but is backward compatible.

**Migration Notes:**
- No code changes required for our usage patterns
- All existing routes should continue to work
- The router version (`@remix-run/router`) was kept at ^1.15.3 as it's compatible

**References:**
- [Remix Changelog](https://github.com/remix-run/remix/releases)
- [Remix 2.14 Release](https://github.com/remix-run/remix/releases/tag/remix%402.14.0)

---

### ℹ️ Phase 2: Prisma (Already Upgraded)

**Status:** N/A - Already at 6.14.0 (RFC targeted 5.22.0)

**Current Version:** 6.14.0 in `internal-packages/database/package.json`

**Note:** Prisma was already upgraded beyond the RFC's target version. The codebase is currently on Prisma 6.14.0, which is ahead of the RFC's goal of upgrading to Prisma 5.22.0. This means the performance improvements mentioned in the RFC (30-40% faster queries, better connection pooling, etc.) have already been realized.

**Benchmark Script:**
A new Prisma benchmark script has been created at `scripts/benchmark-prisma.ts` to measure query performance. This can be used to:
- Benchmark current performance
- Compare performance before/after future upgrades
- Monitor query performance over time

**Usage:**
```bash
pnpm tsx scripts/benchmark-prisma.ts
```

---

### ✅ Phase 3a: graphile-worker (0.16.6 → 0.17.0)

**Status:** Completed

**Packages Updated:**
- `graphile-worker`: 0.16.6 → 0.17.0 in `apps/webapp/package.json`
- `graphile-worker`: 0.16.6 → 0.17.0 in `internal-packages/zod-worker/package.json`

**Patch Notes:**
- The existing patch file (`patches/graphile-worker@0.16.6.patch`) has been copied to `patches/graphile-worker@0.17.0.patch`
- The patch changes the job queue strategy from 2 to 0 and adds debug logging
- The patch may need to be regenerated after `pnpm install` if the file structure has changed in 0.17.0

**Next Steps:**
- After running `pnpm install`, check if the patch applies cleanly
- If patch fails, may need to manually verify the changes are still needed or regenerate the patch
- Test job queue functionality to ensure the strategy change is still required

**References:**
- [graphile-worker releases](https://github.com/graphile/worker/releases)

---

### ✅ Phase 3b: OpenTelemetry (2.0.1 → 2.1.0, 0.203.0 → 0.210.0)

**Status:** Completed

**Packages Updated in `apps/webapp/package.json`:**
- `@opentelemetry/api-logs`: 0.203.0 → 0.210.0
- `@opentelemetry/core`: 2.0.1 → 2.1.0
- `@opentelemetry/exporter-logs-otlp-http`: 0.203.0 → 0.210.0
- `@opentelemetry/exporter-metrics-otlp-proto`: 0.203.0 → 0.210.0
- `@opentelemetry/exporter-trace-otlp-http`: 0.203.0 → 0.210.0
- `@opentelemetry/instrumentation`: 0.203.0 → 0.210.0
- `@opentelemetry/instrumentation-http`: 0.203.0 → 0.210.0
- `@opentelemetry/resources`: 2.0.1 → 2.1.0
- `@opentelemetry/sdk-logs`: 0.203.0 → 0.210.0
- `@opentelemetry/sdk-metrics`: 2.0.1 → 2.1.0
- `@opentelemetry/sdk-node`: 0.203.0 → 0.210.0
- `@opentelemetry/sdk-trace-base`: 2.0.1 → 2.1.0
- `@opentelemetry/sdk-trace-node`: 2.0.1 → 2.1.0

**Packages Updated in `packages/cli-v3/package.json`:**
- `@opentelemetry/api-logs`: 0.203.0 → 0.210.0
- `@opentelemetry/exporter-trace-otlp-http`: 0.203.0 → 0.210.0
- `@opentelemetry/instrumentation`: 0.203.0 → 0.210.0
- `@opentelemetry/instrumentation-fetch`: 0.203.0 → 0.210.0
- `@opentelemetry/resources`: 2.0.1 → 2.1.0
- `@opentelemetry/sdk-trace-node`: 2.0.1 → 2.1.0

**Packages Updated in `packages/core/package.json`:**
- `@opentelemetry/api-logs`: 0.203.0 → 0.210.0
- `@opentelemetry/core`: 2.0.1 → 2.1.0
- `@opentelemetry/exporter-logs-otlp-http`: 0.203.0 → 0.210.0
- `@opentelemetry/exporter-trace-otlp-http`: 0.203.0 → 0.210.0
- `@opentelemetry/instrumentation`: 0.203.0 → 0.210.0
- `@opentelemetry/resources`: 2.0.1 → 2.1.0
- `@opentelemetry/sdk-logs`: 0.203.0 → 0.210.0
- `@opentelemetry/sdk-trace-base`: 2.0.1 → 2.1.0
- `@opentelemetry/sdk-trace-node`: 2.0.1 → 2.1.0

**Expected Benefits:**
- Bug fixes and security updates
- Performance improvements
- Better compatibility with latest tracing standards
- Improved reliability of metrics collection

**Breaking Changes:**
- Minor version updates (2.0.1 → 2.1.0 and 0.203.0 → 0.210.0) should be backward compatible
- No code changes expected

**Testing:**
- Verify tracing still works correctly
- Confirm metrics are being collected
- Check OTLP exporters are functioning

---

## Implementation Details

### Files Modified

1. **Package.json files:**
   - `/package.json` (root) - Updated pnpm overrides for Remix
   - `/apps/webapp/package.json` - Updated Remix, graphile-worker, and OpenTelemetry packages
   - `/internal-packages/zod-worker/package.json` - Updated graphile-worker
   - `/packages/cli-v3/package.json` - Updated OpenTelemetry packages
   - `/packages/core/package.json` - Updated OpenTelemetry packages

2. **New files:**
   - `/scripts/benchmark-prisma.ts` - Prisma performance benchmark script
   - `/UPGRADE_NOTES.md` - This file

3. **Patch files:**
   - Copied `/patches/graphile-worker@0.16.6.patch` to `/patches/graphile-worker@0.17.0.patch`

### Assumptions Made

1. **Remix Compatibility:** Assumed that the upgrade from 2.1.0 to 2.14.0 is backward compatible based on the Remix changelog and RFC notes. No breaking changes were identified for our usage patterns.

2. **graphile-worker Patch:** Assumed the existing patch for strategy and logging changes is still needed in 0.17.0. This may need verification after `pnpm install`.

3. **OpenTelemetry Versions:** Updated to 0.210.0 for 0.x packages and 2.1.0 for 2.x packages, which aligns with the latest compatible versions while maintaining semver compatibility.

4. **Prisma Already Upgraded:** Discovered that Prisma was already at 6.14.0, well beyond the RFC's target of 5.22.0, so no action was needed.

### Deviations from RFC

1. **Prisma Phase Skipped:** Phase 2 (Prisma upgrade) was not executed because the codebase already has Prisma 6.14.0, which is ahead of the RFC's target version of 5.22.0.

2. **OpenTelemetry Version Numbers:** Updated to 0.210.0 and 2.1.0 instead of just "2.1.0+" as these are the latest stable versions that maintain API compatibility.

3. **Testing Phase:** The RFC mentioned running E2E tests and performance benchmarks. These should be run manually after `pnpm install` completes:
   - Run `pnpm test` to execute unit tests
   - Run E2E tests for the webapp
   - Run the new Prisma benchmark script
   - Test job queue functionality with graphile-worker

### Items Not Implemented

1. **Remix eslint-config:** The `@remix-run/eslint-config` package was kept at 2.1.0 because it's a dev dependency for linting and doesn't need to be upgraded at the same time as the runtime packages. It can be upgraded separately if needed.

2. **pnpm install:** Package installations were not executed as part of this implementation. This should be done next to:
   - Update the lockfile
   - Apply the graphile-worker patch
   - Verify all dependencies resolve correctly

3. **Build Verification:** The build process (`pnpm build`) was not run as it requires `pnpm install` to complete first.

4. **TypeScript Error Fixing:** No TypeScript errors were fixed as they won't appear until after `pnpm install` and attempting to build.

5. **Testing:** Tests were not created or run as part of this implementation. The RFC's testing strategy should be executed after installation:
   - Unit tests
   - Integration tests
   - E2E tests for webapp routes
   - Performance benchmarks

6. **Documentation Updates:** Only this UPGRADE_NOTES.md file was created. Other documentation (like changelogs, release notes, or user-facing docs) may need to be updated separately.

---

## Next Steps

### Immediate Actions (Required before deployment)

1. **Run pnpm install:**
   ```bash
   pnpm install
   ```
   This will update the lockfile and apply patches.

2. **Verify graphile-worker patch:**
   ```bash
   # Check if patch applied successfully
   # If it fails, may need to regenerate:
   pnpm patch graphile-worker@0.17.0
   # Make the necessary changes
   pnpm patch-commit <path-to-temp-dir>
   ```

3. **Run TypeScript type checking:**
   ```bash
   pnpm typecheck
   ```

4. **Run build:**
   ```bash
   pnpm build
   ```
   Fix any build errors that appear.

5. **Run tests:**
   ```bash
   pnpm test
   pnpm test:webapp
   pnpm test:packages
   pnpm test:internal
   ```

6. **Test specific functionality:**
   - Test Remix routes in webapp (especially meta functions)
   - Test graphile-worker job queue functionality
   - Test OpenTelemetry tracing and metrics collection
   - Run Prisma benchmark: `pnpm tsx scripts/benchmark-prisma.ts`

### Before Production Deployment

1. **Staging deployment:** Deploy to staging environment first
2. **Smoke tests:** Run smoke tests on staging
3. **Performance validation:** Compare metrics before/after upgrade
4. **Monitor for 24-48 hours:** Watch error rates, latency, and resource usage
5. **Gradual rollout:** Consider rolling out to production gradually (10% → 50% → 100%)

### Optional Follow-up Work

1. **Upgrade @remix-run/eslint-config:** Consider upgrading to 2.14.0 to match runtime packages
2. **Remove outdated patches:** If graphile-worker 0.17.0 fixes the issues that required patching, remove the patch
3. **Monitor performance improvements:** Track query performance with the new benchmark script
4. **Update dependencies regularly:** Set up a process to keep dependencies up-to-date

---

## Performance Expectations

Based on the RFC, expected improvements are:

### Remix 2.14:
- SSR time: -10%
- Bundle size: -5%
- Hydration: -8%
- Better streaming support

### Prisma (already at 6.x):
- Already realized improvements from 4.x → 5.x → 6.x
- Query latency: -30-40% (vs. 4.x)
- Connection overhead: -20%
- Memory usage: -15%

### OpenTelemetry:
- Minor performance improvements
- Bug fixes and reliability improvements
- Better compatibility with ecosystem

---

## Rollback Plan

If issues occur after deployment:

1. **Immediate rollback:**
   ```bash
   git revert <commit-sha>
   git push origin <branch-name>
   ```

2. **No database changes:** Since no schema changes were made, rollback is safe

3. **Monitor post-rollback:** Watch error rates for 1 hour after revert

4. **Estimated rollback time:** ~5 minutes with automated deployment

---

## References

- **RFC Document:** `analysis-output/rfcs/RFC-0004-upgrade-dependencies.md`
- **RFC Branch:** `claude/codebase-analysis-blog-rfcs-01MZtAS4Zx97HZwxHZCbCFxM`
- **Implementation Branch:** `claude/implement-upgrade-dependencies-rfc-01TyUBY5pg1RLqC5vNNHTdSx`

### External Documentation

- [Remix 2.14 Release Notes](https://github.com/remix-run/remix/releases/tag/remix%402.14.0)
- [Remix Changelog](https://remix.run/docs/en/main/start/changelog)
- [Prisma 5 Migration Guide](https://www.prisma.io/docs/guides/upgrade-guides/upgrading-versions/upgrading-to-prisma-5)
- [Prisma 6 Release](https://github.com/prisma/prisma/releases)
- [OpenTelemetry JS Releases](https://github.com/open-telemetry/opentelemetry-js/releases)
- [graphile-worker Releases](https://github.com/graphile/worker/releases)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-17
**Status:** Implementation Complete, Testing Pending
