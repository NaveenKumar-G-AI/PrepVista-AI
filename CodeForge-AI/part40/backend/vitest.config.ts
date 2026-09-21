import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false, // tests share one Postgres test database; run serially for isolation
    setupFiles: [],
    env: {
      NODE_ENV: "test",
      // Least-privilege runtime role — the whole point of these tests is
      // to exercise real RLS, so the app under test must connect exactly
      // the way production does, never as the migration/admin role.
      TEST_DATABASE_URL: "postgresql://codeforge_app:codeforge_app_pw@localhost:5432/codeforge_f40_test",
      // Test-infra-only: used by tests/dbAdmin.ts to reset table contents
      // between tests. Never read by application code (env.ts only reads
      // DATABASE_ADMIN_URL for the separate `npm run migrate` step).
      DATABASE_ADMIN_URL: "postgresql://postgres:postgres@localhost:5432/codeforge_f40_test"
    }
  }
});
