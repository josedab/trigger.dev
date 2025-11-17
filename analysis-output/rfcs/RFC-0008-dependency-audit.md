# RFC-0008: Dependency Audit & Cleanup

**Status:** Draft
**Priority:** P3 (Backlog)
**Effort:** 15 days
**Impact:** 2/5 (Low-Medium - bundle size, clarity)

---

## Summary

Audit all dependencies, remove unused packages, and identify opportunities to reduce bundle size.

---

## Motivation

**Current state:**
- Webapp: 200+ dependencies
- Unknown unused dependencies
- Potential duplicates (React versions, etc.)

**Goals:**
- Reduce dependencies by 20%
- Smaller bundle size (-10%)
- Clearer dependency tree

---

## Audit Process

### Step 1: Find Unused Dependencies

**Tool:** `depcheck`
```bash
pnpm add -D depcheck
pnpm depcheck
```

**Expected findings:** 15-20 unused packages

### Step 2: Find Duplicates

**Tool:** `npm-check-duplicates`
```bash
pnpm list --depth=Infinity | grep "@types/react"
```

**Fix:** Align versions in `pnpm.overrides`

### Step 3: Bundle Analysis

**Tool:** Remix built-in analyzer
```bash
pnpm run build --analyze
```

**Identify:** Heavy packages (>100KB)

---

## Implementation

**Week 1:** Audit, list findings
**Week 2-3:** Remove unused, fix duplicates, test
**Total:** 15 days

**Success:** 200 → 160 dependencies

---

**Status:** Backlog (Q2)
