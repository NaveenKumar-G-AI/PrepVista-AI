import { ReadinessRepository } from '../repositories/readinessRepository';
import { CapabilityRequirement, EvidenceItem, NextProofRecommendation, ReadinessGap, ValidationCatalogEntry } from '../types/domain';
import { NextActionSink, OpportunityProvider, OutcomeAnalysisProvider, TrajectoryProvider, ValidationCatalogProvider } from './types';

/**
 * Local fallback for Feature 34 (career trajectory): reads from Feature 37's
 * own `student_role_targets` table. Once Feature 34 owns "target role" for
 * real, replace this with an adapter that calls Feature 34's service and
 * stop writing to `student_role_targets` on the write path.
 */
export class LocalTrajectoryProvider implements TrajectoryProvider {
  constructor(private readonly repo: Pick<ReadinessRepository, 'getStudentTargetRoles'>) {}

  async getTargetRoles(tenantId: string, studentId: string) {
    const rows = await this.repo.getStudentTargetRoles(tenantId, studentId);
    return rows.map((r) => ({ roleId: r.roleId, roleName: r.roleName, isPrimary: r.isPrimary }));
  }
}

/**
 * Local fallback for Feature 33 (opportunity intelligence): reads from
 * Feature 37's own `opportunities` / `opportunity_capability_requirements`
 * tables. Once Feature 33 owns opportunities for real, replace this with an
 * adapter that asks Feature 33 for the requirement set behind an
 * opportunity id instead of storing a parallel copy here.
 */
export class LocalOpportunityProvider implements OpportunityProvider {
  constructor(private readonly repo: Pick<ReadinessRepository, 'getOpportunity'>) {}

  async getOpportunityRequirements(tenantId: string, opportunityId: string) {
    const opp = await this.repo.getOpportunity(tenantId, opportunityId);
    if (!opp) return null;
    return { title: opp.name, requirements: opp.requirements };
  }

  async getRecommendedOpportunityIds(_tenantId: string, _studentId: string, _roleId: string): Promise<string[]> {
    // Feature 33 owns "which opportunities should this student look at" — until it's wired in,
    // there is no honest way to recommend specific opportunities, so this returns none rather
    // than guessing.
    return [];
  }
}

/**
 * Feature 35 isn't wired up. Rather than silently returning made-up outcome
 * evidence, this returns an empty list — the readiness engine already
 * treats "no evidence" honestly (UNKNOWN / insufficient evidence), so this
 * is a safe, truthful default. Replace with a real client that calls
 * Feature 35's outcome-analysis service.
 */
export class NoopOutcomeAnalysisProvider implements OutcomeAnalysisProvider {
  async getOutcomeEvidence(_tenantId: string, _studentId: string): Promise<EvidenceItem[]> {
    return [];
  }
}

/**
 * Feature 36 isn't wired up. This logs instead of silently dropping the
 * signal, so the gap is at least visible in server logs during
 * integration/testing. Replace with a real publish to Feature 36's
 * next-best-action queue/service.
 */
export class LoggingNextActionSink implements NextActionSink {
  async notifyReadinessGap(
    tenantId: string,
    studentId: string,
    roleId: string,
    gap: ReadinessGap,
    recommendation: NextProofRecommendation | null
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.info(
      `[feature-37] readiness gap tenant=${tenantId} student=${studentId} role=${roleId}: ${gap.capabilityName} ` +
        `(needs ${gap.requiredLevel}, currently ${gap.currentLabel})` +
        (recommendation ? ` -> recommended: ${recommendation.headline}` : '')
    );
  }
}

/**
 * A small starter catalog of validation activities, keyed by capability
 * NAME (case-insensitive) since real capability ids are database-generated
 * and not known ahead of time. This exists so the "next best proof" screen
 * has something concrete to point at out of the box — it is explicitly a
 * starting point, not a source of truth. A real deployment should replace
 * this with a provider backed by ACEAPT's actual simulation/assessment
 * catalog, matched on capability id.
 */
const STARTER_CATALOG_BY_NAME: Record<string, Omit<ValidationCatalogEntry, 'capabilityId'>> = {
  testing: {
    validationType: 'SIMULATION',
    title: 'Backend testing simulation',
    description: 'Write and defend a test suite for a small service under time pressure, then walk through your coverage decisions.',
    ctaLabel: 'Prove this capability',
  },
  'system design': {
    validationType: 'SIMULATION',
    title: 'System-design walkthrough simulation',
    description: 'Design and explain a production-style system for a realistic scenario, including trade-offs.',
    ctaLabel: 'Prove this capability',
  },
  'rest apis': {
    validationType: 'PROJECT',
    title: 'API design & implementation project',
    description: 'Design and implement a small production-style REST API, including validation and error handling.',
    ctaLabel: 'Prove this capability',
  },
  sql: {
    validationType: 'CODING_TEST',
    title: 'Applied SQL challenge',
    description: 'Solve realistic query and schema-design problems against a live database, not just multiple choice.',
    ctaLabel: 'Prove this capability',
  },
};

export class StaticValidationCatalogProvider implements ValidationCatalogProvider {
  async getCatalogForRole(_tenantId: string, _roleId: string, requirements: CapabilityRequirement[]): Promise<ValidationCatalogEntry[]> {
    const entries: ValidationCatalogEntry[] = [];
    for (const req of requirements) {
      const starter = STARTER_CATALOG_BY_NAME[req.capabilityName.trim().toLowerCase()];
      if (starter) {
        entries.push({ capabilityId: req.capabilityId, ...starter });
      }
    }
    return entries;
  }
}
