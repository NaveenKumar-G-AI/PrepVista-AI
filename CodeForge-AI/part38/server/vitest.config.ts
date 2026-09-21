import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    external: ["node:sqlite"],
  },
  test: {
    // run-golden.ts is a plain tsx-executed script (see its own top comment
    // for why) — exclude it here so vitest doesn't also try to load it.
    exclude: ["node_modules/**", "test/integration/**"],
    environment: "node",
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    // Golden/integration tests share a SQLite file per worker; force single-threaded
    // execution so tests that reset the DB don't race with tests reading it.
    fileParallelism: false,
    server: {
      // node:sqlite is new enough that this Vite version's builtin-module
      // detection doesn't recognize it — force it (and any other node:
      // import) to be treated as an external Node built-in rather than
      // something Vite tries to resolve from node_modules.
      deps: {
        external: [/^node:/],
      },
    },
  },
});
