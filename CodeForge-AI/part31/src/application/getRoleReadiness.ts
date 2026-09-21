import { computeRoleReadiness } from '../domain/readinessEngine';
import type { ReadinessResult } from '../domain/types';
import type { EvidenceProvider, RoleModelProvider, SnapshotRepository } from '../ports';
import { upsertSnapshotWithRetry } from '../persistence/concurrency';

export interface GetRoleReadinessParams {
  studentId: string;
  organizationId: string;
  roleId: string;
  ports: {
    evidenceProvider: EvidenceProvider;
    roleModelProvider: RoleModelProvider;
    snapshotRepository: SnapshotRepository;
  };
  options?: {
    forceRecalculate?: boolean;
    /** Set false only for tests that don't want to exercise persistence. */
    persist?: boolean;
    /** Observability hook (Phase 52) — wire this to your existing logging/metrics, don't invent a new backend here. */
    onCalculated?: (info: { durationMs: number; state: ReadinessResult['readinessState']; warnings: string[] }) => void;
  };
}

/** Cached results younger than this are served without recomputation (Phase 50). Tune to real traffic. */
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * The application-layer entry point: cache check -> role model fetch ->
 * evidence fetch -> pure calculation -> persist -> return. Returns null
 * when the role doesn't exist (caller maps that to 404) rather than
 * throwing, so a missing role is handled the same way whether the role
 * service is down or the id is simply wrong.
 */
export async function getRoleReadiness(params: GetRoleReadinessParams): Promise<ReadinessResult | null> {
  const { studentId, organizationId, roleId, ports, options = {} } = params;
  const startedAt = Date.now();

  if (!options.forceRecalculate) {
    const cached = await ports.snapshotRepository.getCurrentSnapshot(studentId, roleId);
    if (cached && Date.now() - new Date(cached.result.calculatedAt).getTime() < STALE_AFTER_MS) {
      return cached.result;
    }
  }

  let roleModel;
  try {
    roleModel = await ports.roleModelProvider.getRoleModel(roleId);
  } catch {
    return null; // role does not exist, or the role service is down — caller maps to 404
  }
  if (!roleModel) return null;

  const skillIds = roleModel.skills.map((s) => s.skillId);
  let evidenceResult: Awaited<ReturnType<EvidenceProvider['getEvidenceForSkills']>>;
  try {
    evidenceResult = await ports.evidenceProvider.getEvidenceForSkills(studentId, skillIds);
  } catch {
    // Phase 49 — total evidence-source failure must not become a false
    // zero. Treat every skill as unavailable (-> unassessed, not failing)
    // rather than throwing the whole request away.
    evidenceResult = { evidence: [], unavailableSkillIds: new Set(skillIds) };
  }

  const result = computeRoleReadiness({
    studentId,
    organizationId,
    roleModel,
    evidence: evidenceResult.evidence,
    unavailableSkillIds: evidenceResult.unavailableSkillIds,
  });

  if (options.persist !== false) {
    await upsertSnapshotWithRetry(ports.snapshotRepository, studentId, roleId, () => result);
  }

  options.onCalculated?.({ durationMs: Date.now() - startedAt, state: result.readinessState, warnings: result.warnings });

  return result;
}
