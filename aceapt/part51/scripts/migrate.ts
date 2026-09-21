import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ownerPool, closeAllPools } from "../src/db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sqlPath = path.join(__dirname, "..", "db", "01-schema.sql");
  const sql = readFileSync(sqlPath, "utf8");
  console.log(`Applying ${sqlPath} as owner...`);
  const result = await ownerPool.query(sql);
  const last = Array.isArray(result) ? result[result.length - 1] : result;
  console.log("Migration result:", last?.rows ?? last);
}

main()
  .then(async () => {
    await closeAllPools();
    console.log("✔ Migration complete");
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("✘ Migration failed:", err);
    await closeAllPools();
    process.exit(1);
  });
