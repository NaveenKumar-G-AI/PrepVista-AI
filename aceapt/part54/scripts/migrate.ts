import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "db", "migrations");

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL ?? "postgresql://postgres@localhost:5432/aceapt_qve";
  const client = new pg.Client({ connectionString });
  await client.connect();

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`Applying ${file}...`);
    await client.query(sql);
    console.log(`  ✓ ${file}`);
  }

  await client.end();
  console.log("All migrations applied.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
