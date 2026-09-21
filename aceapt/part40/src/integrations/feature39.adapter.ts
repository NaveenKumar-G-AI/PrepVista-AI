import { PoolClient } from 'pg';
import * as standins from '../db/standins';

/**
 * Feature 39 provides opportunity / opportunity-intelligence data (spec ??54).
 * Feature 40 uses it to identify emerging role requirements and positioning
 * patterns -- it never stores or ranks opportunities itself (that stays owned
 * by Features 33/39).
 */

export interface OpportunityRequirement {
  skillSlug: string;
  frequency: number;
  sampleSize: number;
}

export async function getOpportunityRequirementsForRole(
  client: PoolClient,
  roleId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<OpportunityRequirement[]> {
  return standins.getOpportunityRequirementFrequencies(client, roleId, periodStart, periodEnd);
}

/**
 * Feature 35 provides outcome history (spec ??56). Feature 40 may only ever
 * describe an "observed pattern" from this data, never claim causation
 * ("This caused your success.") -- see src/services/careerPaths.service.ts
 * for the one place this gets surfaced, phrased deliberately as a pattern.
 */
export interface OutcomeSignal {
  roleId: string;
  responseCount: number;
  totalApplications: number;
}

export async function getOutcomeSignals(client: PoolClient, studentId: string): Promise<OutcomeSignal[]> {
  const outcomes = await standins.getApplicationOutcomes(client, studentId);
  const byRole = new Map<string, { response: number; total: number }>();
  for (const o of outcomes) {
    const entry = byRole.get(o.roleId) ?? { response: 0, total: 0 };
    entry.total += 1;
    if (o.outcome && o.outcome !== 'REJECTED') entry.response += 1;
    byRole.set(o.roleId, entry);
  }
  return Array.from(byRole.entries()).map(([roleId, v]) => ({
    roleId,
    responseCount: v.response,
    totalApplications: v.total,
  }));
}
