import type {
  GrowthDimension,
  GrowthEvidence,
  GrowthSnapshot,
  GrowthState,
  TimeWindow,
  ConfidenceLevel,
  RoleGrowthProfile,
} from "../types.ts";
import { GROWTH_ENGINE_VERSION, RULES_VERSION, GrowthConfig } from "../config.ts";
import { buildDimensionGrowth } from "./dimensionGrowth.ts";
import { byDimension, filterByWindow } from "../utils.ts";

const STATE_RANK: Record<GrowthState, number> = {
  NO_EVIDENCE: 0,
  INSUFFICIENT_EVIDENCE: 1,
  AT_RISK: 2,
  REGRESSING: 3,
  STAGNATING: 4,
  EMERGING: 5,
  RECOVERING: 6,
  STABLE: 7,
  IMPROVING: 8,
  STRONG: 9,
  MASTERED: 10,
};

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { INSUFFICIENT: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

/** Overall state is deliberately NOT an average of per-dimension states —
 * averaging state labels produces nonsense ("IMPROVING" + "REGRESSING" is
 * not "STABLE"). Instead: report the most concerning movement state if one
 * exists with real confidence, otherwise the median absolute level. This
 * keeps a single strong regression from being diluted into invisibility by
 * nine unrelated stable dimensions, while a single lucky dimension can't
 * paint over a genuine regression elsewhere either. */
function rollUpOverallState(dimensions: GrowthSnapshot["dimensions"]): GrowthState {
  const withEvidence = dimensions.filter((d) => d.state !== "NO_EVIDENCE" && d.confidence.level !== "INSUFFICIENT");
  if (withEvidence.length === 0) return "NO_EVIDENCE";

  const regressing = withEvidence.filter((d) => d.state === "REGRESSING" || d.state === "AT_RISK");
  if (regressing.length > 0) return regressing.some((d) => d.state === "REGRESSING") ? "REGRESSING" : "AT_RISK";

  const recovering = withEvidence.filter((d) => d.state === "RECOVERING");
  if (recovering.length > 0) return "RECOVERING";

  const improving = withEvidence.filter((d) => d.state === "IMPROVING" || d.state === "STRONG" || d.state === "MASTERED");
  if (improving.length > withEvidence.length / 2) return "IMPROVING";

  const stagnating = withEvidence.filter((d) => d.state === "STAGNATING");
  if (stagnating.length > withEvidence.length / 2) return "STAGNATING";

  // Median by rank as a stable fallback.
  const ranks = withEvidence.map((d) => STATE_RANK[d.state]).sort((a, b) => a - b);
  const median = ranks[Math.floor(ranks.length / 2)]!;
  return (Object.entries(STATE_RANK).find(([, r]) => r === median)?.[0] as GrowthState) ?? "STABLE";
}

function rollUpOverallConfidence(dimensions: GrowthSnapshot["dimensions"]): ConfidenceLevel {
  const withEvidence = dimensions.filter((d) => d.confidence.level !== "INSUFFICIENT");
  if (withEvidence.length === 0) return "INSUFFICIENT";
  const ranks = withEvidence.map((d) => CONFIDENCE_RANK[d.confidence.level]);
  const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  if (avg >= 2.5) return "HIGH";
  if (avg >= 1.5) return "MEDIUM";
  return "LOW";
}

function activityLevel(recentEvidenceCount: number): GrowthSnapshot["activityLevel"] {
  const cfg = GrowthConfig.activityLevel;
  if (recentEvidenceCount <= cfg.lowMax) return "LOW";
  if (recentEvidenceCount <= cfg.moderateMax) return "MODERATE";
  return "HIGH";
}

export interface BuildSnapshotInput {
  snapshotId: string;
  studentId: string;
  allEvidence: GrowthEvidence[]; // every dimension, unfiltered — windowing happens inside
  window: TimeWindow;
  roleProfile: RoleGrowthProfile | null;
  studentModelVersion: string;
  skillModelVersion: string;
  now?: Date;
  previousDimensionStates?: Partial<Record<GrowthDimension, GrowthState>>;
}

export function buildGrowthSnapshot(input: BuildSnapshotInput): GrowthSnapshot {
  const now = input.now ?? new Date();
  const grouped = byDimension(input.allEvidence);

  const dimensionsToEvaluate: GrowthDimension[] =
    input.roleProfile?.primaryDimensions && input.roleProfile.primaryDimensions.length > 0
      ? input.roleProfile.primaryDimensions
      : (Array.from(grouped.keys()) as GrowthDimension[]);

  const dimensions = dimensionsToEvaluate.map((dim) =>
    buildDimensionGrowth(dim, grouped.get(dim) ?? [], input.window, {
      now,
      previousState: input.previousDimensionStates?.[dim] ?? null,
    }),
  );

  const recentCount = filterByWindow(input.allEvidence, { preset: "RECENT_30D", startsAt: new Date(now.getTime() - 30 * 86400000).toISOString(), endsAt: now.toISOString() }).length;

  return {
    snapshotId: input.snapshotId,
    studentId: input.studentId,
    roleContext: input.roleProfile?.roleId ?? null,
    dimensions,
    overallState: rollUpOverallState(dimensions),
    overallConfidence: rollUpOverallConfidence(dimensions),
    activityLevel: activityLevel(recentCount),
    evidenceWindow: input.window,
    generatedAt: now.toISOString(),
    studentModelVersion: input.studentModelVersion,
    skillModelVersion: input.skillModelVersion,
    growthEngineVersion: GROWTH_ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
  };
}
