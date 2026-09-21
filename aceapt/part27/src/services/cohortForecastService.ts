/**
 * Aggregates already-computed per-student readiness into a cohort view for
 * TPOs (spec section 51-52). Deliberately reuses the same per-student
 * pipeline rather than a separate cohort-scoring model — a cohort is just
 * "many students," not a different kind of intelligence. `studentIds` is
 * expected to come from your real institution/cohort membership system;
 * there's no membership model here (out of scope for Feature 27 itself).
 */
import type { ReadinessState, RiskFactorType } from "../domain/types.js";
import { RISK_TYPE_LABELS } from "../domain/constants.js";
import type { ForecastPipelineDeps } from "./forecastOrchestrator.js";
import { runForecastPipeline } from "./forecastOrchestrator.js";

export interface CohortReadinessBucket {
  status: ReadinessState;
  count: number;
  percentage: number;
}

export interface CohortTopRisk {
  type: RiskFactorType;
  label: string;
  studentCount: number;
  percentage: number;
}

export interface CohortForecastResult {
  cohortId: string;
  studentCount: number;
  readinessBuckets: CohortReadinessBucket[];
  topRisks: CohortTopRisk[];
}

const BUCKET_ORDER: ReadinessState[] = [
  "TARGET_REACHED",
  "ON_TRACK",
  "IMPROVING",
  "STABLE",
  "AT_RISK",
  "DEVELOPING",
  "NOT_ENOUGH_EVIDENCE",
];

export async function getCohortForecast(
  cohortId: string,
  studentIds: string[],
  deps: ForecastPipelineDeps,
): Promise<CohortForecastResult> {
  const results = await Promise.all(
    studentIds.map(async (studentId) => {
      try {
        return await runForecastPipeline(studentId, deps);
      } catch {
        return null; // missing/broken student data should never break the whole cohort view
      }
    }),
  );
  const valid = results.filter((r): r is NonNullable<typeof r> => r != null);
  const total = valid.length || 1;

  const bucketCounts = new Map<ReadinessState, number>();
  const riskCounts = new Map<RiskFactorType, Set<string>>();

  for (const r of valid) {
    bucketCounts.set(r.status, (bucketCounts.get(r.status) ?? 0) + 1);
    for (const risk of r.risks.slice(0, 1)) {
      // count each student once per risk *type*, even if it appears at
      // multiple severities across re-runs
      const set = riskCounts.get(risk.type) ?? new Set<string>();
      set.add(r.studentId);
      riskCounts.set(risk.type, set);
    }
  }

  const readinessBuckets: CohortReadinessBucket[] = BUCKET_ORDER.map((status) => ({
    status,
    count: bucketCounts.get(status) ?? 0,
    percentage: Math.round(((bucketCounts.get(status) ?? 0) / total) * 100),
  })).filter((b) => b.count > 0);

  const topRisks: CohortTopRisk[] = [...riskCounts.entries()]
    .map(([type, students]) => ({
      type,
      label: RISK_TYPE_LABELS[type],
      studentCount: students.size,
      percentage: Math.round((students.size / total) * 100),
    }))
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 5);

  return { cohortId, studentCount: valid.length, readinessBuckets, topRisks };
}
