# Integration Tests

This directory contains integration tests for the Trigger.dev platform.

## Overview

Integration tests verify end-to-end functionality across multiple components:
- Task execution flows (trigger → execute → complete)
- Checkpoint and resume functionality
- Retry mechanisms
- Queue operations
- Real-time streaming

## Running Tests

```bash
# Run all integration tests
pnpm test:integration

# Run specific test file
pnpm vitest tests/integration/task-execution.test.ts

# Run with coverage
pnpm vitest tests/integration --coverage
```

## Test Structure

Integration tests use:
- **Testcontainers**: For PostgreSQL and Redis instances
- **Prisma**: For database operations
- **RunEngine**: The core task execution engine

## Adding New Tests

1. Create a new test file in this directory
2. Use the containerTest helper from @internal/testcontainers
3. Set up test environment with setupAuthenticatedEnvironment
4. Test the full flow including database and queue interactions

## Example

See `task-execution.test.ts` for a comprehensive example of integration testing patterns.
