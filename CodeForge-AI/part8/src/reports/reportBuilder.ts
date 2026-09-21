import { EvaluationDimension, InterviewType, ReadinessLabel, InterviewEventRecord } from '../types/domain';
import { StructuredEvaluation, ReadinessContribution, DimensionResult } from '../evaluation/evaluationEngine';

export interface KeyEvidenceItem {
  label: string;
  detail: string;
  sourceEventId?: string;
}

export interface InterviewReportData {
  interviewId: string;
  targetRole: string;
  interviewType: InterviewType;
  interviewDate: string;
  overallReadiness: ReadinessLabel;
  evidenceConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  dimensionResults: DimensionResult[];
  strengths: string[];
  criticalGaps: string[];
  keyEvidence: KeyEvidenceItem[];
  whatToImprove: string[];
  nextRecommendedAction: string;
  roadmapImpact: string;
  nextInterviewRecommendation: string;
}

/** A curated subset of interview_events relevant to the report — not the
 *  full log. Only events actually passed here can ever appear in
 *  keyEvidence; nothing is invented (PHASE 54). */
export type CuratedEvent = Pick<InterviewEventRecord, 'id' | 'eventType' | 'payload' | 'createdAt'>;

export interface BuildReportParams {
  interviewId: string;
  targetRole: string;
  interviewType: InterviewType;
  completedAt: string;
  evaluation: StructuredEvaluation;
  readiness: ReadinessContribution;
  keyEvents: CuratedEvent[];
}

const EVENT_EVIDENCE_LABELS: Record<string, string> = {
  TEST_FAILED: 'Test failure',
  TEST_PASSED: 'Tests passed',
  DEBUGGING_STARTED: 'Debugging',
  HINT_REQUESTED: 'Hint used',
  FOLLOWUP_ASKED: 'Follow-up question',
  FOLLOWUP_ANSWERED: "Candidate's answer",
  STUDENT_TESTED_EDGE_CASE: 'Edge case tested',
  STUDENT_ADAPTED_TO_CONSTRAINT: 'Adapted to a changed constraint',
  PROBLEM_RESTATED: 'Problem restatement',
};

/**
 * PHASE 54: "Persist the underlying facts. Then generate human-readable
 * feedback from those facts" — never store just an AI paragraph. This
 * function IS that generation step, and it's fully deterministic: every
 * string it returns traces back to a dimensionResult.evidenceSummary or a
 * provided event — nothing here is invented.
 */
export function buildInterviewReport(params: BuildReportParams): InterviewReportData {
  const weakOrDeveloping = params.evaluation.dimensionResults.filter(
    d => d.rating === 'WEAK' || d.rating === 'DEVELOPING',
  );

  return {
    interviewId: params.interviewId,
    targetRole: params.targetRole,
    interviewType: params.interviewType,
    interviewDate: params.completedAt,
    overallReadiness: params.readiness.readinessLabel,
    evidenceConfidence: params.readiness.confidence,
    dimensionResults: params.evaluation.dimensionResults,
    strengths: params.evaluation.strengths,
    criticalGaps: params.evaluation.criticalGaps,
    keyEvidence: buildKeyEvidence(params.keyEvents),
    whatToImprove: weakOrDeveloping.map(phraseImprovement),
    nextRecommendedAction: buildNextRecommendedAction(params.readiness, weakOrDeveloping),
    roadmapImpact: buildRoadmapImpact(weakOrDeveloping),
    nextInterviewRecommendation: buildNextInterviewRecommendation(params.readiness, weakOrDeveloping),
  };
}

function buildKeyEvidence(events: CuratedEvent[]): KeyEvidenceItem[] {
  return events
    .filter(e => e.eventType in EVENT_EVIDENCE_LABELS)
    .map(e => ({
      label: EVENT_EVIDENCE_LABELS[e.eventType],
      detail: summarizeEventPayload(e.eventType, e.payload),
      sourceEventId: e.id,
    }));
}

function summarizeEventPayload(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'TEST_FAILED':
    case 'TEST_PASSED': {
      const results = payload.testResults;
      return Array.isArray(results) ? `${results.length} test case(s) evaluated` : 'Test results recorded';
    }
    case 'HINT_REQUESTED':
      return `Hint level: ${String(payload.level ?? 'unspecified')}`;
    case 'FOLLOWUP_ASKED':
      return String(payload.question ?? '');
    case 'FOLLOWUP_ANSWERED':
      return String(payload.answer ?? '');
    default:
      return '';
  }
}

/** Rephrases a dimension's own evidence summary into an actionable line —
 *  PHASE 29: "Never produce generic feedback." This never invents a new
 *  claim; it only reuses the evidence already collected in evaluationEngine. */
function phraseImprovement(d: DimensionResult): string {
  return `${capitalize(d.dimension.replace(/_/g, ' ').toLowerCase())}: ${d.evidenceSummary}`;
}

/** TIME_COMPLEXITY and SPACE_COMPLEXITY collapse to "complexity" for the
 *  high-level recommendation lines (not for whatToImprove, which stays
 *  precise) — mirrors how PHASE 64's own example talks about "complexity
 *  reasoning" as one gap, not two. */
function friendlyDimensionLabel(dimension: EvaluationDimension): string {
  if (dimension === 'TIME_COMPLEXITY' || dimension === 'SPACE_COMPLEXITY') return 'complexity';
  return dimension.replace(/_/g, ' ').toLowerCase();
}

function buildNextRecommendedAction(readiness: ReadinessContribution, gaps: DimensionResult[]): string {
  if (readiness.readinessLabel === 'READY') {
    return 'Continue with role-based mock interviews at increasing difficulty to maintain readiness.';
  }
  if (gaps.length === 0) {
    return 'Attempt another technical interview to gather more evidence before a readiness call.';
  }
  return `${capitalize(friendlyDimensionLabel(gaps[0].dimension))}-focused technical interview practice.`;
}

function buildRoadmapImpact(gaps: DimensionResult[]): string {
  if (gaps.length === 0) {
    return 'No new gaps identified — this interview reinforces existing mastery evidence.';
  }
  const list = [...new Set(gaps.map(g => friendlyDimensionLabel(g.dimension)))].join(', ');
  return `This interview's evidence will be submitted to the roadmap engine to prioritize practice on: ${list}.`;
}

function buildNextInterviewRecommendation(readiness: ReadinessContribution, gaps: DimensionResult[]): string {
  if (readiness.readinessLabel === 'READY') {
    return 'A FINAL_READINESS_INTERVIEW to confirm consistency before real interviews.';
  }
  if (gaps.length > 0) {
    return `A WEAKNESS_FOCUSED_INTERVIEW targeting ${friendlyDimensionLabel(gaps[0].dimension)}.`;
  }
  return 'Another GUIDED_TECHNICAL_INTERVIEW to build up evidence coverage.';
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
