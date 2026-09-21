import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Sandbox adversarial tests spawn real processes (unshare/setpriv/timeout)
    // and are intentionally slower than unit tests.
    testTimeout: 20_000,
    hookTimeout: 20_000
  }
});
