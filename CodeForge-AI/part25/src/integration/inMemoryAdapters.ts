import { ChallengeCatalogPort, StudentSkillModelPort, CurriculumPort, AuditLogPort } from './ports';
import { ChallengeMetadata, ChallengeHealth, StudentModel, SelectionAuditRecord, AdaptivePathState } from '../types';

/**
 * DEMO / TEST ONLY.
 *
 * These in-memory adapters exist purely so this package is runnable and
 * testable as a standalone engine. They must be replaced with adapters
 * backed by the real CodeForge challenge catalog, skill/mastery system,
 * curriculum config, and Supabase-backed audit tables before any of this
 * is used against real students. Nothing here persists across process
 * restarts, and none of it is RLS-protected — see src/db/migrations for
 * the real schema this is standing in for.
 */

export class InMemoryChallengeCatalog implements ChallengeCatalogPort {
  constructor(
    private challenges: ChallengeMetadata[],
    private health: Record<string, ChallengeHealth> = {}
  ) {}

  async getCandidateChallenges(): Promise<ChallengeMetadata[]> {
    return this.challenges;
  }

  async getChallengeHealth(challengeIds: string[]): Promise<Record<string, ChallengeHealth>> {
    const out: Record<string, ChallengeHealth> = {};
    for (const id of challengeIds) {
      if (this.health[id]) out[id] = this.health[id];
    }
    return out;
  }
}

export class InMemoryStudentSkillModel implements StudentSkillModelPort {
  constructor(private students: Record<string, StudentModel>) {}

  async getStudentModel(studentId: string): Promise<StudentModel> {
    const s = this.students[studentId];
    if (!s) throw new Error(`Unknown student: ${studentId}`);
    return s;
  }

  /** Test helper — simulates the real skill model updating after a challenge, without Feature 25 owning that write path. */
  setStudent(student: StudentModel): void {
    this.students[student.studentId] = student;
  }
}

export class InMemoryCurriculum implements CurriculumPort {
  constructor(private overrides: Record<string, { challengeId: string; reason: string }> = {}) {}

  async getActiveManualOverride(studentId: string) {
    return this.overrides[studentId] ?? null;
  }
}

export class InMemoryAuditLog implements AuditLogPort {
  private selections: SelectionAuditRecord[] = [];
  private paths: Record<string, AdaptivePathState> = {};

  async recordSelection(record: SelectionAuditRecord): Promise<void> {
    this.selections.push(record);
  }

  async getLatestSelection(studentId: string): Promise<SelectionAuditRecord | null> {
    const forStudent = this.selections.filter((s) => s.studentId === studentId);
    return forStudent.length ? forStudent[forStudent.length - 1] : null;
  }

  async getAdaptivePath(studentId: string): Promise<AdaptivePathState | null> {
    return this.paths[studentId] ?? null;
  }

  async saveAdaptivePath(state: AdaptivePathState): Promise<void> {
    this.paths[state.studentId] = state;
  }

  /** Test helper. */
  getAllSelections(): SelectionAuditRecord[] {
    return this.selections;
  }
}
