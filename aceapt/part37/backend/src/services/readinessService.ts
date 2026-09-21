import {
  aggregateCapabilityEvidence,
  compareClaimToEvidence,
  computeReadiness,
  detectOverPreparation,
  detectUnderPreparation,
  recommendNextProof,
} from '../engine';
import { OpportunityProvider, TrajectoryProvider, ValidationCatalogProvider } from '../integrations/types';
import { ReadinessRepository, RequirementSet } from '../repositories/readinessRepository';
import { CapabilityEvidenceResult, ConfidenceLevel, EvidenceItem, ReadinessResult } from '../types/domain';
import { DEFAULT_FRESHNESS_WINDOW_DAYS } from '../engine/freshness';
import { DeterministicExplanationProvider, ExplanationProvider } from './explanationProvider';

export interface ReadinessDTO extends ReadinessResult {
  roleId: string;
  roleName: string;
  nextProof: ReturnType<typeof recommendNextProof>;
  overPreparationNote: string | null;
  underPreparationNote: string | null;
  claimComparisons: Array<{ capabilityId: string; capabilityName: string; comparison: ReturnType<typeof compareClaimToEvidence> }>;
  computedAt: string;
}

const READABLE_STATE: Record<string, string> = {
  UNKNOWN: 'Unknown',
  EXPLORING: 'Exploring',
  BUILDING: 'Building',
  DEVELOPING: 'Developing',
  VALIDATING: 'Validating',
  READY_TO_TEST: 'Ready to test',
  STRONG_EVIDENCE: 'Strong evidence',
};

export class NotFoundError extends Error {}

export class ReadinessService {
  constructor(
    private readonly repo: ReadinessRepository,
    private readonly trajectoryProvider: TrajectoryProvider,
    private readonly opportunityProvider: OpportunityProvider,
    private readonly catalogProvider: ValidationCatalogProvider,
    private readonly explanationProvider: ExplanationProvider = new DeterministicExplanationProvider()
  ) {}

  async listTargetRoles(tenantId: string, studentId: string) {
    return this.trajectoryProvider.getTargetRoles(tenantId, studentId);
  }

  /** Core computation, reused by both the role-readiness and opportunity-readiness endpoints. */
  private async computeForRequirementSet(
    tenantId: string,
    studentId: string,
    requirementSet: RequirementSet,
    extraEvidence: EvidenceItem[] = []
  ): Promise<ReadinessDTO> {
    const capabilityIds = requirementSet.requirements.map((r) => r.capabilityId);
    const [ownEvidence, freshnessWindows] = await Promise.all([
      this.repo.getEvidenceForCapabilities(tenantId, studentId, capabilityIds),
      this.repo.getCapabilityFreshnessWindows(capabilityIds),
    ]);

    const allEvidence = [...ownEvidence, ...extraEvidence];

    const evidenceByCapability = new Map<string, CapabilityEvidenceResult>();
    for (const req of requirementSet.requirements) {
      const window = freshnessWindows.get(req.capabilityId) ?? DEFAULT_FRESHNESS_WINDOW_DAYS;
      evidenceByCapability.set(req.capabilityId, aggregateCapabilityEvidence(req.capabilityId, allEvidence, window));
    }

    const readiness = computeReadiness(requirementSet.requirements, evidenceByCapability);
    const catalog = await this.catalogProvider.getCatalogForRole(tenantId, requirementSet.id, requirementSet.requirements);
    const nextProof = recommendNextProof(readiness.gaps, catalog);

    const recentLowValueActivityCount = allEvidence.filter(
      (e) => e.sourceType === 'TRAINING' || e.sourceType === 'CERTIFICATE'
    ).length;
    const overPreparationNote = detectOverPreparation(readiness.state, recentLowValueActivityCount);
    const underPreparationNote = detectUnderPreparation(readiness.gaps);

    const claimComparisons = requirementSet.requirements
      .map((req) => {
        const selfReport = allEvidence.find((e) => e.capabilityId === req.capabilityId && e.sourceType === 'SELF_REPORT');
        const evidence = evidenceByCapability.get(req.capabilityId);
        if (!selfReport || !evidence) return null;
        return {
          capabilityId: req.capabilityId,
          capabilityName: req.capabilityName,
          comparison: compareClaimToEvidence(selfReport.claimedLevel ?? null, evidence.label),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.comparison.status !== 'NO_CLAIM');

    // Purely cosmetic rephrasing, never a change in meaning — see explanationProvider.ts.
    // Defaults to a no-op passthrough, and falls back to it automatically on any failure.
    const reasons = await this.explanationProvider.explain(readiness.reasons, { roleName: requirementSet.name, state: readiness.state });

    return {
      ...readiness,
      reasons,
      roleId: requirementSet.id,
      roleName: requirementSet.name,
      nextProof,
      overPreparationNote,
      underPreparationNote,
      claimComparisons,
      computedAt: new Date().toISOString(),
    };
  }

  async getRoleReadiness(tenantId: string, studentId: string, roleId: string): Promise<ReadinessDTO> {
    const role = await this.repo.getRole(tenantId, roleId);
    if (!role) throw new NotFoundError(`Role ${roleId} was not found for this tenant.`);

    const dto = await this.computeForRequirementSet(tenantId, studentId, role);
    await this.persistSnapshotIfChanged(tenantId, studentId, roleId, dto);
    return dto;
  }

  /**
   * Raw, per-item evidence for a single capability — the detail a student
   * sees after clicking into a capability on the map (brief, section 34).
   * Deliberately NOT included in the main readiness payload: it's a
   * secondary drill-down, fetched only when actually opened, so the primary
   * dashboard load stays small regardless of how much evidence history a
   * student accumulates over time.
   */
  async getCapabilityEvidence(tenantId: string, studentId: string, capabilityId: string): Promise<EvidenceItem[]> {
    const items = await this.repo.getEvidenceForCapabilities(tenantId, studentId, [capabilityId]);
    return items.slice().sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)); // most recent first
  }

  async getOpportunityReadiness(tenantId: string, studentId: string, opportunityId: string): Promise<ReadinessDTO> {
    const opportunity = await this.opportunityProvider.getOpportunityRequirements(tenantId, opportunityId);
    if (!opportunity) throw new NotFoundError(`Opportunity ${opportunityId} was not found for this tenant.`);

    return this.computeForRequirementSet(tenantId, studentId, { id: opportunityId, name: opportunity.title, requirements: opportunity.requirements });
  }

  async getReadinessJourney(tenantId: string, studentId: string, roleId: string, limit = 20) {
    const history = await this.repo.getSnapshotHistory(tenantId, studentId, roleId, limit);
    return history
      .slice()
      .reverse() // oldest first, for a left-to-right timeline
      .map((snap) => ({
        state: snap.state,
        stateLabel: READABLE_STATE[snap.state] ?? snap.state,
        confidence: snap.confidence as ConfidenceLevel,
        reasonSummary: snap.reasonSummary,
        occurredAt: snap.createdAt.toISOString(),
      }));
  }

  /**
   * Persists a new snapshot (and audit log entry) only when the readiness
   * state actually changed since the last snapshot — this is what keeps
   * the readiness journey meaningful instead of one entry per page view,
   * and matches the "recalculate only affected structures" performance
   * requirement from the brief.
   */
  private async persistSnapshotIfChanged(tenantId: string, studentId: string, roleId: string, dto: ReadinessDTO): Promise<void> {
    const latest = await this.repo.getLatestSnapshot(tenantId, studentId, roleId);
    if (latest && latest.state === dto.state) return;

    const reasonSummary = dto.reasons[0] ?? 'Readiness recalculated.';
    await this.repo.saveSnapshot({
      tenantId,
      studentId,
      roleId,
      state: dto.state,
      confidence: dto.confidence,
      topGapCapabilityId: dto.topGap?.capabilityId ?? null,
      reasonSummary,
    });
    await this.repo.insertAuditLog({
      tenantId,
      studentId,
      roleId,
      fromState: latest?.state ?? null,
      toState: dto.state,
      reason: reasonSummary,
      triggeredBy: 'recalculation',
    });
  }
}
