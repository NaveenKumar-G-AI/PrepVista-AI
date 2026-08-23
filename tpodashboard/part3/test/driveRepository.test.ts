import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDb, migrate } from "../src/db.js";
import {
  createDrive,
  addRuleVersion,
  calculateAndSnapshotEligibility,
  transitionDriveStatus,
  getDrive,
  getAuditLog,
} from "../src/driveRepository.js";
import type { RuleNode, Student } from "../src/types.js";
import { makeStudent } from "./fixtures.js";

let dbPath: string;
let db: DatabaseSync;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `prepvista-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = openDb(dbPath);
  migrate(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dbPath, { force: true });
});

const rule: RuleNode = {
  kind: "AND", id: "r",
  children: [
    { kind: "LEAF", id: "c", field: "cgpa", comparator: "GTE", value: 7, category: "CGPA" },
    { kind: "LEAF", id: "d", field: "department", comparator: "IN", value: ["CSE"], category: "DEPARTMENT" },
  ],
};

const students: Student[] = [
  makeStudent({ id: "1", cgpa: 8, department: "CSE" }),
  makeStudent({ id: "2", cgpa: 5, department: "CSE" }),
  makeStudent({ id: "3", cgpa: 8, department: "MECH" }),
];

describe("Drive persistence", () => {
  it("creates a drive in DRAFT with an audit entry", () => {
    const { id } = createDrive(db, { title: "SDE Intern", companyName: "Acme", role: "SDE", actor: "tpo-1" });
    const drive = getDrive(db, id) as { status: string };
    expect(drive.status).toBe("DRAFT");
    const log = getAuditLog(db, id) as { event_type: string }[];
    expect(log).toHaveLength(1);
    expect(log[0].event_type).toBe("DRIVE_CREATED");
  });

  it("rejects an unsafe rule tree before it ever reaches storage", () => {
    const { id } = createDrive(db, { title: "X", companyName: "Y", role: "Z", actor: "tpo-1" });
    const badRule = {
      kind: "LEAF", id: "bad", field: "cgpa", comparator: "HAS", value: 7, category: "CGPA",
    } as unknown as RuleNode;
    const result = addRuleVersion(db, id, badRule, "tpo-1");
    expect(result.ok).toBe(false);
  });

  it("versions rules and snapshots eligibility using the tested engine", () => {
    const { id } = createDrive(db, { title: "SDE Intern", companyName: "Acme", role: "SDE", actor: "tpo-1" });
    const versionResult = addRuleVersion(db, id, rule, "tpo-1");
    expect(versionResult.ok).toBe(true);
    if (!versionResult.ok) return;

    const snapshot = calculateAndSnapshotEligibility(db, id, versionResult.id, students);
    expect(snapshot.total).toBe(3);
    expect(snapshot.eligibleCount).toBe(1); // only student 1: CGPA 8, CSE
    expect(snapshot.notEligibleCount).toBe(2);
  });

  it("enforces the status machine and rejects illegal transitions", () => {
    const { id } = createDrive(db, { title: "SDE Intern", companyName: "Acme", role: "SDE", actor: "tpo-1" });

    const skip = transitionDriveStatus(db, id, "PUBLISHED", "tpo-1");
    expect(skip.ok).toBe(false);

    const step1 = transitionDriveStatus(db, id, "UNDER_REVIEW", "tpo-1");
    expect(step1.ok).toBe(true);
    const step2 = transitionDriveStatus(db, id, "APPROVED", "tpo-head-1", "Looks good");
    expect(step2.ok).toBe(true);

    const drive = getDrive(db, id) as { status: string };
    expect(drive.status).toBe("APPROVED");

    const log = getAuditLog(db, id) as { event_type: string }[];
    expect(log.filter((e) => e.event_type === "DRIVE_STATUS_CHANGED")).toHaveLength(2);
  });

  it("records every legal transition with actor and timestamp", () => {
    const { id } = createDrive(db, { title: "SDE Intern", companyName: "Acme", role: "SDE", actor: "tpo-1" });
    transitionDriveStatus(db, id, "UNDER_REVIEW", "tpo-1");
    const log = getAuditLog(db, id) as { event_type: string; actor: string; from_status: string; to_status: string; occurred_at: string }[];
    const entry = log.find((e) => e.event_type === "DRIVE_STATUS_CHANGED")!;
    expect(entry.actor).toBe("tpo-1");
    expect(entry.from_status).toBe("DRAFT");
    expect(entry.to_status).toBe("UNDER_REVIEW");
    expect(entry.occurred_at).toBeTruthy();
  });
});
