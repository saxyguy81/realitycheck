import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/integration/**/*.test.ts'],
    testTimeout: 120000, // 2 minutes per test
    hookTimeout: 30000,
    // Allow parallel test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
    // Retry failed tests once (network issues)
    retry: 1,
  },
});
