import {
  RetentionEvidence,
  RecoverySession,
  RetentionAssessment,
  RetentionTransition,
  SkillMeta,
  StudentTarget,
} from '../types';

/**
 * Persistence is expressed as an interface on purpose. This vertical
 * slice ships an in-memory implementation (zero setup, nothing to install,
 * safe to run anywhere) — but every engine and route in this project talks
 * to `RecallRepository`, never to the in-memory class directly. Swapping in
 * a real database later (Postgres, or reusing ACEAPT's existing store) is a
 * matter of writing one new class, not touching business logic.
 */
export interface RecallRepository {
  addEvidence(e: RetentionEvidence): void;
  getEvidence(studentId: string, skillId: string): RetentionEvidence[];
  getSkillIdsForStudent(studentId: string): string[];

  addRecoverySession(s: RecoverySession): void;
  updateRecoverySession(id: string, patch: Partial<RecoverySession>): void;
  getRecoverySession(id: string): RecoverySession | undefined;
  getRecoverySessions(studentId: string, skillId: string): RecoverySession[];

  saveAssessment(a: RetentionAssessment): void;
  getAssessment(studentId: string, skillId: string): RetentionAssessment | undefined;
  getAssessmentsForStudent(studentId: string): RetentionAssessment[];

  addTransition(t: RetentionTransition): void;
  getTransitions(studentId: string, skillId: string): RetentionTransition[];

  getSkillMeta(skillId: string): SkillMeta | undefined;
  getAllSkillMeta(): SkillMeta[];

  getTarget(studentId: string): StudentTarget | undefined;
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export class InMemoryRecallRepository implements RecallRepository {
  private evidence: RetentionEvidence[] = [];
  private sessions: Map<string, RecoverySession> = new Map();
  private assessments: Map<string, RetentionAssessment> = new Map(); // key: studentId::skillId
  private transitions: RetentionTransition[] = [];
  private skills: Map<string, SkillMeta> = new Map();
  private targets: Map<string, StudentTarget> = new Map();

  private key(studentId: string, skillId: string) {
    return `${studentId}::${skillId}`;
  }

  addEvidence(e: RetentionEvidence): void {
    this.evidence.push(e);
  }

  getEvidence(studentId: string, skillId: string): RetentionEvidence[] {
    return this.evidence
      .filter((e) => e.studentId === studentId && e.skillId === skillId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  getSkillIdsForStudent(studentId: string): string[] {
    const ids = new Set<string>();
    this.evidence.filter((e) => e.studentId === studentId).forEach((e) => ids.add(e.skillId));
    this.assessments.forEach((a) => {
      if (a.studentId === studentId) ids.add(a.skillId);
    });
    return [...ids];
  }

  addRecoverySession(s: RecoverySession): void {
    this.sessions.set(s.id, s);
  }

  updateRecoverySession(id: string, patch: Partial<RecoverySession>): void {
    const existing = this.sessions.get(id);
    if (!existing) throw new Error(`Recovery session ${id} not found`);
    this.sessions.set(id, { ...existing, ...patch });
  }

  getRecoverySession(id: string): RecoverySession | undefined {
    return this.sessions.get(id);
  }

  getRecoverySessions(studentId: string, skillId: string): RecoverySession[] {
    return [...this.sessions.values()]
      .filter((s) => s.studentId === studentId && s.skillId === skillId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  saveAssessment(a: RetentionAssessment): void {
    this.assessments.set(this.key(a.studentId, a.skillId), a);
  }

  getAssessment(studentId: string, skillId: string): RetentionAssessment | undefined {
    return this.assessments.get(this.key(studentId, skillId));
  }

  getAssessmentsForStudent(studentId: string): RetentionAssessment[] {
    return [...this.assessments.values()].filter((a) => a.studentId === studentId);
  }

  addTransition(t: RetentionTransition): void {
    this.transitions.push(t);
  }

  getTransitions(studentId: string, skillId: string): RetentionTransition[] {
    return this.transitions.filter((t) => t.studentId === studentId && t.skillId === skillId);
  }

  getSkillMeta(skillId: string): SkillMeta | undefined {
    return this.skills.get(skillId);
  }

  getAllSkillMeta(): SkillMeta[] {
    return [...this.skills.values()];
  }

  getTarget(studentId: string): StudentTarget | undefined {
    return this.targets.get(studentId);
  }

  // --- seeding-only helpers, not part of the public interface ---
  _registerSkill(meta: SkillMeta) {
    this.skills.set(meta.id, meta);
  }

  _setTarget(target: StudentTarget) {
    this.targets.set(target.studentId, target);
  }
}
