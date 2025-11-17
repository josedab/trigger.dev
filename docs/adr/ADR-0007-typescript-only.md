# ADR-0007: TypeScript Only (No JavaScript)

**Status:** Accepted
**Date:** 2024-06-15
**Deciders:** Engineering Team
**Technical Story:** Language and Type Safety Strategy

## Context

Trigger.dev is a developer platform with complex state management, distributed systems, and user-facing APIs. Language choice affects:
- Type safety (catch bugs at compile-time)
- Developer experience (IDE support, autocomplete)
- Maintainability (refactoring, understanding code)
- Onboarding (new contributors)
- Community contribution (ease of contribution)

**Requirements:**
- Strong type safety (critical for correctness)
- Excellent IDE support (autocomplete, refactoring)
- Good documentation through types
- Fast development velocity

**Constraints:**
- Team expertise: Strong TypeScript experience
- Target users: TypeScript/JavaScript developers
- Open-source: Need to be approachable for contributors

## Decision

Use **TypeScript in strict mode** exclusively. No JavaScript files allowed in the codebase (except configuration files that require JS).

**Configuration:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Enforcement:**
- ESLint rule: No `.js` files (except config)
- CI check: All files must be `.ts` or `.tsx`
- Pre-commit hook: Type-check before commit

## Alternatives Considered

### Alternative 1: JavaScript with JSDoc

**How it works:**
- Write JavaScript with type comments
- TypeScript compiler checks JSDoc comments
- No compilation step needed

**Example:**
```javascript
/**
 * @param {string} name
 * @param {number} age
 * @returns {User}
 */
function createUser(name, age) {
  return { name, age };
}
```

**Pros:**
- No compilation step (run directly with Node.js)
- Still get some type checking
- Lower barrier to entry (JavaScript is simpler)

**Cons:**
- Weaker type checking (JSDoc has limitations)
- Verbose (type annotations in comments are long)
- Harder to refactor (types in comments, not code)
- No compile-time errors (only in editor)
- Poor support for generics, complex types

**Why rejected:**
- Type safety is critical (distributed systems, state management)
- JSDoc too verbose and error-prone
- Want compile-time errors, not just editor warnings
- TypeScript inference much better than JSDoc

---

### Alternative 2: Mixed TypeScript and JavaScript

**How it works:**
- Allow both `.ts` and `.js` files
- New code in TypeScript, legacy in JavaScript
- Gradual migration strategy

**Pros:**
- Flexibility (can mix languages)
- Easier to integrate third-party JS code
- Lower barrier for contributors (can write JS)

**Cons:**
- Inconsistent codebase (some TS, some JS)
- Hard to enforce quality (JS files lack types)
- Type boundaries are unclear (TS calling JS loses types)
- Harder to refactor (can't trust types across boundaries)

**Why rejected:**
- Want consistency (all code same quality)
- All-or-nothing for type safety (mixing defeats purpose)
- Not a migration (greenfield project)
- Clear rule is easier to enforce (no "just this time" exceptions)

---

### Alternative 3: ReScript (formerly ReasonML)

**How it works:**
- Strong statically-typed language (OCaml-based)
- Compiles to JavaScript
- 100% type coverage (no `any`)

**Pros:**
- Even stronger type system than TypeScript
- Pattern matching, algebraic data types
- Excellent compiler errors
- Fast compilation

**Cons:**
- Team unfamiliar (steep learning curve)
- Smaller ecosystem (fewer libraries)
- Harder to hire (fewer ReScript developers)
- Interop with JS libraries is complex

**Why rejected:**
- Team expertise in TypeScript, not ReScript
- TypeScript ecosystem is huge (can use any npm package)
- Hiring would be difficult (ReScript is niche)
- TypeScript strict mode is "good enough" for our needs

---

## Consequences

### Positive

**1. Excellent type safety**
- Catch bugs at compile-time (before production)
- Refactoring is safe (compiler finds all usages)
- Null safety (strictNullChecks catches undefined errors)

**Example:**
```typescript
// TypeScript catches this at compile-time
function getUser(id: string): User {
  return users.find(u => u.id === id); // Error: might be undefined
}

// Fixed
function getUser(id: string): User | undefined {
  return users.find(u => u.id === id); // OK
}
```

**2. Better IDE support**
- Autocomplete for all APIs (IntelliSense)
- Jump to definition, find references
- Inline documentation (hover to see types)
- Refactoring tools (rename, extract)

**3. Self-documenting code**
- Types serve as documentation
- Easy to understand function signatures
- No need to read implementation to understand API

**Example:**
```typescript
// Types explain what this does
async function createTaskRun(
  task: Task,
  payload: unknown,
  options?: { priority?: number; delay?: number }
): Promise<TaskRun>
```

**4. Safer refactoring**
- Rename variable → compiler finds all usages
- Change function signature → compiler finds all call sites
- Confidence to make large changes

**5. Consistent codebase**
- All code follows same patterns
- No "this file is JS, that one is TS" confusion
- Easier for new contributors

### Negative

**1. Compilation step required**
- Can't run `.ts` files directly with Node.js
- Need to compile before running (or use ts-node)
- **Mitigation:** Fast builds with Turbo, watch mode for development

**2. Learning curve**
- New contributors need TypeScript knowledge
- Advanced types can be complex (generics, mapped types)
- **Mitigation:** Good documentation, code reviews, examples

**3. Slower iteration (sometimes)**
- Need to satisfy type checker (can't "just run it")
- Type errors can be cryptic (especially with generics)
- **Mitigation:** Team gets faster with practice, good error messages

**4. Longer compile times**
- TypeScript compilation adds ~1-5 seconds
- **Mitigation:** Incremental builds, watch mode

### Neutral

**1. Type coverage vs runtime checks**
- Types are erased at runtime (no runtime enforcement)
- Still need runtime validation for external data
- **Mitigation:** Use Zod or similar for runtime validation

**Example:**
```typescript
// TypeScript doesn't help here (external data)
const userData = await fetch('/api/user').then(r => r.json());
// userData could be anything

// Solution: runtime validation
const userData = await fetch('/api/user')
  .then(r => r.json())
  .then(data => userSchema.parse(data)); // Zod validates at runtime
```

---

## Implementation

Established from project inception

**Components:**
- [x] TypeScript config (`tsconfig.json`) with strict mode
- [x] ESLint rule (no `.js` files in `src/`)
- [x] Build process (Turbo compiles all packages)
- [x] CI type-check (fails on type errors)
- [x] Pre-commit hook (type-check before commit)

**TypeScript config:**
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist"
  }
}
```

**Allowed exceptions:**
- Configuration files (`.eslintrc.js`, `jest.config.js`) - require JS
- Scripts in `scripts/` folder - can be JS if needed

**Performance:**
- Type-check time: ~10-15 seconds (full monorepo)
- Incremental type-check: ~1-2 seconds (watch mode)

---

## References

**Internal:**
- Root TypeScript config: `tsconfig.json`
- Package configs: `packages/*/tsconfig.json` (extend root)
- ESLint config: `packages/eslint-config-custom`

**External:**
- TypeScript docs: https://www.typescriptlang.org/docs/
- TypeScript strict mode: https://www.typescriptlang.org/tsconfig#strict
- Type safety guide: https://www.typescriptlang.org/docs/handbook/intro.html

**Articles:**
- Why TypeScript: https://serokell.io/blog/why-typescript
- Strict mode benefits: https://www.carlrippon.com/what-is-strict-mode-in-typescript/

---

## Superseded By

None (still active as of 2025-11)

---

## Future Considerations

**1. TypeScript 5.x features:**
- Decorators (stable in TS 5.0)
- Type-only imports/exports
- **Decision:** Upgrade to TS 5.x in progress

**2. Runtime type checking:**
- Use Zod for runtime validation (already partially adopted)
- Generate Zod schemas from TypeScript types (tRPC does this)
- **Decision:** Expand Zod usage for all external data

**3. Type-safe SQL:**
- Prisma already provides type-safe queries
- Consider Kysely for more complex raw SQL
- **Decision:** Prisma is sufficient for now

**4. Effect-TS (advanced):**
- Functional programming library with strong typing
- Error handling, dependency injection via types
- **Decision:** Too advanced, not needed yet
