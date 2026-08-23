import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { createTestDatabase } from "../src/db.js";
import { MetricDefinitionRepository } from "../src/repositories/metricDefinitionRepository.js";
import { ReportDefinitionRepository } from "../src/repositories/reportDefinitionRepository.js";

export const INST = "test_inst";
export const SEASON = "2099";

export function freshDb(): Database.Database {
  return createTestDatabase();
}

export function seedStandardMetricDefinitions(db: Database.Database) {
  const repo = new MetricDefinitionRepository(db);
  const now = "2099-01-01T00:00:00.000Z";
  repo.create({
    institutionId: INST, name: "placement_rate", description: "test",
    formulaDefinition: "Verified placed students ÷ students seeking placement.",
    denominatorDefinition: "Students with seeking_placement = true in the season.",
    dataSources: ["students", "offers", "joining"], calculatorKey: "placement_rate",
    version: 1, effectiveFrom: now, effectiveTo: null, status: "active",
  });
  repo.create({
    institutionId: INST, name: "median_ctc", description: "test",
    formulaDefinition: "Median of (fixed + variable CTC) across verified joined offers.",
    denominatorDefinition: "Verified placements in the season.",
    dataSources: ["offers", "joining"], calculatorKey: "median_ctc",
    version: 1, effectiveFrom: now, effectiveTo: null, status: "active",
  });
  repo.create({
    institutionId: INST, name: "average_ctc", description: "test",
    formulaDefinition: "Mean of (fixed + variable CTC) across verified joined offers.",
    denominatorDefinition: "Verified placements in the season.",
    dataSources: ["offers", "joining"], calculatorKey: "average_ctc",
    version: 1, effectiveFrom: now, effectiveTo: null, status: "active",
  });
  repo.create({
    institutionId: INST, name: "highest_ctc", description: "test",
    formulaDefinition: "Max of (fixed + variable CTC) across verified joined offers.",
    denominatorDefinition: "Verified placements in the season.",
    dataSources: ["offers", "joining"], calculatorKey: "highest_ctc",
    version: 1, effectiveFrom: now, effectiveTo: null, status: "active",
  });
}

export function seedStandardReportDefinition(db: Database.Database) {
  const repo = new ReportDefinitionRepository(db);
  repo.create({
    institutionId: INST, name: "executive_report", type: "executive", version: 1,
    sections: ["kpis", "funnel"], metricConfig: ["placement_rate", "median_ctc", "average_ctc", "highest_ctc"],
    visibility: "management", createdBy: "test",
  });
}

export function insertStudent(
  db: Database.Database,
  over: Partial<{
    id: string; name: string; department: string; program: string; seeking: boolean; eligible: boolean;
    readiness: number | null; risk: string | null; season: string;
  }> = {}
): string {
  const id = over.id ?? randomUUID();
  db.prepare(
    `INSERT INTO students (id, institution_id, season, name, department, program, seeking_placement, eligible, readiness_score, risk_level, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, INST, over.season ?? SEASON, over.name ?? `Student ${id.slice(0, 8)}`, over.department ?? "CSE", over.program ?? "B.Tech",
    (over.seeking ?? true) ? 1 : 0, (over.eligible ?? true) ? 1 : 0,
    over.readiness ?? 70, over.risk ?? "developing", "2099-01-01T00:00:00.000Z"
  );
  return id;
}

export function insertApplication(
  db: Database.Database,
  studentId: string,
  over: Partial<{ id: string; status: string; company: string; season: string; driveId: string }> = {}
): string {
  const id = over.id ?? randomUUID();
  db.prepare(
    `INSERT INTO applications (id, institution_id, season, student_id, drive_id, company, role, status, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, INST, over.season ?? SEASON, studentId, over.driveId ?? "drive-1", over.company ?? "Acme Test Co", "Engineer", over.status ?? "offered", "2099-01-05T00:00:00.000Z");
  return id;
}

export function insertOffer(
  db: Database.Database,
  applicationId: string,
  studentId: string,
  over: Partial<{ id: string; ctcFixed: number; ctcVariable: number; status: string; verified: boolean; season: string; company: string }> = {}
): string {
  const id = over.id ?? randomUUID();
  db.prepare(
    `INSERT INTO offers (id, institution_id, season, application_id, student_id, company, role, ctc_fixed, ctc_variable, status, verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, INST, over.season ?? SEASON, applicationId, studentId, over.company ?? "Acme Test Co", "Engineer",
    over.ctcFixed ?? 6, over.ctcVariable ?? 0, over.status ?? "accepted", (over.verified ?? true) ? 1 : 0,
    "2099-01-10T00:00:00.000Z"
  );
  return id;
}

export function insertJoining(
  db: Database.Database,
  offerId: string,
  studentId: string,
  over: Partial<{ id: string; status: string; verified: boolean }> = {}
): string {
  const id = over.id ?? randomUUID();
  db.prepare(
    `INSERT INTO joining (id, institution_id, offer_id, student_id, status, verified, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, INST, offerId, studentId, over.status ?? "joined", (over.verified ?? true) ? 1 : 0, "2099-01-20T00:00:00.000Z");
  return id;
}

export function insertInterview(
  db: Database.Database,
  applicationId: string,
  over: Partial<{ id: string; attended: boolean | null; result: string | null; completedAt: string | null; scheduledAt: string | null }> = {}
): string {
  const id = over.id ?? randomUUID();
  db.prepare(
    `INSERT INTO interviews (id, institution_id, application_id, scheduled_at, attended, result, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, INST, applicationId,
    over.scheduledAt ?? "2099-01-03T00:00:00.000Z",
    over.attended === undefined ? 1 : over.attended === null ? null : over.attended ? 1 : 0,
    over.result === undefined ? "selected" : over.result,
    over.completedAt === undefined ? "2099-01-04T00:00:00.000Z" : over.completedAt
  );
  return id;
}

/** Convenience: creates one fully verified, placed student end-to-end. Returns all the ids. */
export function placeStudent(
  db: Database.Database,
  over: { department?: string; name?: string; ctcFixed?: number; ctcVariable?: number; joiningVerified?: boolean } = {}
) {
  const studentId = insertStudent(db, { department: over.department, name: over.name });
  const appId = insertApplication(db, studentId, { status: "offered" });
  const offerId = insertOffer(db, appId, studentId, { ctcFixed: over.ctcFixed, ctcVariable: over.ctcVariable });
  const joiningId = insertJoining(db, offerId, studentId, { status: "joined", verified: over.joiningVerified ?? true });
  return { studentId, appId, offerId, joiningId };
}
