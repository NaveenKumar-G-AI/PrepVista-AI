import type { PoolClient } from "pg";
import * as repo from "../db/repository.js";

export interface AlignSummary {
  targetId: string;
  fit: number; // 0-100, ALIGN's own fit score -- PATH does not recompute this
  criticalGapCodes: string[];
}

/**
 * Stand-in for ACEAPT's ALIGN feature (Feature 29). ALIGN owns "which
 * target fits the student" (Section 5, 38) -- PATH only consumes its
 * output (the selected target + requirements) and never recomputes fit.
 * This mock derives a plausible fit score from the same requirements data
 * PATH already reads, purely so the reference build has something to show;
 * swap for a real call to ALIGN_SERVICE_URL in production.
 */
export async function getAlignSummary(client: PoolClient, studentId: string, targetId: string): Promise<AlignSummary> {
  const requirements = await repo.getTargetRequirements(client, targetId);
  const states = await repo.getStudentCapabilityStates(client, studentId);
  const byCap = new Map(states.map((s) => [s.capabilityCode, s]));
  const critical = requirements.filter((r) => (byCap.get(r.capabilityCode)?.level ?? 0) < r.requiredLevel * 0.6);
  const avgRatio =
    requirements.reduce((sum, r) => sum + Math.min(1, (byCap.get(r.capabilityCode)?.level ?? 0) / Math.max(1, r.requiredLevel)), 0) /
    Math.max(1, requirements.length);

  return {
    targetId,
    fit: Math.round(avgRatio * 100),
    criticalGapCodes: critical.map((c) => c.capabilityCode),
  };
}
