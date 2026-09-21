import {
  ChallengeMetadata,
  ChallengeHealth,
  StudentModel,
  SelectionAuditRecord,
  AdaptivePathState,
} from '../types';

/**
 * INTEGRATION BOUNDARY.
 *
 * Feature 25 must not become a second source of truth for challenges,
 * skills, or curriculum data (see spec: "Critical Architectural Boundary").
 * These ports describe exactly what the EXISTING CodeForge services need
 * to provide. In this standalone package they are backed by in-memory
 * fixtures (integration/inMemoryAdapters.ts) purely so the engine is
 * runnable and testable without the real repository attached.
 *
 * TO INTEGRATE FOR REAL: implement each port against the actual existing
 * services — challenge catalog, Role-Based Skill Model / mastery system,
 * curriculum & instructor-override config, Supabase-backed audit tables —
 * and inject those implementations wherever EnginePorts is constructed
 * (see src/api/handlers.ts). Do not fork these interfaces into new tables
 * that duplicate ones that already exist in the real repository.
 */

export interface ChallengeCatalogPort {
  /** Returns the raw candidate pool before any Feature-25 filtering/ranking. */
  getCandidateChallenges(filter: {
    role?: string | null;
    curriculumTags?: string[];
  }): Promise<ChallengeMetadata[]>;

  /** Health rollups (see spec: "Challenge Health"). May be a cached/async-computed table. */
  getChallengeHealth(challengeIds: string[]): Promise<Record<string, ChallengeHealth>>;
}

export interface StudentSkillModelPort {
  /**
   * Must return authoritative skill evidence from the existing Skill /
   * Mastery system — Feature 25 consumes this, it does not compute skill
   * scores from raw submissions itself outside of this engine's own
   * evidence-aggregation utilities (which exist so this package is
   * runnable standalone; prefer the real system's scores when integrated).
   */
  getStudentModel(studentId: string): Promise<StudentModel>;
}

export interface CurriculumPort {
  /** Active instructor/TPO override for this student, if any. Overrides always win (see spec: "Human Override"). */
  getActiveManualOverride(studentId: string): Promise<{ challengeId: string; reason: string } | null>;
}

export interface AuditLogPort {
  recordSelection(record: SelectionAuditRecord): Promise<void>;
  getLatestSelection(studentId: string): Promise<SelectionAuditRecord | null>;
  getAdaptivePath(studentId: string): Promise<AdaptivePathState | null>;
  saveAdaptivePath(state: AdaptivePathState): Promise<void>;
}

export interface EnginePorts {
  challengeCatalog: ChallengeCatalogPort;
  studentSkillModel: StudentSkillModelPort;
  curriculum: CurriculumPort;
  auditLog: AuditLogPort;
}
