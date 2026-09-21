import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schemaPath = path.join(__dirname, "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf-8");
db.exec(schema);

export function resetDatabase() {
  // Dev/demo convenience only — never exposed on an unauthenticated route.
  const tables = [
    "audit_log",
    "analytics_events",
    "mastery_evidence",
    "attempts",
    "sessions",
    "skill_practice_state",
    "question_exposure",
    "questions",
    "skills",
    "students",
  ];
  const txn = db.transaction(() => {
    for (const t of tables) db.exec(`DELETE FROM ${t}`);
  });
  txn();
}
