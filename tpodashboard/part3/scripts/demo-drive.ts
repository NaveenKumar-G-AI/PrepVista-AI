// SYNTHETIC DEV FIXTURE — demonstrates the persistence + lifecycle layer
// end-to-end against a temporary on-disk SQLite database. The database
// file is deleted at the end of the run; nothing here is production data.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, migrate } from "../src/db.js";
import {
  createDrive,
  addRuleVersion,
  calculateAndSnapshotEligibility,
  transitionDriveStatus,
  getAuditLog,
} from "../src/driveRepository.js";
import type { RuleNode, Student } from "../src/types.js";
import type { DriveStatus } from "../src/status.js";

const dbPath = path.join(os.tmpdir(), `prepvista-demo-${Date.now()}.db`);
const db = openDb(dbPath);
migrate(db);
console.log(`\n[SYNTHETIC DEV FIXTURE - temp SQLite DB at ${dbPath}]\n`);

const { id: driveId } = createDrive(db, {
  title: "SDE Intern 2026",
  companyName: "Acme Technologies",
  role: "Software Engineer Intern",
  actor: "tpo-anita",
});
console.log(`Created drive ${driveId} (status: DRAFT)`);

const rule: RuleNode = {
  kind: "AND", id: "root",
  children: [
    { kind: "LEAF", id: "dept", field: "department", comparator: "IN", value: ["CSE", "IT"], category: "DEPARTMENT", label: "Department" },
    { kind: "LEAF", id: "cgpa", field: "cgpa", comparator: "GTE", value: 7.0, category: "CGPA", label: "CGPA" },
    { kind: "LEAF", id: "backlog", field: "activeBacklogs", comparator: "LTE", value: 0, category: "BACKLOG", label: "Active backlogs" },
  ],
};
const versionResult = addRuleVersion(db, driveId, rule, "tpo-anita");
if (!versionResult.ok) {
  console.error("Rule rejected:", versionResult.issues);
  process.exit(1);
}
console.log(`Saved eligibility rule version ${versionResult.versionNumber}`);

const students: Student[] = Array.from({ length: 60 }, (_, i) => ({
  id: `DEV-${i + 1}`,
  name: `Dev Fixture Student ${i + 1}`,
  department: ["CSE", "IT", "MECH", "ECE"][i % 4],
  program: "B.Tech",
  graduationYear: 2026,
  cgpa: 5 + ((i * 37) % 50) / 10,
  activeBacklogs: i % 5 === 0 ? 1 : 0,
  totalBacklogs: 0,
  skills: [],
  certifications: [],
  internshipCount: 0,
  experienceMonths: 0,
  placementStatus: "UNPLACED",
}));

const snapshot = calculateAndSnapshotEligibility(db, driveId, versionResult.id, students);
console.log(`Eligibility snapshot: ${snapshot.eligibleCount}/${snapshot.total} eligible`);

console.log("\nWalking the lifecycle:");
const steps: [DriveStatus, string][] = [
  ["UNDER_REVIEW", "tpo-anita"],
  ["APPROVED", "tpo-head-ravi"],
  ["PUBLISHED", "tpo-head-ravi"],
];
for (const [to, actor] of steps) {
  const result = transitionDriveStatus(db, driveId, to, actor);
  console.log(`  -> ${to}: ${result.ok ? "OK" : "REJECTED (" + result.reason + ")"}`);
}

console.log("\nTrying an illegal jump (PUBLISHED -> IN_PROGRESS, skipping the applications window):");
const illegal = transitionDriveStatus(db, driveId, "IN_PROGRESS", "tpo-anita");
console.log(`  -> IN_PROGRESS: ${illegal.ok ? "OK (unexpected!)" : "REJECTED (" + illegal.reason + ")"}`);

console.log("\nFull audit trail:");
for (const entry of getAuditLog(db, driveId) as Array<{ occurred_at: string; event_type: string; actor: string; from_status: string | null; to_status: string | null }>) {
  const transition = entry.from_status ? ` (${entry.from_status} -> ${entry.to_status})` : "";
  console.log(`  [${entry.occurred_at}] ${entry.event_type} by ${entry.actor}${transition}`);
}

db.close();
fs.rmSync(dbPath, { force: true });
console.log(`\n(Temp database removed: ${dbPath})\n`);
