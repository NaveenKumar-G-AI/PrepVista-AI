import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    // Integration tests hit a real local Postgres + a real in-process Express server.
    // They run sequentially (fileParallelism off) so they don't stomp on shared DB rows.
    fileParallelism: false
  }
});
