import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 10_000,
    hookTimeout: 10_000,
    fileParallelism: false, // each test file gets its own SQLite file; keep runs simple and deterministic
  },
});
