/**
 * Creates exactly one institution and one TPO login. No companies, no recruiter data —
 * the spec requires the module to work correctly with an empty institution (Operating
 * Principle #13), so the default seed leaves it empty rather than pre-populating it.
 * For a populated view to demo against, run `npm run seed:demo` afterwards — see
 * demoSeed.ts, which is a separate, clearly-labeled, non-default script.
 */
import bcrypt from "bcryptjs";
import { openDb, ensureSchema } from "../db/connection.js";
import { newId, nowIso } from "../util/id.js";

const db = openDb();
ensureSchema(db);

const existing = db.prepare(`select id from institution limit 1`).get();
if (existing) {
  console.log("Dev seed already applied — an institution already exists. Skipping.");
  process.exit(0);
}

const institutionId = newId();
const userId = newId();
const now = nowIso();
const email = "tpo@demo.prepvista.test";
const password = "changeme123";

db.prepare(`insert into institution (id, name, created_at) values (?, ?, ?)`).run(
  institutionId,
  "Demo Institute of Technology",
  now
);

db.prepare(
  `insert into app_user (id, institution_id, name, email, password_hash, role, created_at)
   values (?, ?, ?, ?, ?, ?, ?)`
).run(userId, institutionId, "Priya Sharma", email, bcrypt.hashSync(password, 10), "TPO", now);

console.log("Dev seed complete.");
console.log(`  Institution: Demo Institute of Technology (${institutionId})`);
console.log(`  Login:       ${email} / ${password}`);
console.log("  Companies:   0 (empty state, by design)");

db.close();
