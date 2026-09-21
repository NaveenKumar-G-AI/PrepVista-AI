/**
 * Evidence Engine.
 *
 * Turns a flat list of EvidenceItem rows into the full UnderstandingProfile:
 * per-dimension profiles, the procedural/conceptual split, and overall
 * confidence/evidence-strength. Pure functions over arrays — the DB is a
 * detail the API controllers own (see api/controllers.ts); this module
 * never touches persistence, which is what makes it trivially unit
 * testable.
 */
import {
  CONCEPTUAL_WEIGHTED_DIMENSIONS,
  PROCEDURAL_WEIGHTED_DIMENSIONS,
  UNDERSTANDING_DIMENSIONS,
  type DimensionProfile,
  type EvidenceItem,
  type EvidenceStrengthLabel,
  type ExecutionEvidence,
  type RoleContext,
  type UnderstandingDimension,
  type UnderstandingProfile,
} from "@/types/index.js";
import { buildDimensionProfile, mean, weightedMean } from "./scoringEngine.js";
import { classifyUnderstanding } from "./resultClassification.js";

function groupByDimension(items: EvidenceItem[]): Record<UnderstandingDimension, EvidenceItem[]> {
  const grouped = Object.fromEntries(UNDERSTANDING_DIMENSIONS.map((d) => [d, [] as EvidenceItem[]])) as Record<
    UnderstandingDimension,
    EvidenceItem[]
  >;
  for (const item of items) {
    grouped[item.dimension].push(item);
  }
  return grouped;
}

function computeProceduralScore(dimensions: Record<UnderstandingDimension, DimensionProfile>, execution: ExecutionEvidence): number {
  const dimScores = PROCEDURAL_WEIGHTED_DIMENSIONS.map((d) => dimensions[d].score);
  const dimMean = mean(dimScores);
  if (execution.total_tests > 0) {
    const passRate = (execution.passed_tests / execution.total_tests) * 100;
    // Execution is deterministic ground truth and dominates; dimension
    // evidence (does the student also *describe* the solution accurately)
    // fills in the rest.
    return Math.round(passRate * 0.6 + dimMean * 0.4);
  }
  return Math.round(dimMean);
}

function computeConceptualScore(
  dimensions: Record<UnderstandingDimension, DimensionProfile>,
  emphasis?: Partial<Record<UnderstandingDimension, number>>
): number {
  const scores = CONCEPTUAL_WEIGHTED_DIMENSIONS.map((d) => dimensions[d].score);
  const weights = CONCEPTUAL_WEIGHTED_DIMENSIONS.map((d) => emphasis?.[d] ?? 1);
  return Math.round(weightedMean(scores, weights));
}

function computeOverallConfidence(dimensions: Record<UnderstandingDimension, DimensionProfile>): number {
  const assessed = Object.values(dimensions).filter((d) => d.status !== "not_assessed");
  if (assessed.length === 0) return 0;
  return Math.round(mean(assessed.map((d) => d.confidence)));
}

function computeOverallEvidenceStrength(dimensions: Record<UnderstandingDimension, DimensionProfile>): EvidenceStrengthLabel {
  const assessed = Object.values(dimensions).filter((d) => d.status !== "not_assessed");
  if (assessed.length === 0) return "weak";
  const strongCount = assessed.filter((d) => d.evidence_strength === "strong").length;
  const weakCount = assessed.filter((d) => d.evidence_strength === "weak").length;
  if (strongCount >= assessed.length / 2) return "strong";
  if (weakCount > assessed.length / 2) return "weak";
  return "moderate";
}

/** Default per-role emphasis, used only when the caller doesn't supply explicit weights.
 *  This CONSUMES role context passed in from CodeForge's existing role system — it does not
 *  introduce a new role-selection UI or store of its own. */
const DEFAULT_ROLE_EMPHASIS: Record<string, Partial<Record<UnderstandingDimension, number>>> = {
  backend: { state: 1.4, correctness: 1.3, edge_case: 1.3, debugging: 1.2 },
  ml: { complexity: 1.3, space: 1.2, edge_case: 1.3, correctness: 1.2 },
  frontend: { state: 1.3, control_flow: 1.2, edge_case: 1.2 },
};

function resolveEmphasis(role?: RoleContext): Partial<Record<UnderstandingDimension, number>> | undefined {
  if (!role) return undefined;
  return role.dimensionEmphasis ?? DEFAULT_ROLE_EMPHASIS[role.role];
}

export interface BuildProfileParams {
  assessmentId: string;
  studentId: string;
  challengeId: string;
  status: UnderstandingProfile["status"];
  evidence: EvidenceItem[];
  execution: ExecutionEvidence;
  role?: RoleContext;
  probesAsked: number;
  maxProbes: number;
  createdAt: string;
}

export function buildUnderstandingProfile(params: BuildProfileParams): UnderstandingProfile {
  const grouped = groupByDimension(params.evidence);
  const dimensions = Object.fromEntries(
    UNDERSTANDING_DIMENSIONS.map((d) => [d, buildDimensionProfile(d, grouped[d])])
  ) as Record<UnderstandingDimension, DimensionProfile>;

  const emphasis = resolveEmphasis(params.role);
  const procedural_score = computeProceduralScore(dimensions, params.execution);
  const conceptual_score = computeConceptualScore(dimensions, emphasis);
  const overall_confidence = computeOverallConfidence(dimensions);
  const overall_evidence_strength = computeOverallEvidenceStrength(dimensions);

  const profileWithoutClassification = {
    assessment_id: params.assessmentId,
    student_id: params.studentId,
    challenge_id: params.challengeId,
    status: params.status,
    dimensions,
    procedural_score,
    conceptual_score,
    overall_confidence,
    overall_evidence_strength,
    probes_asked: params.probesAsked,
    max_probes: params.maxProbes,
    created_at: params.createdAt,
    updated_at: new Date().toISOString(),
  };

  const classification = classifyUnderstanding(profileWithoutClassification);

  return { ...profileWithoutClassification, classification };
}
