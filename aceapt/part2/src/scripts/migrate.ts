import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db/client";

function main() {
  const schemaPath = path.join(process.cwd(), "src/lib/db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  const db = getDb();
  db.exec(schema);
  console.log("✔ schema applied");
}

main();
