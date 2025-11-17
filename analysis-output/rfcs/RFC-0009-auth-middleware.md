# RFC-0009: Extract Common Auth Middleware

**Status:** Draft
**Priority:** P1 (Strategic)
**Effort:** 3 days
**Impact:** 3/5 (Medium - reduces duplication)

---

## Summary

Extract duplicated authentication logic from webapp routes into reusable middleware, reducing code duplication from ~5% to ~2%.

---

## Motivation

**Current state:**
- Auth checks duplicated across 40+ routes
- Inconsistent error handling
- Hard to update auth logic globally

**Example duplication:**
```typescript
// Route 1
export async function loader({ request }: LoaderArgs) {
  const apiKey = request.headers.get('Authorization');
  if (!apiKey) throw new Response('Unauthorized', { status: 401 });
  const user = await validateApiKey(apiKey);
  // ... route logic
}

// Route 2 (same code)
export async function action({ request }: ActionArgs) {
  const apiKey = request.headers.get('Authorization');
  if (!apiKey) throw new Response('Unauthorized', { status: 401 });
  const user = await validateApiKey(apiKey);
  // ... route logic
}
```

---

## Detailed Design

### Middleware Approach

**Create:** `apps/webapp/app/middleware/auth.ts`

```typescript
export async function requireAuth(request: Request) {
  const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!apiKey) {
    throw json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { apiKey },
    include: { organization: true },
  });

  if (!user) {
    throw json({ error: 'Invalid API key' }, { status: 401 });
  }

  return user;
}

export async function requireOrgMember(request: Request, orgSlug: string) {
  const user = await requireAuth(request);
  
  const membership = await db.orgMember.findFirst({
    where: {
      userId: user.id,
      organization: { slug: orgSlug },
    },
  });

  if (!membership) {
    throw json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, membership };
}
```

**Usage (after):**
```typescript
export async function loader({ request, params }: LoaderArgs) {
  const { user, membership } = await requireOrgMember(
    request,
    params.organizationSlug
  );
  
  // Route logic (no auth boilerplate)
  const projects = await db.project.findMany({
    where: { organizationId: membership.organizationId },
  });

  return json({ projects });
}
```

---

## Implementation Plan

### Day 1: Create Middleware
- Write `requireAuth()`, `requireOrgMember()`, `requireProject()`
- Add tests
- Document usage

### Day 2: Migrate Routes (Batch 1)
- Migrate 20 routes to use middleware
- Test each route

### Day 3: Migrate Routes (Batch 2)
- Migrate remaining 20+ routes
- Remove old auth code
- Deploy

**Effort:** 3 days

---

## Success Criteria

- ✅ Auth logic centralized (1 file vs. 40+ routes)
- ✅ Code duplication: -3% overall
- ✅ Consistent error handling across routes
- ✅ Easier to add new auth requirements (e.g., MFA)

---

## Backwards Compatibility

✅ **No breaking changes** (internal refactoring only)

---

**Status:** Ready for Sprint 1
**Owner:** Full-stack Engineer
**Timeline:** Days 5-7 of Sprint 1
