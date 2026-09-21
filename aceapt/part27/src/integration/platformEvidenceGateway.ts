/**
 * PlatformEvidenceGateway is the ONE interface Feature 27 depends on to read
 * evidence about a student. This is the seam called out throughout the spec
 * ("do not rebuild Features 24-26", "reuse existing models", section 9-10):
 * everything on the other side of this interface should already exist in
 * ACEAPT/PrepVista. When you wire this up for real, implement this interface
 * against your actual mastery system, Feature 24 (Retention), Feature 25
 * (Transfer), attempt tracking, and the assessment engine — the engines and
 * orchestrator in this package don't need to change.
 *
 * InMemoryPlatformEvidenceGateway (same folder) is the only implementation
 * provided here, and it's fixture-backed — for local dev, tests, and the
 * demo script only (spec section 64: fixtures are fine for dev/testing, the
 * real demo output must come from the real pipeline, which it does here —
 * the numbers you see in `npm run seed:demo` are computed by the actual
 * engines over this seeded evidence, not hardcoded).
 */
import type { CapabilityDimensionKey, ReadinessTarget, SeriesPoint } from "../domain/types.js";
import type { DimensionEvidenceInput } from "../engines/capabilityModel.js";
import type { FailureBoundaryStage } from "../engines/practiceAssessmentGapEngine.js";

export interface EvidenceQualitySummary {
  observationCount: number;
  recencyDaysAvg: number;
  topicDiversity: number;
  difficultyDiversity: number;
  noveltyRatio: number;
  hasTransferEvidence: boolean;
  hasAssessmentEvidence: boolean;
  hasTimedEvidence: boolean;
  historicalStability: number;
  breakdown: { assessments: number; adaptiveSessions: number; practiceQuestions: number };
}

export interface PlatformEvidenceGateway {
  /** One entry per dimension currently backed by evidence. Values are
   * already-computed scores (mastery system / Feature 24 / Feature 25 /
   * attempt tracking) — this gateway does not compute them. */
  getCapabilityEvidence(studentId: string): Promise<DimensionEvidenceInput[]>;

  /** Chronological history for one dimension, or 'overall' for the tracked
   * composite series (see capabilityModel.computeOverallReadiness for how
   * 'overall' can also be derived live from dimension histories if your
   * platform doesn't separately track a composite over time). */
  getTrajectoryHistory(studentId: string, dimension: CapabilityDimensionKey | "overall"): Promise<SeriesPoint[]>;

  getTarget(studentId: string): Promise<ReadinessTarget | null>;

  getEvidenceQualitySummary(studentId: string): Promise<EvidenceQualitySummary>;

  getPracticeVsAssessment(studentId: string): Promise<{ practiceScore: number; assessmentScore: number } | null>;

  getFamiliarityVsNovel(studentId: string): Promise<{ familiarScore: number; novelScore: number } | null>;

  getFailureBoundary(studentId: string): Promise<FailureBoundaryStage[] | null>;

  /** Optional student-reported confidence (e.g. a self-rating prompt
   * somewhere in the product). Null if never collected. */
  getStudentSelfReportedConfidence(studentId: string): Promise<number | null>;
}
