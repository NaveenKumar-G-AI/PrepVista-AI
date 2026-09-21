import type { EvidenceRecord, ReadinessResult, RoleModel } from '../domain/types';

/**
 * Integration seams (Phase 2, Phase 68 — "do not duplicate systems").
 *
 * The domain layer (src/domain/*) never talks to a database, an HTTP
 * service, or a queue directly — it only receives already-fetched
 * EvidenceRecord[] / RoleModel objects. Implement these three interfaces
 * against your REAL Skill Signal Engine, Mastery Engine, role model
 * service, and database. This file has zero implementation in it on
 * purpose: writing a fake implementation here would be exactly the kind
 * of mock-dressed-as-integration Phase 67 rules out.
 */

export interface EvidenceProvider {
  /**
   * Return verified evidence for the given student across the given skill
   * ids, by calling the EXISTING Skill Signal Engine / debugging engine /
   * reasoning verifier / challenge system — never recomputing evidence
   * here. Must not throw for a single unavailable sub-source; instead
   * return that skill's id in `unavailableSkillIds` so the caller can
   * degrade gracefully (Phase 49) rather than losing the whole request.
   */
  getEvidenceForSkills(
    studentId: string,
    skillIds: string[],
  ): Promise<{ evidence: EvidenceRecord[]; unavailableSkillIds: Set<string> }>;
}

export interface RoleModelProvider {
  /** Reuse the existing canonical Role-Based Skill Model (Phase 3) — do not build a second role taxonomy. */
  getRoleModel(roleId: string, version?: string): Promise<RoleModel>;
}

export interface VersionedSnapshot {
  /** Monotonic per (studentId, roleId) — used for optimistic concurrency (Phase 29). */
  version: number;
  result: ReadinessResult;
}

export interface SnapshotRepository {
  getCurrentSnapshot(studentId: string, roleId: string): Promise<VersionedSnapshot | null>;
  /**
   * Compare-and-swap write: only succeeds if the stored version currently
   * equals `expectedVersion` (null means "no snapshot exists yet"). Returns
   * null on a version conflict so the caller can retry (see
   * persistence/concurrency.ts). Maps directly onto
   * `UPDATE ... WHERE version = $expected RETURNING *` in Postgres/Supabase.
   */
  saveIfVersion(
    studentId: string,
    roleId: string,
    expectedVersion: number | null,
    result: ReadinessResult,
  ): Promise<VersionedSnapshot | null>;
  /** Append-only — historical assessments are never overwritten (Phase 24). */
  appendHistory(result: ReadinessResult): Promise<void>;
  getHistory(studentId: string, roleId: string, limit?: number): Promise<ReadinessResult[]>;
}
