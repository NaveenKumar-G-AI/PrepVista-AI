import { randomUUID } from "node:crypto";
import type {
  AlignmentStatus,
  ConsistencyDimension,
  ConsistencyState,
  DimensionResult,
  Evidence,
  EvidenceStrength,
  Finding,
  Severity,
  SourceLocation,
} from "../types";
import { ALIGNMENT_BASE_SCORE, DIMENSION_WEIGHTS, MIN_EVIDENCE_COVERAGE_FOR_SCORING, STATE_THRESHOLDS } from "../config/scoring.config";

/**
 * Converts an alignment verdict into a 0-100 score, pulled toward neutral
 * (50) as confidence drops. A MISMATCH found with low confidence shouldn't
 * tank the score as hard as one found with strong, direct evidence — this is
 * where "confidence must decrease when evidence is unavailable or ambiguous"
 * actually reaches the number the student sees.
 */
export function scoreFromAlignment(alignment: AlignmentStatus, confidence: number): number | null {
  if (alignment === "UNKNOWN") return null;
  const base = ALIGNMENT_BASE_SCORE[alignment];
  const neutral = 50;
  const clamped = Math.max(0, Math.min(1, confidence));
  return Math.round(neutral + (base - neutral) * clamped);
}

export function makeFinding(input: {
  dimension: ConsistencyDimension;
  severity: Severity;
  evidenceStrength: EvidenceStrength;
  confidence: number;
  summary: string;
  studentClaim?: string;
  evidence?: Evidence[];
  sourceLocation?: SourceLocation | null;
  metadata?: Record<string, string>;
}): Finding {
  return {
    id: randomUUID(),
    dimension: input.dimension,
    severity: input.severity,
    evidenceStrength: input.evidenceStrength,
    confidence: input.confidence,
    summary: input.summary,
    studentClaim: input.studentClaim,
    evidence: input.evidence ?? [],
    sourceLocation: input.sourceLocation ?? null,
    reconciliationState: "UNRESOLVED",
    metadata: input.metadata,
  };
}

/** Standard "we genuinely don't have enough evidence" result — never guess instead of returning this. */
export function unknownResult(dimension: ConsistencyDimension, reason: string): DimensionResult {
  return {
    dimension,
    alignment: "UNKNOWN",
    score: null,
    confidence: 0.1,
    evidenceStrength: "INSUFFICIENT",
    findings: [
      makeFinding({
        dimension,
        severity: "LOW",
        evidenceStrength: "INSUFFICIENT",
        confidence: 0.1,
        summary: reason,
      }),
    ],
  };
}

export function classifyState(score: number): ConsistencyState {
  for (const t of STATE_THRESHOLDS) {
    if (score >= t.min) return t.state;
  }
  return "SIGNIFICANTLY_INCONSISTENT";
}

export function aggregateScore(dimensionResults: DimensionResult[]): { overallScore: number | null; overallState: ConsistencyState } {
  const scored = dimensionResults.filter((d): d is DimensionResult & { score: number } => d.score !== null);
  const coverage = dimensionResults.length === 0 ? 0 : scored.length / dimensionResults.length;
  if (coverage < MIN_EVIDENCE_COVERAGE_FOR_SCORING) {
    return { overallScore: null, overallState: "INSUFFICIENT_EVIDENCE" };
  }
  const totalWeight = scored.reduce((sum, d) => sum + DIMENSION_WEIGHTS[d.dimension], 0);
  if (totalWeight === 0) {
    return { overallScore: null, overallState: "INSUFFICIENT_EVIDENCE" };
  }
  const weighted = scored.reduce((sum, d) => sum + d.score * DIMENSION_WEIGHTS[d.dimension], 0);
  const overallScore = Math.round((weighted / totalWeight) * 100) / 100;
  return { overallScore, overallState: classifyState(overallScore) };
}

export function bySeverityDesc(a: Finding, b: Finding): number {
  const rank: Record<Severity, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
  return rank[b.severity] - rank[a.severity] || b.confidence - a.confidence;
}
