/**
 * DecisionPolicyService (§30-34, §120-126, §134). Reads the real assessment
 * scoring policy through the ScoringPolicyProvider port and snapshots it
 * locally, versioned, so that a decision made under policy v3 is still
 * interpretable correctly even if the assessment's live policy later changes
 * to v4 (§122-123, historical reproducibility).
 */
import type { ScoringPolicyProvider } from '../ports';
import type { DecisionPolicyRepository } from '../repositories/types';
import type { DecisionPolicy, NewDecisionPolicy } from '../types';

function policiesEquivalent(a: DecisionPolicy, b: NewDecisionPolicy): boolean {
  return (
    a.correctReward === b.correctReward &&
    a.wrongPenalty === b.wrongPenalty &&
    a.blankValue === b.blankValue &&
    a.source === b.source &&
    a.strategyAssistance === b.strategyAssistance
  );
}

export class DecisionPolicyService {
  constructor(
    private readonly repo: DecisionPolicyRepository,
    private readonly externalProvider: ScoringPolicyProvider
  ) {}

  /**
   * Returns the policy to use for a decision right now. Prefers the live
   * external source of truth; falls back to the last locally-known snapshot
   * if the external provider can't answer (§121: never fabricate a policy).
   */
  async getActivePolicy(tenantId: string, assessmentVersionId: string): Promise<DecisionPolicy | null> {
    const external = await this.externalProvider.getScoringPolicy(assessmentVersionId);
    const latest = await this.repo.getLatest(tenantId, assessmentVersionId);

    if (!external) return latest; // §121: unknown rules -> no fabrication, just whatever we already snapshotted (may be null)

    if (latest && policiesEquivalent(latest, external)) return latest;

    const nextVersion = (latest?.version ?? 0) + 1;
    return this.repo.upsertVersion({
      ...external,
      tenantId,
      assessmentVersionId,
      version: nextVersion,
      effectiveFrom: new Date().toISOString(),
    });
  }

  /** For reproducing a historical decision under the policy that was active when it happened. */
  async getPolicyAtVersion(tenantId: string, assessmentVersionId: string, version: number): Promise<DecisionPolicy | null> {
    return this.repo.getVersion(tenantId, assessmentVersionId, version);
  }
}
