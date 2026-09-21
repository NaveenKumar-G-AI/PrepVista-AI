import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SkillEvidence,
  StudentSkillState,
  SkillProgressEvent,
  SkillInsight,
  SelfPerception,
  Domain,
} from '../domain/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'store.json');

interface DBShape {
  evidence: SkillEvidence[]; // append-only, immutable
  states: Record<string, StudentSkillState>; // key: `${studentId}::${skillId}`
  progressEvents: SkillProgressEvent[]; // append-only history
  insights: SkillInsight[]; // append-only
  selfPerceptions: SelfPerception[];
}

function emptyDB(): DBShape {
  return { evidence: [], states: {}, progressEvents: [], insights: [], selfPerceptions: [] };
}

/**
 * A deliberately simple persistence layer for a prototype: in-memory,
 * snapshotted to a JSON file. Every method here maps 1:1 to a query a real
 * database would run (indexed lookups by studentId+skillId, append-only
 * inserts, no in-place mutation of evidence). Swapping this for Postgres /
 * whatever ACEAPT already uses means re-implementing this same interface
 * against real tables — the engine layer never touches storage directly, so
 * nothing above this file needs to change.
 */
export class Repository {
  private db: DBShape = emptyDB();

  load(): void {
    if (fs.existsSync(DATA_FILE)) {
      this.db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as DBShape;
    }
  }

  save(): void {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.db, null, 2));
  }

  reset(): void {
    this.db = emptyDB();
    this.save();
  }

  /** Returns false (and ignores the write) if this attempt was already ingested. */
  addEvidence(e: SkillEvidence): boolean {
    const dup = this.db.evidence.find((x) => x.questionAttemptId === e.questionAttemptId);
    if (dup) return false;
    this.db.evidence.push(e);
    return true;
  }

  getEvidenceForSkill(studentId: string, skillId: string): SkillEvidence[] {
    return this.db.evidence
      .filter((e) => e.studentId === studentId && e.skillId === skillId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  getState(studentId: string, skillId: string): StudentSkillState | null {
    return this.db.states[`${studentId}::${skillId}`] ?? null;
  }

  setState(studentId: string, skillId: string, state: StudentSkillState): void {
    this.db.states[`${studentId}::${skillId}`] = state;
  }

  getAllStates(studentId: string): StudentSkillState[] {
    return Object.values(this.db.states).filter((s) => s.studentId === studentId);
  }

  addProgressEvent(evt: SkillProgressEvent): void {
    this.db.progressEvents.push(evt);
  }

  getProgressEvents(studentId: string, skillId?: string): SkillProgressEvent[] {
    return this.db.progressEvents.filter((e) => e.studentId === studentId && (!skillId || e.skillId === skillId));
  }

  setSelfPerception(p: SelfPerception): void {
    this.db.selfPerceptions = this.db.selfPerceptions.filter(
      (x) => !(x.studentId === p.studentId && x.domain === p.domain),
    );
    this.db.selfPerceptions.push(p);
  }

  getSelfPerception(studentId: string, domain: Domain): SelfPerception | null {
    return this.db.selfPerceptions.find((x) => x.studentId === studentId && x.domain === domain) ?? null;
  }

  addInsight(i: SkillInsight): void {
    this.db.insights.push(i);
  }

  getInsights(studentId: string): SkillInsight[] {
    return this.db.insights.filter((i) => i.studentId === studentId);
  }
}

export const repo = new Repository();
