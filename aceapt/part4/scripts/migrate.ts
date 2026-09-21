import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error("MIGRATION_DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const appliedRes = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedRes.rows.map((r) => r.filename));

    const migrationsDir = path.join(__dirname, "..", "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skipping ${file} (already applied).`);
        continue;
      }
      const sql = readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`Applying ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log(appliedCount ? `Applied ${appliedCount} migration(s).` : "Nothing to apply — already up to date.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
