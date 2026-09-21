import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getPool, closeAllPools } from "../lib/db/pool";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

async function main() {
  const skipLocalShim = process.argv.includes("--production");
  const pool = getPool("admin");

  await pool.query(`
    create table if not exists public._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !(skipLocalShim && f.startsWith("0000_")))
    .sort();

  const { rows: applied } = await pool.query<{ filename: string }>(
    "select filename from public._migrations"
  );
  const appliedSet = new Set(applied.map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._migrations (filename) values ($1)", [file]);
      await client.query("commit");
      console.log(`apply ${file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`FAIL  ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("migrations complete");
  await closeAllPools();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
