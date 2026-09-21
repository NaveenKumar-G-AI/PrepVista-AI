import type { InterventionRecord, LearningAction, LearningEventRecord, PathVersion, Skill, SkillEvidenceRecord, StudentContext } from "../domain/types.js";
import type { AttemptSignal } from "../domain/stuckDetection.js";

export interface AttemptRecordInput {
  skillId: string;
  correct: boolean;
  hintUsed: boolean;
  errorSignature: string | null;
  timeMs: number;
  expectedTimeMs: number;
}

/**
 * Everything Feature 4's services need from storage. Implemented twice on
 * purpose: InMemoryStore for fast unit tests with no external dependency,
 * PostgresStore for integration tests and the real running server — same
 * interface, so engine/service code never knows which one it's talking to.
 */
export interface Store {
  getSkillCatalog(): Promise<Skill[]>;

  getStudent(studentId: string): Promise<StudentContext | null>;
  upsertStudent(context: StudentContext, name: string): Promise<void>;

  getEvidenceForStudent(studentId: string): Promise<Map<string, SkillEvidenceRecord>>;
  upsertEvidence(evidence: SkillEvidenceRecord): Promise<void>;

  recordAttempt(studentId: string, input: AttemptRecordInput): Promise<void>;
  getRecentAttemptsBySkill(studentId: string, limit?: number): Promise<Map<string, AttemptSignal[]>>;

  getLatestPathVersion(studentId: string): Promise<PathVersion | null>;
  listPathVersions(studentId: string): Promise<PathVersion[]>;
  /**
   * Returns the version as actually persisted — the id/versionNumber the
   * caller passed in are a best-effort guess (used for the `reason` text
   * and node contents), but under concurrent regeneration the true version
   * number is assigned atomically server-side (see
   * migrations/003_atomic_version_numbering.sql) and may differ. Callers
   * must use the returned value, not the input, as the source of truth.
   */
  savePathVersion(version: PathVersion): Promise<PathVersion>;

  createAction(action: LearningAction): Promise<LearningAction>;
  getAction(studentId: string, actionId: string): Promise<LearningAction | null>;
  listActions(studentId: string, status?: LearningAction["status"]): Promise<LearningAction[]>;
  transitionAction(studentId: string, actionId: string, newStatus: LearningAction["status"]): Promise<LearningAction>;

  getInterventionsBySkill(studentId: string): Promise<Map<string, InterventionRecord[]>>;
  recordIntervention(record: InterventionRecord): Promise<void>;

  appendEvent(event: LearningEventRecord): Promise<void>;
  getEvents(studentId: string, limit?: number): Promise<LearningEventRecord[]>;
}
