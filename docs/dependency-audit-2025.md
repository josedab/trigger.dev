# Dependency Audit Report - November 2025

**Date:** November 17, 2025
**Scope:** apps/webapp
**Initial Count:** 251 dependencies (185 production + 66 dev)
**Target:** Reduce by 20% (~50 packages)

## Executive Summary

Audit completed using `depcheck` tool on the webapp package. Found **48 unused packages** (22 production + 26 dev dependencies), exceeding the RFC's initial estimate of 15-20 packages.

## Findings

### 1. Unused Production Dependencies (22 packages)

#### Recommended for Removal:
- `@aws-sdk/client-sqs` - AWS SQS client (likely replaced by other AWS SDK packages)
- `@codemirror/lang-javascript` - CodeMirror JavaScript support (unused, have JSON support)
- `@electric-sql/react` - Electric SQL React bindings
- `@remix-run/v1-meta` - Remix v1 meta utilities
- `@types/pg` - PostgreSQL types (duplicate/unused)
- `@whatwg-node/fetch` - WHATWG fetch polyfill
- `eventsource` - EventSource polyfill
- `humanize-duration` - Duration humanizer (unused)
- `jsonpointer` - JSON Pointer implementation
- `lodash.omit` - Lodash omit function
- `non.geist` - Geist font variant
- `ohash` - Object hashing utility
- `simple-oauth2` - OAuth 2.0 client
- `sqs-consumer` - SQS consumer library
- `ulidx` - ULID generator (have `ulid` package)

#### Review Before Removal:
- `@opentelemetry/sdk-node` - OpenTelemetry SDK (may be used indirectly)
- `@radix-ui/react-label` - Radix label component (may be used via other Radix components)
- `@radix-ui/react-portal` - Radix portal component (may be used via other Radix components)
- `react-aria` - React Aria library (may be used indirectly)
- `react-collapse` - Collapse component
- `react-resizable-panels` - Resizable panels component
- `react-stately` - React state management (may be used indirectly)

### 2. Unused Dev Dependencies (26 packages)

#### Recommended for Removal:
- `@remix-run/eslint-config` - Remix ESLint config
- `@remix-run/testing` - Remix testing utilities
- `@sentry/cli` - Sentry CLI tool
- `@swc/core` - SWC compiler core
- `@swc/helpers` - SWC helpers
- `@types/bcryptjs` - Bcrypt types
- `@types/eslint` - ESLint types
- `@types/humanize-duration` - Humanize duration types
- `@types/json-query` - JSON query types
- `@types/lodash.omit` - Lodash omit types
- `@types/node-fetch` - Node fetch types
- `@types/qs` - QS types
- `@types/react-collapse` - React collapse types
- `@types/simple-oauth2` - Simple OAuth2 types
- `@types/tar` - TAR types
- `css-loader` - Webpack CSS loader
- `datepicker` - Datepicker component
- `eslint-config-prettier` - Prettier ESLint config
- `eslint-plugin-turbo` - Turbo ESLint plugin
- `postcss-import` - PostCSS import plugin
- `postcss-loader` - Webpack PostCSS loader
- `prop-types` - React prop types
- `rimraf` - Cross-platform rm-rf
- `style-loader` - Webpack style loader
- `tsconfig-paths` - TypeScript paths resolver

#### Keep (Build Tools):
- `autoprefixer` - PostCSS autoprefixer (likely still needed for Tailwind)

### 3. Missing Alias Issue

Depcheck identified `~` as a missing dependency across many files. This is a TypeScript path alias, not an actual dependency. Can be safely ignored.

## Recommendations

### Phase 1: Low-Risk Removals (Immediate)
Remove the following 30 packages that are clearly unused:

**Production (15):**
- @aws-sdk/client-sqs
- @codemirror/lang-javascript
- @electric-sql/react
- @remix-run/v1-meta
- @types/pg
- @whatwg-node/fetch
- eventsource
- humanize-duration
- jsonpointer
- lodash.omit
- non.geist
- ohash
- simple-oauth2
- sqs-consumer
- ulidx

**Dev Dependencies (15):**
- @types/bcryptjs
- @types/eslint
- @types/humanize-duration
- @types/json-query
- @types/lodash.omit
- @types/node-fetch
- @types/qs
- @types/react-collapse
- @types/simple-oauth2
- @types/tar
- css-loader
- postcss-loader
- prop-types
- rimraf
- style-loader

### Phase 2: Review Required (Deferred)
The following 7 packages need code review before removal:
- @opentelemetry/sdk-node
- @radix-ui/react-label
- @radix-ui/react-portal
- react-aria
- react-collapse
- react-resizable-panels
- react-stately

### Phase 3: Configuration Review (Deferred)
The following 11 packages need build/config review:
- @remix-run/eslint-config
- @remix-run/testing
- @sentry/cli
- @swc/core
- @swc/helpers
- datepicker
- eslint-config-prettier
- eslint-plugin-turbo
- postcss-import
- tsconfig-paths
- autoprefixer

## Impact Assessment

- **Current:** 251 packages
- **After Phase 1:** 221 packages (-30, -12%)
- **Potential Final:** ~200 packages (-51, -20%) if all phases complete

## Next Steps

1. ✅ Complete dependency audit
2. ⏳ Remove Phase 1 dependencies
3. ⏳ Test application build and functionality
4. ⏳ Check for duplicate dependencies
5. ⏳ Bundle size analysis
6. ⏳ Document changes
7. ⏳ Commit and push

## Notes

- Webapp uses Remix 2.1.0 framework
- Build system appears to use esbuild
- pnpm workspace with multiple packages
- Some dependencies may be transitive (used by other direct dependencies)
