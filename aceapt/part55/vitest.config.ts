import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false, // tests share one Postgres DB; run sequentially to avoid cross-test interference
    setupFiles: ['./tests/helpers/setup-env.ts'],
  },
});
