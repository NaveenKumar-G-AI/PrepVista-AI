import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";
import { withServiceScope, closePools } from "../src/lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const sql = readFileSync(schemaPath, "utf-8");

  console.log("[migrate] applying sql/schema.sql via aceapt_service ...");
  await withServiceScope(async (client) => {
    await client.query(sql);
  });
  console.log("[migrate] done.");
}

main()
  .catch((err) => {
    console.error("[migrate] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
