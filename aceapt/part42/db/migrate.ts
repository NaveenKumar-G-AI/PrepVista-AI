import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOwnerPool } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

/**
 * Applies every 001+ migration, in order, as diag_owner. 000_bootstrap_roles.sql
 * requires a superuser and is intentionally NOT run by this script — see its
 * header comment. Run it once, separately, with a superuser connection.
 */
async function main() {
  const pool = createOwnerPool();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && f !== "000_bootstrap_roles.sql")
    .sort();

  const client = await pool.connect();
  try {
    await client.query(`
      create table if not exists diag_schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    for (const file of files) {
      const { rows } = await client.query(
        "select 1 from diag_schema_migrations where filename = $1",
        [file],
      );
      if (rows.length > 0) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`apply ${file}`);
      await client.query(sql);
      await client.query(
        "insert into diag_schema_migrations (filename) values ($1)",
        [file],
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exitCode = 1;
});
