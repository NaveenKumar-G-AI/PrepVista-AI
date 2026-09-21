/**
 * Persistence layer for ACEAPT Adapt.
 *
 * This is intentionally a small in-memory store with write-through JSON
 * persistence, NOT a real database. Section 4 of the master prompt says to
 * inspect and reuse PrepVista's existing database rather than invent a new
 * one - but no existing codebase was provided alongside the spec, so this
 * file plays that role behind a narrow interface (`Store`) that a real
 * implementation can drop in behind without touching the engine, routes,
 * or frontend.
 *
 * To swap in Postgres/MySQL/etc: reimplement each exported function below
 * against your real tables and delete data/db.json. Nothing else in this
 * codebase needs to change.
 */

import fs from "fs";
import path from "path";
import {
  AdaptationEvent,
  PendingExecution,
  PlanSessionRecord,
  RawTopicEvidence
} from "../types";
import { seedEvidence } from "./seed";

interface DbShape {
  evidence: Record<string, RawTopicEvidence[]>; // keyed by studentId
  planSessions: Record<string, PlanSessionRecord>; // keyed by studentId
  pendingExecutions: Record<string, PendingExecution>; // keyed by executionId
  events: AdaptationEvent[];
}

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

function freshDb(): DbShape {
  return {
    evidence: { "demo-student": seedEvidence() },
    planSessions: {},
    pendingExecutions: {},
    events: []
  };
}

let db: DbShape = loadFromDisk();

function loadFromDisk(): DbShape {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as DbShape;
  } catch {
    return freshDb();
  }
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    // Persistence is best-effort for this MVP store - an in-memory copy is
    // still authoritative for the running process even if the write fails.
    console.warn("[store] failed to persist to disk:", (err as Error).message);
  }
}

export const Store = {
  getEvidence(studentId: string): RawTopicEvidence[] {
    return db.evidence[studentId] ?? [];
  },

  setEvidence(studentId: string, evidence: RawTopicEvidence[]) {
    db.evidence[studentId] = evidence;
    persist();
  },

  updateTopicEvidence(studentId: string, topicId: string, update: Partial<RawTopicEvidence>) {
    const list = db.evidence[studentId] ?? [];
    const idx = list.findIndex((e) => e.topicId === topicId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...update };
    db.evidence[studentId] = list;
    persist();
  },

  getPlanSession(studentId: string): PlanSessionRecord | undefined {
    return db.planSessions[studentId];
  },

  setPlanSession(session: PlanSessionRecord) {
    db.planSessions[session.studentId] = session;
    persist();
  },

  clearPlanSession(studentId: string) {
    delete db.planSessions[studentId];
    persist();
  },

  savePendingExecution(exec: PendingExecution) {
    db.pendingExecutions[exec.executionId] = exec;
    persist();
  },

  getPendingExecution(executionId: string): PendingExecution | undefined {
    return db.pendingExecutions[executionId];
  },

  deletePendingExecution(executionId: string) {
    delete db.pendingExecutions[executionId];
    persist();
  },

  appendEvent(event: AdaptationEvent) {
    db.events.push(event);
    // Keep the log bounded per student in memory; a real system would page
    // this from a proper events table.
    if (db.events.length > 5000) {
      db.events = db.events.slice(-5000);
    }
    persist();
  },

  getEvents(studentId: string): AdaptationEvent[] {
    return db.events.filter((e) => e.studentId === studentId);
  },

  /** Wipes everything back to the seeded demo state. Used by tests and the
   *  "Reset demo data" affordance. */
  resetToSeed() {
    db = freshDb();
    persist();
  }
};
