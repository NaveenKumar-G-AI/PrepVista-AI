import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/test/**', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@prepvista/shared': path.resolve(__dirname, '../../shared/src'),
    },
  },
});