import { loadEnv } from "./config/env.js";
import { buildApp } from "./api/buildApp.js";
import { PostgresStore } from "./repositories/postgresStore.js";

async function main() {
  const env = loadEnv();
  if (!env.databaseUrl) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }
  const store = PostgresStore.fromConnectionString(env.databaseUrl);
  const app = buildApp({ store, demoMode: env.demoMode, logger: true });

  await app.listen({ port: env.port, host: "0.0.0.0" });
  console.log(`ACEAPT Feature 4 listening on :${env.port} (DEMO_MODE=${env.demoMode})`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
