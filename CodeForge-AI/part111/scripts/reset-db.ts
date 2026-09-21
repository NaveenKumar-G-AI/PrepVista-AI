import { getPool, closeAllPools } from "../lib/db/pool";
import { unlinkSync } from "node:fs";
import path from "node:path";

async function main() {
  const pool = getPool("admin");
  await pool.query(`drop schema if exists public cascade`);
  await pool.query(`drop schema if exists auth cascade`);
  await pool.query(`create schema public`);
  await pool.query(`grant all on schema public to app_admin`);
  try {
    unlinkSync(path.join(process.cwd(), ".demo-problem-ids.json"));
  } catch {
    /* fine if it didn't exist */
  }
  console.log("schema reset");
  await closeAllPools();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
