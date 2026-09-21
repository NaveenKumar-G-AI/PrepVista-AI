/**
 * Minimal, framework-agnostic migration runner for this standalone
 * reference implementation. Runs db/migrations/*.sql in filename order
 * inside a single transaction per file, and records applied migrations
 * in a schema_migrations table so re-runs are safe.
 *
 * In the real ACEAPT codebase, replace this with whatever migration
 * tool Features 1-43 already use (Knex/Prisma/node-pg-migrate/Flyway) -
 * the .sql files themselves are plain, portable DDL.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error("MIGRATION_DATABASE_URL is not set");
  }
  const client = new pg.Client({ connectionString });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await client.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [file]
    );
    if (rows.length > 0) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`apply ${file}`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`FAILED ${file}`);
      throw err;
    }
  }

  await client.end();
  console.log("migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
