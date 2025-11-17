# ADR-0003: Remix vs Next.js for Webapp

**Status:** Accepted
**Date:** 2024-06-15
**Deciders:** Engineering Team
**Technical Story:** Dashboard Framework Selection

## Context

Trigger.dev needs a full-stack web framework for the dashboard application:
- Server-rendered React pages
- API routes for backend logic
- Form handling (create projects, configure tasks)
- Real-time updates (task status, logs)
- Authentication and session management

**Requirements:**
- TypeScript support
- Server-side rendering (SSR) for performance
- Co-locate frontend and backend code
- Good developer experience
- Production-ready and stable

**Constraints:**
- Team expertise: React (strong), Next.js (moderate), Remix (learning)
- Timeline: MVP in 3 months
- Deployment: Node.js servers (not edge)

## Decision

Use **Remix 2.x** as the full-stack framework for the dashboard.

**Key features used:**
- Loaders for data fetching (server-side)
- Actions for mutations (form submissions, API calls)
- Nested routes for layouts
- Built-in form handling with progressive enhancement
- Session management (cookies)

**Example:**
```typescript
// app/routes/projects.$projectId.tsx
export async function loader({ params }: LoaderArgs) {
  const project = await db.project.findUnique({
    where: { id: params.projectId }
  });
  return json({ project });
}

export async function action({ request }: ActionArgs) {
  const formData = await request.formData();
  const name = formData.get("name");
  await db.project.update({ data: { name } });
  return redirect("/projects");
}

export default function Project() {
  const { project } = useLoaderData<typeof loader>();
  return <Form method="post">...</Form>;
}
```

## Alternatives Considered

### Alternative 1: Next.js

**How it works:**
- React framework with SSR and SSG
- API routes for backend
- App Router (new) or Pages Router (old)
- React Server Components (RSC) in App Router

**Pros:**
- Largest ecosystem (more examples, libraries)
- More examples and tutorials
- Vercel hosting (if we wanted)
- Team has some experience
- React Server Components (cutting edge)

**Cons:**
- Data fetching more complicated (getServerSideProps, RSC, client fetch)
- App Router is new and changing rapidly
- Form handling not built-in (need libraries)
- RSC adds mental overhead (client vs server components)
- Complicated caching strategies

**Why rejected:**
- Remix's loader/action pattern is cleaner and simpler
- Data fetching in Next.js is more complex (multiple patterns)
- App Router still evolving (breaking changes)
- Forms require additional libraries (react-hook-form, etc.)
- Team preferred Remix's mental model after prototyping

**Sources:**
- Next.js docs: https://nextjs.org/docs
- RSC complexity: https://www.joshwcomeau.com/react/server-components/

---

### Alternative 2: SvelteKit

**How it works:**
- Full-stack framework for Svelte
- Similar to Remix (loaders, actions)
- Smaller bundle sizes

**Pros:**
- Excellent DX (reactivity built-in)
- Smaller bundle sizes (no virtual DOM)
- Fast performance
- Clean syntax

**Cons:**
- Team unfamiliar with Svelte
- Smaller ecosystem than React
- Hiring harder (fewer Svelte developers)
- Would need to learn new paradigm

**Why rejected:**
- Team expertise in React (reuse knowledge)
- Larger React ecosystem (component libraries)
- Easier to hire React developers
- Risk too high to switch to Svelte

---

### Alternative 3: Custom React + Express

**How it works:**
- Express.js for backend
- React (Vite) for frontend
- Separate deployments or monolithic

**Pros:**
- Full control over architecture
- No framework lock-in
- Familiar technologies

**Cons:**
- Need to build SSR ourselves (complex)
- No built-in data fetching patterns
- More boilerplate
- Slower to ship features

**Why rejected:**
- Reinventing the wheel (SSR, routing, data fetching)
- Slower development velocity
- Remix provides patterns we'd build anyway

---

## Consequences

### Positive

**1. Clean data fetching**
- Loaders run on server (no client waterfalls)
- Single pattern for all data loading
- Type-safe (TypeScript inference works well)

**2. Built-in form handling**
- Forms work without JavaScript (progressive enhancement)
- `useNavigation` for pending states
- Validation with `action` errors

**3. Nested routes**
- Layouts shared across pages
- Less code duplication
- Better UX (only content re-renders)

**4. Simple mental model**
- Loader = fetch data
- Action = mutate data
- Component = render UI
- No client/server component confusion

**5. Web standards**
- Uses `Request`/`Response` (standard Web APIs)
- FormData, URLSearchParams (native)
- Easy to understand and debug

### Negative

**1. Smaller ecosystem**
- Fewer examples than Next.js
- Fewer third-party integrations
- Less content on Stack Overflow

**2. Learning curve**
- Team needed to learn Remix patterns
- Different from Next.js (no getServerSideProps)
- **Mitigation:** Good documentation, team training

**3. Smaller community**
- Fewer contributors
- Slower issue resolution sometimes
- **Mitigation:** Active Discord, responsive maintainers

### Neutral

**1. Remix vs Next.js debate**
- Both are good choices
- Chose Remix for cleaner patterns
- Could revisit if Remix development stalls

**2. React Server Components**
- Next.js has RSC, Remix doesn't (yet)
- Not a blocker (loaders solve same problem)
- Remix may add RSC later

---

## Implementation

Completed in initial dashboard release

**Components:**
- [x] Remix app setup (`apps/webapp`)
- [x] Authentication (session cookies)
- [x] Nested layouts (dashboard, project, task)
- [x] Form handling (create/edit projects, tasks)
- [x] Real-time updates (EventSource + loaders)
- [x] Deployment (Docker + Node.js)

**Directory structure:**
```
apps/webapp/
├── app/
│   ├── routes/           # File-based routing
│   ├── components/       # React components
│   ├── lib/              # Utilities
│   └── root.tsx          # Root layout
├── public/               # Static assets
└── remix.config.js       # Configuration
```

**Performance:**
- Server-side rendering: ~50-100ms (initial load)
- Client-side navigation: ~10-20ms (route change)
- Form submission: ~100-200ms (round-trip)

---

## References

**Internal:**
- Webapp codebase: `apps/webapp`
- Remix config: `apps/webapp/remix.config.js`

**External:**
- Remix docs: https://remix.run/docs
- Loaders and Actions: https://remix.run/docs/en/main/guides/data-loading
- Form handling: https://remix.run/docs/en/main/guides/form-validation

**Comparison articles:**
- Remix vs Next.js: https://remix.run/blog/remix-vs-next
- Why Remix: https://remix.run/blog/not-another-framework

**Prototypes:**
- Next.js prototype: https://github.com/triggerdotdev/trigger.dev/pull/50
- Remix prototype: https://github.com/triggerdotdev/trigger.dev/pull/75 (chosen)

---

## Superseded By

None (still active as of 2025-11)

---

## Future Considerations

**1. React Server Components:**
- Remix may add RSC support
- Would evaluate if/when available
- Not a blocker currently

**2. Remix evolution:**
- Now maintained by Shopify (acquisition)
- Strong commitment to development
- Watching for breaking changes

**3. Performance optimizations:**
- Add caching layer (Redis) for loaders
- Optimize database queries
- Consider edge deployment (if Remix supports)
