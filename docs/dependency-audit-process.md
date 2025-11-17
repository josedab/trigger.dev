# Dependency Audit Process

This document describes the process for auditing and cleaning up dependencies in the Trigger.dev monorepo, based on RFC-0008.

## Overview

Regular dependency audits help maintain a lean, secure, and performant codebase by:
- Removing unused packages
- Identifying duplicates
- Reducing bundle size
- Improving build times
- Reducing security surface area

## Tools Used

### 1. depcheck

`depcheck` analyzes your project to identify:
- Unused dependencies
- Unused devDependencies
- Missing dependencies

**Installation:**
```bash
pnpm add -D -w depcheck
```

**Usage:**
```bash
# Run in the target package directory
cd apps/webapp
npx depcheck --json > audit-results.json

# Or without JSON output
npx depcheck
```

### 2. pnpm list

Check for duplicate dependencies:

```bash
# List all dependencies with versions
pnpm list --depth=Infinity

# Check for specific package duplicates
pnpm list --depth=Infinity | grep "@types/react"
```

### 3. Bundle Analysis

For Remix apps:

```bash
cd apps/webapp
pnpm run build --analyze
```

This generates a bundle analysis showing package sizes.

## Audit Process

### Step 1: Run depcheck

```bash
cd apps/webapp
npx depcheck --json > /tmp/depcheck-results.json
```

Review the output for:
- `dependencies`: Unused production dependencies
- `devDependencies`: Unused dev dependencies
- `missing`: Potentially missing dependencies (often false positives for path aliases)

### Step 2: Analyze Results

For each unused dependency:

1. **Search the codebase** to verify it's truly unused:
   ```bash
   grep -r "package-name" app/
   ```

2. **Check if it's a transitive dependency** (used by other packages)

3. **Categorize by risk**:
   - **Low Risk**: Type definitions, clearly unused utilities
   - **Medium Risk**: UI components, libraries
   - **High Risk**: Build tools, framework dependencies

### Step 3: Check for Duplicates

```bash
# Find all React versions
pnpm list --depth=Infinity | grep "react@"

# Check for duplicate type definitions
pnpm list --depth=Infinity | grep "@types/"
```

Fix duplicates using `pnpm.overrides` in root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "react": "^18.2.0",
      "@types/react": "18.2.69"
    }
  }
}
```

### Step 4: Remove Dependencies

**Option A: Manual removal**
```bash
cd apps/webapp
pnpm remove package-name
```

**Option B: Use the cleanup script**
```bash
./scripts/remove-unused-dependencies.sh
```

### Step 5: Test

After removing dependencies:

```bash
# Clean install
pnpm install

# Build the project
pnpm run build

# Run tests
pnpm run test

# Type check
pnpm run typecheck
```

### Step 6: Verify Bundle Size

Compare bundle sizes before and after:

```bash
# Before cleanup
du -sh apps/webapp/build/

# After cleanup
du -sh apps/webapp/build/
```

## Common False Positives

### Path Aliases

depcheck often flags path aliases as missing dependencies:
- `~` → TypeScript path alias
- `@` → Path alias

These can be safely ignored.

### Indirect Usage

Some packages are used indirectly:
- Framework peer dependencies
- Transitive dependencies of plugins
- Runtime-only imports

Always verify with code search before removing.

### Type-only Imports

TypeScript type-only imports may be flagged as unused:
```typescript
import type { SomeType } from 'package';
```

Keep these if the types are used in the codebase.

## Best Practices

1. **Audit Regularly**: Run audits quarterly or before major releases

2. **Document Changes**: Update CHANGELOG.md with removed packages

3. **Incremental Cleanup**: Remove dependencies in small batches

4. **Test Thoroughly**: Run full test suite after each batch

5. **Review PRs Carefully**: Ensure new dependencies are necessary

6. **Use Exact Versions**: Pin important dependencies to avoid surprises

7. **Monitor Bundle Size**: Track bundle size over time

## Automation

Consider setting up automated checks:

```yaml
# .github/workflows/dependency-audit.yml
name: Dependency Audit
on:
  schedule:
    - cron: '0 0 1 * *'  # Monthly
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: npx depcheck --json > audit.json
      - uses: actions/upload-artifact@v3
        with:
          name: dependency-audit
          path: audit.json
```

## Troubleshooting

### Build Failures After Removal

1. Check build error messages for missing packages
2. Reinstall the package if it's actually needed
3. Check if it's a peer dependency

### Test Failures

1. Review test output for import errors
2. Check if test utilities were removed
3. Verify mock dependencies are still present

### Type Errors

1. Check if type definitions were removed
2. Verify `@types/*` packages are still installed
3. Run `pnpm run typecheck` to identify issues

## Resources

- [depcheck GitHub](https://github.com/depcheck/depcheck)
- [pnpm documentation](https://pnpm.io/)
- [RFC-0008: Dependency Audit & Cleanup](../analysis-output/rfcs/RFC-0008-dependency-audit.md)
- [Dependency Audit Report - November 2025](./dependency-audit-2025.md)
