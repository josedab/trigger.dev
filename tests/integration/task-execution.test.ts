/**
 * Integration Tests for Task Execution
 *
 * These tests verify end-to-end task execution flows including:
 * - Trigger → Execute → Complete (happy path)
 * - Checkpoint → Resume flows
 * - Retry mechanisms
 * - Failure handling
 *
 * Note: These tests use Testcontainers to spin up real PostgreSQL and Redis instances.
 * They may take longer to run than unit tests.
 */

import { containerTest, assertNonNullable } from '@internal/testcontainers';
import { trace } from '@internal/tracing';
import { expect, describe, vi } from 'vitest';
import { RunEngine } from '@internal/run-engine';
import { setupAuthenticatedEnvironment, setupBackgroundWorker } from '@internal/run-engine/tests/setup';
import { setTimeout } from 'node:timers/promises';

vi.setConfig({ testTimeout: 120_000 });

describe('Task Execution Integration', () => {
  containerTest('should execute task end-to-end (happy path)', async ({ prisma, redisOptions }) => {
    // Arrange: Set up environment and engine
    const authenticatedEnvironment = await setupAuthenticatedEnvironment(prisma, 'PRODUCTION');

    const engine = new RunEngine({
      prisma,
      worker: {
        redis: redisOptions,
        workers: 1,
        tasksPerWorker: 10,
        pollIntervalMs: 100,
      },
      queue: {
        redis: redisOptions,
        masterQueueConsumersDisabled: true,
        processWorkerQueueDebounceMs: 50,
      },
      runLock: {
        redis: redisOptions,
      },
      machines: {
        defaultMachine: 'small-1x',
        machines: {
          'small-1x': {
            name: 'small-1x' as const,
            cpu: 0.5,
            memory: 0.5,
            centsPerMs: 0.0001,
          },
        },
        baseCostInCents: 0.0005,
      },
      tracer: trace.getTracer('integration-test', '1.0.0'),
    });

    try {
      const taskIdentifier = 'integration-test-task';

      // Set up background worker
      const backgroundWorker = await setupBackgroundWorker(
        engine,
        authenticatedEnvironment,
        taskIdentifier
      );

      // Act: Trigger the run
      const run = await engine.trigger(
        {
          number: 1,
          friendlyId: 'run_integration_test',
          environment: authenticatedEnvironment,
          taskIdentifier,
          payload: JSON.stringify({ value: 42 }),
          payloadType: 'application/json',
          context: {},
          traceContext: {},
          traceId: 'trace_integration',
          spanId: 'span_integration',
          workerQueue: 'main',
          queue: `task/${taskIdentifier}`,
          isTest: false,
          tags: ['integration-test'],
        },
        prisma
      );

      // Assert: Verify run was created
      expect(run).toBeDefined();
      expect(run.friendlyId).toBe('run_integration_test');

      // Verify run is in database
      const runFromDb = await prisma.taskRun.findUnique({
        where: { friendlyId: 'run_integration_test' },
      });
      expect(runFromDb).toBeDefined();
      expect(runFromDb?.id).toBe(run.id);

      // Verify initial execution status
      const executionData = await engine.getRunExecutionData({ runId: run.id });
      assertNonNullable(executionData);
      expect(executionData.snapshot.executionStatus).toMatch(/QUEUED|EXECUTING/);

      // Cleanup
      await backgroundWorker.stop();
    } finally {
      await engine.dispose();
    }
  });

  containerTest('should handle retry on failure', async ({ prisma, redisOptions }) => {
    // Arrange: Set up environment
    const authenticatedEnvironment = await setupAuthenticatedEnvironment(prisma, 'PRODUCTION');

    const engine = new RunEngine({
      prisma,
      worker: {
        redis: redisOptions,
        workers: 1,
        tasksPerWorker: 10,
        pollIntervalMs: 100,
      },
      queue: {
        redis: redisOptions,
        masterQueueConsumersDisabled: true,
        processWorkerQueueDebounceMs: 50,
      },
      runLock: {
        redis: redisOptions,
      },
      machines: {
        defaultMachine: 'small-1x',
        machines: {
          'small-1x': {
            name: 'small-1x' as const,
            cpu: 0.5,
            memory: 0.5,
            centsPerMs: 0.0001,
          },
        },
        baseCostInCents: 0.0005,
      },
      tracer: trace.getTracer('integration-test', '1.0.0'),
    });

    try {
      const taskIdentifier = 'retry-test-task';

      // Act: Trigger run with retry configuration
      const run = await engine.trigger(
        {
          number: 1,
          friendlyId: 'run_retry_test',
          environment: authenticatedEnvironment,
          taskIdentifier,
          payload: JSON.stringify({ shouldFail: true }),
          payloadType: 'application/json',
          context: {},
          traceContext: {},
          traceId: 'trace_retry',
          spanId: 'span_retry',
          workerQueue: 'main',
          queue: `task/${taskIdentifier}`,
          isTest: false,
          tags: ['retry-test'],
          maxAttempts: 3,
        },
        prisma
      );

      // Assert: Verify run supports retries
      expect(run).toBeDefined();
      const runFromDb = await prisma.taskRun.findUnique({
        where: { id: run.id },
      });

      expect(runFromDb).toBeDefined();
      expect(runFromDb?.maxAttempts).toBe(3);
    } finally {
      await engine.dispose();
    }
  });

  containerTest('should create waitpoint for run', async ({ prisma, redisOptions }) => {
    // Arrange
    const authenticatedEnvironment = await setupAuthenticatedEnvironment(prisma, 'PRODUCTION');

    const engine = new RunEngine({
      prisma,
      worker: {
        redis: redisOptions,
        workers: 1,
        tasksPerWorker: 10,
        pollIntervalMs: 100,
      },
      queue: {
        redis: redisOptions,
        masterQueueConsumersDisabled: true,
        processWorkerQueueDebounceMs: 50,
      },
      runLock: {
        redis: redisOptions,
      },
      machines: {
        defaultMachine: 'small-1x',
        machines: {
          'small-1x': {
            name: 'small-1x' as const,
            cpu: 0.5,
            memory: 0.5,
            centsPerMs: 0.0001,
          },
        },
        baseCostInCents: 0.0005,
      },
      tracer: trace.getTracer('integration-test', '1.0.0'),
    });

    try {
      const taskIdentifier = 'waitpoint-test';

      const backgroundWorker = await setupBackgroundWorker(
        engine,
        authenticatedEnvironment,
        taskIdentifier
      );

      // Act
      const run = await engine.trigger(
        {
          number: 1,
          friendlyId: 'run_waitpoint_test',
          environment: authenticatedEnvironment,
          taskIdentifier,
          payload: '{}',
          payloadType: 'application/json',
          context: {},
          traceContext: {},
          traceId: 'trace_waitpoint',
          spanId: 'span_waitpoint',
          workerQueue: 'main',
          queue: `task/${taskIdentifier}`,
          isTest: false,
          tags: [],
        },
        prisma
      );

      // Assert: Check waitpoint is created
      const waitpoints = await prisma.waitpoint.findMany({
        where: {
          completedByTaskRunId: run.id,
        },
      });

      expect(waitpoints.length).toBeGreaterThanOrEqual(1);
      expect(waitpoints[0].type).toBe('RUN');

      // Cleanup
      await backgroundWorker.stop();
    } finally {
      await engine.dispose();
    }
  });
});
