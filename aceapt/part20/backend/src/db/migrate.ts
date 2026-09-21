import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log("[migrate] schema applied successfully.");
  await pool.end();
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[migrate] failed:", err);
  process.exit(1);
});
