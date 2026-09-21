import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    setupFiles: ["./tests/setup.ts"],
    // Integration tests share one live Postgres instance. Even though
    // each file creates its own student fixtures, running files
    // sequentially avoids any risk of cross-file interference on
    // shared tables - correctness over speed for a suite this size.
    fileParallelism: false,
  },
});
