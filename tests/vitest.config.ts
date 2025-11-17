import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    globals: true,
    isolate: true,
    fileParallelism: false,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['../packages/*/src/**/*.ts', '../internal-packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/node_modules/**',
        '**/dist/**',
      ],
    },
  },
});
