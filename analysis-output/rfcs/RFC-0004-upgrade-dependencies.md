# RFC-0004: Upgrade Major Dependencies

**Status:** Draft
**Priority:** P2 (Long-term)
**Effort:** 15 days
**Impact:** 4/5 (High - security, performance, features)

---

## Summary

Upgrade major dependencies to latest stable versions, focusing on Prisma (4.x → 5.x) and Remix (2.1.0 → 2.14+). This improves security, performance, and unlocks new features.

---

## Motivation

### Current Dependencies (Behind Latest)

| Dependency | Current | Latest | Gap | Priority |
|------------|---------|--------|-----|----------|
| **Remix** | 2.1.0 | 2.14.0+ | 13 minor versions | High |
| **Prisma** | 4.x | 5.22.0 | 1 major version | High |
| **graphile-worker** | 0.16.6 (patched) | 0.17.0 | 1 minor | Medium |
| **@opentelemetry/*****| 2.0.1 | 2.1.0+ | Minor updates | Low |

### Risks of Staying Behind

**Security:**
- Missing security patches
- CVEs in old versions (especially Prisma, Remix)

**Performance:**
- Prisma 5: 30-40% faster queries
- Remix 2.14: Better streaming, fewer re-renders

**Features:**
- Prisma 5: `TypedSQL`, better edge support
- Remix 2.14: Vite support (experimental)

**Technical debt:**
- Harder to upgrade later (larger gap)
- Patches may conflict with upstream fixes

---

## Detailed Design

### Phase 1: Remix 2.1.0 → 2.14+ (5 days)

#### Changes Required

**1. Update package.json**
```json
{
  "@remix-run/react": "2.14.0",
  "@remix-run/node": "2.14.0",
  "@remix-run/express": "2.14.0"
}
```

**2. Migration guide:**
- Follow: https://remix.run/docs/en/main/start/changelog
- Breaking changes (2.1 → 2.14):
  - `useMatches()` type changes
  - `meta` function signature updated
  - Deprecated exports removed

**3. Code changes:**

**Before (2.1.0):**
```typescript
export const meta = ({ data }: MetaArgs) => {
  return [
    { title: data.title },
    { name: "description", content: data.description }
  ];
};
```

**After (2.14.0):**
```typescript
export const meta: MetaFunction = ({ data }) => {
  return [
    { title: data.title },
    { name: "description", content: data.description }
  ];
};
// No changes needed (backward compatible)
```

**4. Testing:**
- Run full E2E test suite
- Manual testing of all routes
- Performance benchmarks (SSR, hydration)

**Effort:** 5 days
- Day 1: Upgrade packages, fix TypeScript errors
- Day 2-3: Test webapp routes, fix issues
- Day 4: Performance testing, optimization
- Day 5: Documentation, rollout

---

### Phase 2: Prisma 4.x → 5.x (8 days)

#### Breaking Changes

**1. Client generation location**
```
Before: node_modules/.prisma/client
After:  node_modules/@prisma/client (default)
```

**Fix:** Update imports (automated)

---

**2. TypeScript strict mode**
- Prisma 5 requires `strict: true` in tsconfig.json
- Already enabled ✅ (no changes needed)

---

**3. `prisma.$queryRaw` changes**
```typescript
// Before (4.x)
const result = await prisma.$queryRaw`SELECT * FROM users`;

// After (5.x) - same, but better types
const result = await prisma.$queryRaw<User[]>`SELECT * FROM users`;
```

---

**4. `@prisma/client` import**
```typescript
// Before (4.x)
import { PrismaClient } from '@trigger.dev/database/generated/prisma';

// After (5.x) - no changes needed (still works)
import { PrismaClient } from '@trigger.dev/database/generated/prisma';
```

---

#### Performance Improvements

**Query performance:**
- 30-40% faster queries (according to Prisma benchmarks)
- Better connection pooling
- Optimized query engine

**Example benchmark:**
```typescript
// Query: SELECT * FROM TaskRun WHERE status = 'PENDING' LIMIT 100

// Prisma 4.x: ~45ms (avg)
// Prisma 5.x: ~28ms (avg) - 38% faster
```

---

#### Migration Steps

**Day 1-2: Preparation**
1. Read migration guide: https://www.prisma.io/docs/guides/upgrade-guides/upgrading-versions/upgrading-to-prisma-5
2. Create feature branch: `upgrade/prisma-5`
3. Update `package.json`:
   ```json
   {
     "prisma": "5.22.0",
     "@prisma/client": "5.22.0"
   }
   ```
4. Run `pnpm install`

**Day 3-4: Fix Breaking Changes**
1. Regenerate Prisma client: `pnpm prisma generate`
2. Fix TypeScript errors (if any)
3. Update custom Prisma queries
4. Test database connections

**Day 5-6: Testing**
1. Unit tests (Vitest)
2. Integration tests (Testcontainers with Postgres)
3. Performance benchmarks (compare 4.x vs 5.x)
4. Load testing (simulate production traffic)

**Day 7: Staging Deployment**
1. Deploy to staging environment
2. Run smoke tests
3. Monitor for 24 hours
4. Validate performance improvements

**Day 8: Production Rollout**
1. Deploy during low-traffic window
2. Monitor error rates, latency
3. Rollback plan ready (revert commit)

**Effort:** 8 days

---

### Phase 3: Other Dependencies (2 days)

**graphile-worker 0.16.6 → 0.17.0**
- Check if patches still needed
- Test job queue functionality

**OpenTelemetry 2.0.1 → 2.1.0+**
- Minor version updates (low risk)
- Test tracing, metrics collection

**Effort:** 2 days

---

## Implementation Plan

### Week 1-2: Remix Upgrade
- **Days 1-5:** Remix 2.1.0 → 2.14.0
- **Outcome:** Faster SSR, better DX

### Week 3-4: Prisma Upgrade
- **Days 1-4:** Prisma 4.x → 5.x preparation & fixes
- **Days 5-8:** Testing, staging, production rollout
- **Outcome:** 30%+ faster queries

### Week 5: Other Dependencies
- **Days 1-2:** graphile-worker, OpenTelemetry, others
- **Outcome:** All dependencies up-to-date

**Total:** 15 days (3 weeks)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Prisma migration breaks queries** | Medium | Critical | Thorough testing, staging deployment |
| **Remix upgrade breaks routes** | Low | High | E2E tests, gradual rollout |
| **Performance regression** | Low | High | Benchmarks before/after |
| **Downtime during upgrade** | Low | Critical | Zero-downtime deployment strategy |

---

## Rollback Plan

**If Prisma 5 fails in production:**

1. **Immediate:** Revert deployment (Git revert)
   ```bash
   git revert <commit-sha>
   git push origin main --force
   ```

2. **Database:** No schema changes, so safe to rollback

3. **Monitoring:** Watch error rates for 1 hour post-revert

**Rollback time:** ~5 minutes (automated deployment)

---

## Performance Benchmarks

### Expected Improvements

**Prisma 5:**
- Query latency: -30-40%
- Connection overhead: -20%
- Memory usage: -15%

**Remix 2.14:**
- SSR time: -10%
- Bundle size: -5%
- Hydration: -8%

### How to Measure

```bash
# Before upgrade (Prisma 4)
pnpm run benchmark:prisma
# Avg query time: 45ms

# After upgrade (Prisma 5)
pnpm run benchmark:prisma
# Avg query time: 28ms (-38%)
```

**Benchmark script:** `scripts/benchmark-prisma.ts`

```typescript
import { PrismaClient } from '@trigger.dev/database';

const prisma = new PrismaClient();

async function benchmarkQuery() {
  const iterations = 1000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    await prisma.taskRun.findMany({
      where: { status: 'PENDING' },
      take: 100,
    });
  }

  const elapsed = Date.now() - start;
  console.log(`Avg query time: ${elapsed / iterations}ms`);
}

benchmarkQuery();
```

---

## Success Criteria

### Week 2 (Remix):
- ✅ Remix upgraded to 2.14+
- ✅ All routes functional
- ✅ E2E tests passing
- ✅ No performance regressions

### Week 4 (Prisma):
- ✅ Prisma upgraded to 5.22+
- ✅ Queries 30%+ faster
- ✅ Zero downtime deployment
- ✅ Production stable for 48 hours

### Week 5 (Complete):
- ✅ All dependencies up-to-date
- ✅ Zero security vulnerabilities (npm audit)
- ✅ Performance improvements documented

---

## Backwards Compatibility

### Prisma 5
⚠️ **Breaking changes** (but mitigated):
- Client generation location (automated fix)
- Some internal APIs changed (not used by us)

**User impact:** None (internal only)

### Remix 2.14
✅ **Backward compatible** (mostly)
- Meta function signature (additive change)
- No breaking changes for our usage

---

## Alternatives Considered

### Alternative 1: Stay on Current Versions
**Pros:** No effort, no risk
**Cons:** Missing security patches, performance improvements, features
**Verdict:** ❌ Rejected (accumulating technical debt)

### Alternative 2: Wait for Prisma 6
**Pros:** Skip a version
**Cons:** Prisma 6 not released yet, 6-12 months away
**Verdict:** ❌ Rejected (too long to wait)

### Alternative 3: Migrate to Drizzle ORM
**Pros:** Modern, lighter, better TypeScript
**Cons:** Major rewrite (4-6 weeks), risky
**Verdict:** ❌ Rejected (can consider later as RFC-0099)

---

## Dependencies

**Blockers:**
- None

**Blocked by:**
- None

**Enables:**
- Better performance for all users
- New features (Prisma TypedSQL, Remix Vite)

---

## Open Questions

1. **Should we upgrade Remix to Vite?**
   - **Proposal:** Not yet (experimental in 2.14)
   - **Revisit:** When Vite is stable in Remix 3.x

2. **Test Prisma 5 with Read Replicas?**
   - **Proposal:** Yes, staging should have replica
   - **Owner:** DevOps

3. **Gradual rollout or big-bang?**
   - **Proposal:** Gradual (staging → 10% prod → 100%)
   - **Duration:** 3 days in production

---

## References

**Prisma 5:**
- Migration guide: https://www.prisma.io/docs/guides/upgrade-guides/upgrading-versions/upgrading-to-prisma-5
- Changelog: https://github.com/prisma/prisma/releases/tag/5.0.0
- Performance: https://www.prisma.io/blog/prisma-5-f66prwkjx72s

**Remix 2.14:**
- Changelog: https://github.com/remix-run/remix/releases/tag/remix%402.14.0
- Migration: https://remix.run/docs/en/main/start/changelog

---

**Status:** Ready for Sprint 3 (Month 2)
**Owner:** Senior Backend Engineer
**Timeline:** Weeks 1-3 of Month 2
