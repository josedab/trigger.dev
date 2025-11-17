# Testing Infrastructure

This document describes the testing infrastructure for Trigger.dev, implemented as part of RFC-0001 to increase test coverage from ~5% to 30%+.

## Overview

Our testing strategy focuses on three levels of testing:
- **Unit Tests (60%)**: Test individual functions and modules in isolation
- **Integration Tests (30%)**: Test interactions between components with real database and queue instances
- **E2E Tests (10%)**: Test complete user workflows through the UI

## Current Coverage

As of the latest implementation:
- **Overall Target**: 30% code coverage
- **Critical Paths Target**: 80% coverage for RunEngine, SDK, and core systems
- **Coverage Tracking**: Automated via Codecov in CI

## Running Tests

### All Tests
```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:dev
```

### By Category
```bash
# Run webapp tests only
pnpm test:webapp

# Run package tests only
pnpm test:packages

# Run internal package tests only
pnpm test:internal

# Run integration tests only
pnpm test:integration

# Run E2E tests
pnpm test:e2e
```

### Individual Packages
```bash
# SDK tests
cd packages/trigger-sdk
pnpm test

# Run engine tests
cd internal-packages/run-engine
pnpm test
```

## Test Structure

### Directory Layout

```
trigger.dev/
├── packages/
│   └── trigger-sdk/
│       ├── src/
│       │   └── v3/
│       │       ├── queue.test.ts       # SDK unit tests
│       │       └── ...
│       └── vitest.config.ts
├── internal-packages/
│   └── run-engine/
│       ├── src/
│       │   └── engine/
│       │       └── tests/              # RunEngine tests
│       └── vitest.config.ts
├── tests/
│   ├── integration/
│   │   ├── task-execution.test.ts     # Integration tests
│   │   └── README.md
│   ├── e2e/                            # Playwright E2E tests
│   ├── __template__.test.ts           # Test template
│   └── vitest.config.ts
└── vitest.config.ts                    # Root config
```

## Writing Tests

### Using the Test Template

Start with the template at `tests/__template__.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    // Setup
  });

  describe('functionName()', () => {
    it('should handle the happy path', () => {
      // Arrange
      const input = { test: true };

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBeDefined();
    });
  });
});
```

### Unit Tests

Unit tests should:
- Test a single function or module in isolation
- Use mocks for external dependencies
- Be fast (< 100ms per test)
- Follow the Arrange-Act-Assert pattern

Example: `packages/trigger-sdk/src/v3/queue.test.ts`

### Integration Tests

Integration tests should:
- Use real database and queue instances via Testcontainers
- Test interactions between multiple components
- Verify end-to-end flows
- Clean up resources after each test

Example: `tests/integration/task-execution.test.ts`

```typescript
import { containerTest } from '@internal/testcontainers';

describe('Task Execution Integration', () => {
  containerTest('should execute task end-to-end', async ({ prisma, redisOptions }) => {
    // Test with real DB and Redis
  });
});
```

## Coverage Configuration

### Root Coverage Settings

The root `vitest.config.ts` defines overall coverage settings:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  include: [
    'packages/*/src/**/*.ts',
    'internal-packages/*/src/**/*.ts',
    'apps/*/src/**/*.ts',
  ],
  exclude: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/node_modules/**',
    '**/dist/**',
  ],
  thresholds: {
    lines: 10,
    functions: 10,
    branches: 10,
    statements: 10,
  },
}
```

### CI Integration

Coverage is automatically tracked in CI via `.github/workflows/test-coverage.yml`:

- Runs on every PR and push to main
- Uploads coverage to Codecov
- Comments on PRs with coverage changes
- Fails if coverage drops below thresholds

## Best Practices

### DO
- ✅ Write tests for all new features
- ✅ Test both happy paths and error cases
- ✅ Use descriptive test names
- ✅ Keep tests focused and independent
- ✅ Use beforeEach/afterEach for setup/cleanup
- ✅ Mock external dependencies in unit tests
- ✅ Use Testcontainers for integration tests

### DON'T
- ❌ Test implementation details
- ❌ Write overly complex tests
- ❌ Share state between tests
- ❌ Mock everything (use real dependencies when appropriate)
- ❌ Skip cleanup in afterEach hooks
- ❌ Commit failing tests

## Existing Test Coverage

### Well-Tested Components

- ✅ **RunEngine** (`internal-packages/run-engine/src/engine/tests/`)
  - Trigger flows
  - Checkpoint system
  - Retry logic
  - Batch operations
  - Queue operations

- ✅ **SDK** (`packages/trigger-sdk/src/v3/`)
  - Queue creation and configuration

### Areas for Improvement

The following areas need additional test coverage:

- 🔨 API Routes (`apps/webapp/app/routes/`)
- 🔨 Real-time streaming (`apps/webapp/app/services/realtime.ts`)
- 🔨 Task trigger methods (trigger, triggerAndWait, batchTrigger)
- 🔨 Schema validation in SDK

## Coverage Goals

### Milestone 1 (Completed)
- ✅ Coverage infrastructure setup
- ✅ Codecov integration
- ✅ CI workflow
- ✅ Baseline thresholds (10%)

### Milestone 2 (In Progress)
- 🔄 RunEngine tests (currently comprehensive)
- 🔄 SDK tests (basic tests added)
- 🔄 Integration tests (framework in place)

### Milestone 3 (Planned)
- 📋 API route tests
- 📋 Real-time tests
- 📋 E2E test expansion

### Ongoing
- 📊 Increase thresholds: 10% → 20% → 30%
- 📊 Add tests for all new features
- 📊 Quarterly coverage reviews

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Testcontainers](https://node.testcontainers.org/)
- [RFC-0001: Increase Test Coverage](analysis-output/rfcs/RFC-0001-increase-test-coverage.md)

## Troubleshooting

### Tests Timeout
- Increase timeout in vitest.config.ts: `testTimeout: 120_000`
- For specific tests: `vi.setConfig({ testTimeout: 60_000 })`

### Coverage Not Generated
- Ensure vitest.config.ts has `coverage.provider: 'v8'`
- Run with explicit coverage flag: `pnpm test --coverage`

### Testcontainers Issues
- Ensure Docker is running
- Check Docker has sufficient resources
- Review Testcontainer logs for startup failures

### CI Coverage Failures
- Check that CODECOV_TOKEN is set in GitHub secrets
- Verify coverage thresholds are achievable
- Review PR for coverage drops

## Contributing

When adding new features:

1. Write tests alongside your code
2. Ensure coverage meets or exceeds current thresholds
3. Use the test template for consistency
4. Add integration tests for cross-component features
5. Update this documentation if adding new testing patterns

---

**Questions?** Open an issue or reach out to the team.
