import fs from 'node:fs';
import path from 'node:path';
import type {
  ApplicationStage,
  Opportunity,
  OutcomeEvidence,
  ProductEvent,
  Reassessment,
  RecoveryAction,
  RecoveryPlan,
  Student,
  TrajectoryNote,
} from '../types';

// ---------------------------------------------------------------------------
// This is a local JSON-file store standing in for ACEAPT's real database.
// It exists so this feature is runnable end-to-end with zero external setup.
//
// SWAP POINT: replace the body of each function in ./repository.ts with real
// queries against your existing schema (see ./schema.sql for the intended
// relational shape) — nothing outside this file needs to change, because
// every caller only ever imports from ./repository, never from here.
// ---------------------------------------------------------------------------

export interface DBShape {
  students: Student[];
  opportunities: Opportunity[];
  stages: ApplicationStage[];
  evidence: OutcomeEvidence[];
  recoveryPlans: RecoveryPlan[];
  recoveryActions: RecoveryAction[];
  reassessments: Reassessment[];
  trajectoryNotes: TrajectoryNote[];
  events: ProductEvent[];
}

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

function emptyDB(): DBShape {
  return {
    students: [],
    opportunities: [],
    stages: [],
    evidence: [],
    recoveryPlans: [],
    recoveryActions: [],
    reassessments: [],
    trajectoryNotes: [],
    events: [],
  };
}

function ensureFile(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(emptyDB(), null, 2), 'utf-8');
  }
}

export function readDB(): DBShape {
  ensureFile();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(raw) as Partial<DBShape>;
    // Merge over an empty shape so a partially-written file never crashes a read.
    return { ...emptyDB(), ...parsed };
  } catch {
    return emptyDB();
  }
}

export function writeDB(db: DBShape): void {
  ensureFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// Read-modify-write helper: keeps every mutation in the repository layer a
// single, atomic-looking operation instead of scattering read/write pairs.
export function mutateDB<T>(fn: (db: DBShape) => T): T {
  const db = readDB();
  const result = fn(db);
  writeDB(db);
  return result;
}
