import fs from 'node:fs';
import path from 'node:path';
import { AttemptEvidence, StudentSkillHistory } from '../types/evidence';
import { Diagnosis } from '../types/diagnosis';
import {
  InterventionRecord,
  HintAttemptRecord,
  RecoverySession,
  StudentInterventionProfile,
} from '../types/domain';
import { DomainEvent } from '../types/events';

/**
 * Minimal embedded JSON store so this prototype runs with zero external
 * infrastructure. This is intentionally NOT the production data layer —
 * see /schema.sql at the repo root for the relational schema to migrate
 * onto (Postgres/MySQL) and reconcile against whatever tables already
 * exist in your system. Swap this module out; nothing above it should
 * need to change since callers only use the typed methods below.
 */

export interface StudentRecord {
  id: string;
  displayName: string;
}

export interface MasteryStateRecord {
  studentId: string;
  skillId: string;
  microSkillId?: string;
  masteryState: string;
  transferState: string;
  retentionState: string;
  readinessState: string;
  updatedAt: string;
}

export interface JourneyStateRecord {
  studentId: string;
  currentSkillId: string;
  currentMicroSkillId?: string;
  status: string;
  lastReplannedAt: string;
  note: string;
}

interface DbShape {
  students: StudentRecord[];
  attempts: AttemptEvidence[];
  diagnoses: Diagnosis[];
  interventions: InterventionRecord[];
  hintAttempts: HintAttemptRecord[];
  recoverySessions: RecoverySession[];
  events: DomainEvent[];
  profiles: StudentInterventionProfile[];
  masteryState: MasteryStateRecord[];
  journeyState: JourneyStateRecord[];
  skillAccuracy: { studentId: string; skillId: string; microSkillId?: string; correct: boolean; createdAt: string }[];
}

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.json');

function emptyDb(): DbShape {
  return {
    students: [],
    attempts: [],
    diagnoses: [],
    interventions: [],
    hintAttempts: [],
    recoverySessions: [],
    events: [],
    profiles: [],
    masteryState: [],
    journeyState: [],
    skillAccuracy: [],
  };
}

class JsonStore {
  private db: DbShape;

  constructor() {
    this.db = this.load();
  }

  private load(): DbShape {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        return { ...emptyDb(), ...JSON.parse(raw) };
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[store] failed to load db.json, starting fresh:', err);
    }
    return emptyDb();
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2), 'utf-8');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[store] failed to persist db.json:', err);
    }
  }

  reset(): void {
    this.db = emptyDb();
    this.save();
  }

  // --- students ---
  upsertStudent(rec: StudentRecord): void {
    const idx = this.db.students.findIndex((s) => s.id === rec.id);
    if (idx >= 0) this.db.students[idx] = rec;
    else this.db.students.push(rec);
    this.save();
  }
  getStudent(id: string): StudentRecord | undefined {
    return this.db.students.find((s) => s.id === id);
  }

  // --- attempts + rolling accuracy ---
  addAttempt(evidence: AttemptEvidence): void {
    this.db.attempts.push(evidence);
    this.db.skillAccuracy.push({
      studentId: evidence.studentId,
      skillId: evidence.skillId,
      microSkillId: evidence.microSkillId,
      correct: evidence.correct,
      createdAt: new Date().toISOString(),
    });
    // also credit prerequisite accuracy tracking isn't observed directly here;
    // prerequisite accuracy is read from whatever skill the prior attempts were on.
    this.save();
  }

  getRecentAccuracy(studentId: string, skillId: string, windowSize = 10): { accuracy: number; sampleSize: number } {
    const rows = this.db.skillAccuracy
      .filter((r) => r.studentId === studentId && r.skillId === skillId)
      .slice(-windowSize);
    if (rows.length === 0) return { accuracy: 0, sampleSize: 0 };
    const correct = rows.filter((r) => r.correct).length;
    return { accuracy: correct / rows.length, sampleSize: rows.length };
  }

  /**
   * Same as getRecentAccuracy but scoped to a specific micro-skill (Section 22).
   * Used specifically for intervention before/after effectiveness so a single
   * recovery cycle isn't diluted by the parent skill's broader history — e.g.
   * a student who is generally strong at "Profit & Loss" but weak specifically
   * on "reverse problems" shouldn't have that improvement washed out by years
   * of unrelated accuracy on the parent topic.
   */
  getRecentAccuracyForMicroSkill(studentId: string, microSkillId: string, windowSize = 10): { accuracy: number; sampleSize: number } {
    const rows = this.db.skillAccuracy
      .filter((r) => r.studentId === studentId && r.microSkillId === microSkillId)
      .slice(-windowSize);
    if (rows.length === 0) return { accuracy: 0, sampleSize: 0 };
    const correct = rows.filter((r) => r.correct).length;
    return { accuracy: correct / rows.length, sampleSize: rows.length };
  }

  getHistoricalAccuracy(studentId: string, skillId: string): { accuracy: number; sampleSize: number } {
    const rows = this.db.skillAccuracy.filter((r) => r.studentId === studentId && r.skillId === skillId);
    if (rows.length === 0) return { accuracy: 0, sampleSize: 0 };
    const correct = rows.filter((r) => r.correct).length;
    return { accuracy: correct / rows.length, sampleSize: rows.length };
  }

  // --- diagnoses ---
  addDiagnosis(d: Diagnosis): void {
    this.db.diagnoses.push(d);
    this.save();
  }

  // --- interventions ---
  addIntervention(rec: InterventionRecord): void {
    this.db.interventions.push(rec);
    this.save();
  }
  updateIntervention(id: string, patch: Partial<InterventionRecord>): InterventionRecord | undefined {
    const idx = this.db.interventions.findIndex((i) => i.id === id);
    if (idx < 0) return undefined;
    this.db.interventions[idx] = { ...this.db.interventions[idx], ...patch };
    this.save();
    return this.db.interventions[idx];
  }
  getIntervention(id: string): InterventionRecord | undefined {
    return this.db.interventions.find((i) => i.id === id);
  }
  getInterventionHistory(studentId: string, skillId?: string): InterventionRecord[] {
    return this.db.interventions
      .filter((i) => i.studentId === studentId && (!skillId || i.skillId === skillId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // --- hints ---
  addHintAttempt(rec: HintAttemptRecord): void {
    this.db.hintAttempts.push(rec);
    this.save();
  }
  countHints(interventionId: string): number {
    return this.db.hintAttempts.filter((h) => h.interventionId === interventionId).length;
  }

  // --- recovery sessions ---
  addRecoverySession(session: RecoverySession): void {
    this.db.recoverySessions.push(session);
    this.save();
  }
  updateRecoverySession(id: string, patch: Partial<RecoverySession>): RecoverySession | undefined {
    const idx = this.db.recoverySessions.findIndex((r) => r.id === id);
    if (idx < 0) return undefined;
    this.db.recoverySessions[idx] = { ...this.db.recoverySessions[idx], ...patch };
    this.save();
    return this.db.recoverySessions[idx];
  }
  getRecoverySession(id: string): RecoverySession | undefined {
    return this.db.recoverySessions.find((r) => r.id === id);
  }

  // --- events (idempotent) ---
  addEventIfNew(event: DomainEvent): boolean {
    if (this.db.events.some((e) => e.id === event.id)) return false;
    this.db.events.push(event);
    this.save();
    return true;
  }
  getEvents(studentId?: string): DomainEvent[] {
    return studentId ? this.db.events.filter((e) => e.studentId === studentId) : this.db.events;
  }

  // --- profiles ---
  getProfile(studentId: string): StudentInterventionProfile {
    const found = this.db.profiles.find((p) => p.studentId === studentId);
    if (found) return found;
    const fresh: StudentInterventionProfile = { studentId, stats: [] };
    this.db.profiles.push(fresh);
    this.save();
    return fresh;
  }
  saveProfile(profile: StudentInterventionProfile): void {
    const idx = this.db.profiles.findIndex((p) => p.studentId === profile.studentId);
    if (idx >= 0) this.db.profiles[idx] = profile;
    else this.db.profiles.push(profile);
    this.save();
  }

  // --- mastery state (mock of Feature 14's store) ---
  getMasteryState(studentId: string, skillId: string): MasteryStateRecord | undefined {
    return this.db.masteryState.find((m) => m.studentId === studentId && m.skillId === skillId);
  }
  upsertMasteryState(rec: MasteryStateRecord): void {
    const idx = this.db.masteryState.findIndex((m) => m.studentId === rec.studentId && m.skillId === rec.skillId);
    if (idx >= 0) this.db.masteryState[idx] = rec;
    else this.db.masteryState.push(rec);
    this.save();
  }

  // --- journey state (mock of Feature 15's store) ---
  getJourneyState(studentId: string): JourneyStateRecord | undefined {
    return this.db.journeyState.find((j) => j.studentId === studentId);
  }
  upsertJourneyState(rec: JourneyStateRecord): void {
    const idx = this.db.journeyState.findIndex((j) => j.studentId === rec.studentId);
    if (idx >= 0) this.db.journeyState[idx] = rec;
    else this.db.journeyState.push(rec);
    this.save();
  }
}

export const store = new JsonStore();
