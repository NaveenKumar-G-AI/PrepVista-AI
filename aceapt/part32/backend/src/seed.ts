/**
 * Seeds ONE clearly-labeled demo student so the feature is usable
 * immediately without a real ACEAPT student/assessment feed. This is
 * sample data, not a fabricated result: the numbers below are just
 * seed inputs — every gap, trend, confidence and recommendation you'll
 * see in the API/UI is computed for real from these rows, the same
 * code path that would run against real assessment data.
 *
 * Re-running this script wipes and re-seeds the demo store, exactly
 * like a real `db:seed` script would.
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { getRepository } from "./data/repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "db.json");

const DEMO_STUDENT_ID = process.env.DEMO_STUDENT_ID || "demo-student-1";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function main() {
  await fs.rm(DB_PATH, { force: true });
  const repository = getRepository();

  await repository.upsertStudent({
    studentId: DEMO_STUDENT_ID,
    displayName: "Demo Student",
    targetRoleId: "swe_entry",
    updatedAt: new Date().toISOString(),
  });

  const attempts: { capabilityId: string; score: number; takenAt: string; source: string }[] = [
    // DSA: three attempts, improving, still below the 70 target -> DO_FIRST
    { capabilityId: "dsa", score: 48, takenAt: daysAgo(35), source: "mock_test" },
    { capabilityId: "dsa", score: 52, takenAt: daysAgo(18), source: "practice_set" },
    { capabilityId: "dsa", score: 58, takenAt: daysAgo(3), source: "practice_set" },
    // Programming fundamentals: close to the bar -> small gap, OPTIONAL
    { capabilityId: "prog_fund", score: 66, takenAt: daysAgo(20), source: "practice_set" },
    { capabilityId: "prog_fund", score: 69, takenAt: daysAgo(5), source: "practice_set" },
    // System design: a single attempt -> real gap but low evidence -> DO_NEXT
    { capabilityId: "sys_design", score: 50, takenAt: daysAgo(10), source: "mock_test" },
    // Quantitative aptitude: declining -> DO_NEXT
    { capabilityId: "quant", score: 62, takenAt: daysAgo(25), source: "practice_set" },
    { capabilityId: "quant", score: 55, takenAt: daysAgo(6), source: "practice_set" },
    // "comm" (Communication & Behavioral) is intentionally left with
    // zero attempts to demonstrate the "not yet assessed" path for a
    // capability that still carries real weight for the role.
  ];

  for (const a of attempts) {
    await repository.addAttempt({ id: randomUUID(), studentId: DEMO_STUDENT_ID, ...a });
  }

  await repository.addEvent({
    id: randomUUID(),
    studentId: DEMO_STUDENT_ID,
    type: "TARGET_ROLE_SET",
    payload: { roleId: "swe_entry" },
    createdAt: daysAgo(35),
  });

  console.log(`Seeded demo student '${DEMO_STUDENT_ID}' with ${attempts.length} assessment attempts.`);
  console.log(`Try: curl -s http://localhost:4000/api/readiness-radar/state -H "x-student-id: ${DEMO_STUDENT_ID}"`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exitCode = 1;
});
