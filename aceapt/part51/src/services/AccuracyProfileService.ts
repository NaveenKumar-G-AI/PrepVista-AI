import type { PoolClient } from "pg";
import { withStudentContext } from "../db/pool.js";
import { getAttemptHistory } from "../db/repositories/attemptRepo.js";
import { getBaselineSnapshot, getSnapshotHistory } from "../db/repositories/profileRepo.js";
import { computeAccuracyProfile, type AccuracyProfile } from "../domain/accuracyProfile.js";
import { computeErrorLifecycle, detectErrorClusters, classifyRecurrenceStatus } from "../domain/errorClassification.js";
import { computeStability } from "../domain/stability.js";
import { getInterventionType } from "../policy/interventionMapping.js";
import type { ErrorType, InterventionType, RecurrenceStatus } from "../types/errorTaxonomy.js";
import type { ConfidenceLevel } from "../types/accuracy.js";
import { EVIDENCE_THRESHOLDS } from "../types/accuracy.js";

export interface BottleneckEntry {
  skillId: string;
  errorType: ErrorType;
  interventionType: InterventionType;
  recurrenceStatus: RecurrenceStatus;
  frequency: number;
  recentFrequency: number;
  reason: string;
}

const RECURRENCE_SEVERITY: Record<RecurrenceStatus, number> = {
  regressed: 4,
  clustered: 3,
  recurring: 2,
  isolated: 1,
  resolved: 0
};

export interface AccuracyDashboard {
  overallAccuracy: number | null;
  independentAccuracy: number | null;
  timedAccuracy: number | null;
  sampleSize: number;
  confidence: ConfidenceLevel;
  strongestSkill: { skillId: string; accuracy: number } | null;
  currentFocus: BottleneckEntry | null;
  currentStatus: "improving" | "stable" | "needs_attention" | "insufficient_evidence";
}

export class AccuracyProfileService {
  async getProfile(studentId: string): Promise<AccuracyProfile> {
    return withStudentContext(studentId, async (client) => {
      const attempts = await getAttemptHistory(client, studentId, { limit: 300 });
      return computeAccuracyProfile(attempts);
    });
  }

  /** §61-62 — ranked list of (skill, error type) bottlenecks with real evidence behind each. */
  async getBottlenecks(studentId: string, limit = 5): Promise<BottleneckEntry[]> {
    return withStudentContext(studentId, async (client) => {
      const attempts = await getAttemptHistory(client, studentId, { limit: 300 });
      const bySkill = new Map<string, typeof attempts>();
      for (const a of attempts) {
        if (!bySkill.has(a.skillId)) bySkill.set(a.skillId, []);
        bySkill.get(a.skillId)!.push(a);
      }

      const entries: BottleneckEntry[] = [];
      for (const [skillId, skillAttempts] of bySkill) {
        const cluster = detectErrorClusters(skillId, skillAttempts);
        const errorTypesPresent = new Set(
          skillAttempts.filter((a) => !a.isCorrect && a.errorType).map((a) => a.errorType as ErrorType)
        );
        for (const errorType of errorTypesPresent) {
          const lifecycle = computeErrorLifecycle(skillAttempts, errorType);
          const isPartOfCluster = Boolean(cluster?.memberErrorTypes.includes(errorType));
          const status = classifyRecurrenceStatus(lifecycle, isPartOfCluster);
          if (status === "resolved") continue; // resolved issues aren't bottlenecks
          entries.push({
            skillId,
            errorType,
            interventionType: getInterventionType(errorType),
            recurrenceStatus: status,
            frequency: lifecycle.frequency,
            recentFrequency: lifecycle.recentFrequency,
            reason: describeReason(status, errorType, lifecycle.frequency, cluster?.clusterId)
          });
        }
      }

      entries.sort(
        (a, b) =>
          RECURRENCE_SEVERITY[b.recurrenceStatus] - RECURRENCE_SEVERITY[a.recurrenceStatus] ||
          b.recentFrequency - a.recentFrequency ||
          b.frequency - a.frequency
      );
      return entries.slice(0, limit);
    });
  }

  async getDashboard(studentId: string): Promise<AccuracyDashboard> {
    const [profile, bottlenecks] = await Promise.all([
      this.getProfile(studentId),
      this.getBottlenecks(studentId, 1)
    ]);

    const strongest = [...profile.bySkill]
      .filter((r) => r.accuracy != null)
      .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];

    const currentFocus = bottlenecks[0] ?? null;
    const currentStatus = await this.deriveStatus(studentId, profile, currentFocus);

    return {
      overallAccuracy: profile.overall.accuracy,
      independentAccuracy: profile.overall.independentAccuracy,
      timedAccuracy: profile.overall.timedAccuracy,
      sampleSize: profile.overall.sampleSize,
      confidence: profile.overall.confidence,
      strongestSkill: strongest?.accuracy != null ? { skillId: strongest.scopeId!, accuracy: strongest.accuracy } : null,
      currentFocus,
      currentStatus
    };
  }

  private async deriveStatus(
    studentId: string,
    profile: AccuracyProfile,
    currentFocus: BottleneckEntry | null
  ): Promise<AccuracyDashboard["currentStatus"]> {
    if (profile.overall.confidence === "insufficient") return "insufficient_evidence";
    if (currentFocus?.recurrenceStatus === "regressed") return "needs_attention";

    return withStudentContext(studentId, async (client: PoolClient) => {
      const history = await getSnapshotHistory(client, studentId, "overall", null, 20);
      const points = history.filter((h) => h.accuracy != null).map((h) => Number(h.accuracy));
      if (points.length < EVIDENCE_THRESHOLDS.minSampleForAnyClaim) return "stable";

      const stability = computeStability(points);
      const baseline = await getBaselineSnapshot(client, studentId, "overall", null);
      if (baseline?.accuracy != null && profile.overall.accuracy != null) {
        if (profile.overall.accuracy - Number(baseline.accuracy) >= 5) return "improving";
        if (Number(baseline.accuracy) - profile.overall.accuracy >= 5) return "needs_attention";
      }
      return stability.consistency === "highly_variable" ? "needs_attention" : "stable";
    });
  }
}

function describeReason(
  status: RecurrenceStatus,
  errorType: ErrorType,
  frequency: number,
  clusterId?: string
): string {
  const humanType = errorType.replace(/_/g, " ").toLowerCase();
  if (status === "regressed") return `A ${humanType} pattern that had been resolved has reappeared.`;
  if (status === "clustered") return `Several related error types are recurring together (${clusterId ?? "cluster"}), including ${humanType}.`;
  if (status === "recurring") return `${humanType[0]!.toUpperCase()}${humanType.slice(1)} has occurred ${frequency} times recently.`;
  return `${humanType[0]!.toUpperCase()}${humanType.slice(1)} has occurred once so far.`;
}
