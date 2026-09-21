import { createApp } from "./app";
import { env } from "./config/env";
import { baseLogger } from "./lib/logger";
import { closePool, pingDatabase } from "./db/pool";

/**
 * DEPLOYMENT SAFETY
 * -----------------------------------------------------------------------
 * Verifies the database is reachable before accepting traffic (fail fast
 * on a bad deploy rather than serving 500s until the first request
 * happens to hit the DB) and shuts down gracefully on SIGTERM/SIGINT —
 * stop accepting new connections, let in-flight requests finish, then
 * close the pool. Migrations are NOT run here — see db/migrate.ts's
 * module doc for why that's a separate, explicit deploy step.
 */

async function main() {
  const dbCheck = await pingDatabase(5000);
  if (!dbCheck.ok) {
    baseLogger.error({ dbCheck }, "startup_database_unreachable");
    throw new Error(`Refusing to start — database unreachable: ${dbCheck.error}`);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    baseLogger.info({ port: env.PORT, service: env.SERVICE_NAME }, "server_started");
  });

  async function shutdown(signal: string) {
    baseLogger.info({ signal }, "shutdown_initiated");
    server.close(async (err) => {
      if (err) baseLogger.error({ err }, "shutdown_http_close_error");
      await closePool();
      baseLogger.info("shutdown_complete");
      process.exit(err ? 1 : 0);
    });
    // Force-exit if graceful shutdown hangs (e.g. a stuck connection).
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  baseLogger.error({ err }, "startup_failed");
  process.exit(1);
});
