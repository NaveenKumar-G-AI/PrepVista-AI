import { deriveEvidenceLevel } from "@/lib/domain/capabilityState";
import { detectRootCauses } from "@/lib/domain/rootCauseEngine";
import { newId, nowIso } from "@/lib/db/client";
import type {
  CapabilityState,
  ConfidenceAlignmentFinding,
  ConfidenceSelfRating,
  DiagnosticResult,
  DiagnosticSession,
  Domain,
  DomainResult,
  OnboardingContext,
  SkillNode,
  SkillResult,
  UnexpectedFinding,
} from "@/lib/domain/types";

export const SCORING_VERSION = 1;
export const ALGORITHM_VERSION = 1;

const DOMAINS: Domain[] = ["QUANTITATIVE", "LOGICAL", "VERBAL"];
const STRENGTH_THRESHOLD = 0.75;
const FOCUS_THRESHOLD = 0.6;
const MIN_ATTEMPTS_FOR_CLAIM = 2;

/**
 * Every deterministic calculation the report depends on happens here,
 * BEFORE any AI involvement (spec section 35: "Never ask an LLM to
 * calculate a student's final score when deterministic computation is
 * possible"). The AI layer (lib/ai/interpretFindings.ts) only rephrases
 * the object this function returns — it never computes a number.
 */
export function buildDiagnosticResult(
  session: DiagnosticSession,
  state: CapabilityState,
  onboardingContext: OnboardingContext,
  skills: SkillNode[]
): DiagnosticResult {
  const skillsById = Object.fromEntries(skills.map((s) => [s.id, s]));

  const skillResults: SkillResult[] = skills
    .filter((s) => (state.skills[s.id]?.attempts.length ?? 0) > 0)
    .map((s) => {
      const skillState = state.skills[s.id]!; // filtered above to guarantee presence
      return {
        skillId: s.id,
        skillName: s.displayName,
        domain: s.domain,
        overall: skillState.overall,
        foundation: skillState.foundation,
        application: skillState.application,
        transfer: skillState.transfer,
      };
    });

  const domainResults: DomainResult[] = DOMAINS.map((domain) => computeDomainResult(domain, state, skillsById));

  const strengths = skillResults
    .filter((s) => s.overall.attempts >= MIN_ATTEMPTS_FOR_CLAIM && s.overall.accuracy !== null && s.overall.accuracy >= STRENGTH_THRESHOLD)
    .sort((a, b) => (b.overall.accuracy ?? 0) - (a.overall.accuracy ?? 0))
    .slice(0, 4)
    .map((s) => s.skillId);

  const focusAreas = skillResults
    .filter((s) => s.overall.attempts >= MIN_ATTEMPTS_FOR_CLAIM && s.overall.accuracy !== null && s.overall.accuracy < FOCUS_THRESHOLD)
    .sort((a, b) => (a.overall.accuracy ?? 1) - (b.overall.accuracy ?? 1))
    .slice(0, 4)
    .map((s) => s.skillId);

  const possibleRootCauses = detectRootCauses(state, skills);
  const unexpectedFindings = computeUnexpectedFindings(onboardingContext, domainResults);
  const confidenceAlignment = computeConfidenceAlignment(state, skillsById);

  const answeredAll = Object.values(state.skills).flatMap((s) => s.attempts).filter((a) => a.status === "ANSWERED" && a.correct !== null);
  const accuracyOverall = answeredAll.length > 0 ? answeredAll.filter((a) => a.correct).length / answeredAll.length : null;
  const speedProfileOverall = classifySpeed(answeredAll);

  const overallCapability = computeOverallCapability(domainResults);
  const { skillId: recommendedStartingPointSkillId, reason: recommendedStartingPointReason } = recommendStartingPoint(
    focusAreas,
    possibleRootCauses,
    skillsById
  );

  return {
    id: newId("result"),
    sessionId: session.id,
    studentId: session.studentId,
    diagnosticVersion: session.diagnosticVersion,
    scoringVersion: SCORING_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    overallCapability,
    totalQuestions: state.questionsAttempted,
    domainResults,
    skillResults,
    selfPerceptionByDomain: {
      QUANTITATIVE: onboardingContext.confidenceQuantitative,
      LOGICAL: onboardingContext.confidenceLogical,
      VERBAL: onboardingContext.confidenceVerbal,
    },
    accuracyOverall,
    speedProfileOverall,
    strengths,
    focusAreas,
    possibleRootCauses,
    unexpectedFindings,
    confidenceAlignment,
    recommendedStartingPointSkillId,
    recommendedStartingPointReason,
    aiNarrative: null, // filled in by lib/ai/interpretFindings.ts after this object is built
    aiGenerationStatus: "NOT_ATTEMPTED",
    completedAt: nowIso(),
  };
}

function computeDomainResult(
  domain: Domain,
  state: CapabilityState,
  skillsById: Record<string, SkillNode>
): DomainResult {
  const domainSkillStates = Object.entries(state.skills)
    .filter(([id]) => skillsById[id]?.domain === domain)
    .map(([, s]) => s)
    .filter((s) => s.attempts.length > 0);

  const totalAttempts = domainSkillStates.reduce((sum, s) => sum + s.overall.attempts, 0);
  const answered = domainSkillStates.flatMap((s) => s.attempts).filter((a) => a.status === "ANSWERED" && a.correct !== null);
  const correctCount = answered.filter((a) => a.correct).length;
  const accuracy = answered.length > 0 ? correctCount / answered.length : null;

  const evidenceStrength: DomainResult["evidenceStrength"] =
    totalAttempts >= 7 ? "STRONG" : totalAttempts >= 4 ? "MODERATE" : "LIMITED";

  return {
    domain,
    capabilityLevel: deriveEvidenceLevel(accuracy, totalAttempts),
    accuracy,
    speedProfile: classifySpeed(answered),
    evidenceStrength,
    questionsAttempted: totalAttempts,
  };
}

/**
 * Speed is judged against each question's own designed pace
 * (estimatedTimeSeconds), not against other students — this prototype has
 * no population of other attempts to norm against, and comparing a student
 * to the question's intended pace is a fair, explainable proxy (spec
 * section 43: "do not reduce speed to a single simplistic number if it
 * would be misleading" — INSUFFICIENT_EVIDENCE is a first-class outcome).
 */
function classifySpeed(answered: { responseDurationMs: number; estimatedTimeSeconds: number }[]): DomainResult["speedProfile"] {
  if (answered.length < 2) return "INSUFFICIENT_EVIDENCE";
  const ratios = answered.map((a) => a.responseDurationMs / (a.estimatedTimeSeconds * 1000));
  const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  if (avgRatio <= 0.75) return "FAST";
  if (avgRatio <= 1.3) return "MODERATE";
  return "SLOW";
}

function computeOverallCapability(domainResults: DomainResult[]) {
  const assessed = domainResults.filter((d) => d.accuracy !== null);
  const totalAttempts = domainResults.reduce((s, d) => s + d.questionsAttempted, 0);
  if (assessed.length === 0) return deriveEvidenceLevel(null, 0);
  const avgAccuracy = assessed.reduce((s, d) => s + (d.accuracy ?? 0), 0) / assessed.length;
  return deriveEvidenceLevel(avgAccuracy, totalAttempts);
}

const DOMAIN_LABEL: Record<Domain, string> = {
  QUANTITATIVE: "Quantitative Aptitude",
  LOGICAL: "Logical Reasoning",
  VERBAL: "Verbal Aptitude",
};

/**
 * Self-perception (Feature 1's context) vs. measured evidence (spec
 * sections 41-42). Only fires when domain evidence is at least MODERATE —
 * never claims a surprise off two questions (spec section 31).
 */
function computeUnexpectedFindings(onboarding: OnboardingContext, domainResults: DomainResult[]): UnexpectedFinding[] {
  const selfRatingByDomain: Record<Domain, ConfidenceSelfRating> = {
    QUANTITATIVE: onboarding.confidenceQuantitative,
    LOGICAL: onboarding.confidenceLogical,
    VERBAL: onboarding.confidenceVerbal,
  };
  const findings: UnexpectedFinding[] = [];

  for (const dr of domainResults) {
    if (dr.evidenceStrength === "LIMITED" || dr.accuracy === null) continue;
    const selfRating = selfRatingByDomain[dr.domain];

    if (selfRating === "LOW" && dr.accuracy >= 0.65) {
      findings.push({
        domain: dr.domain,
        kind: "UNDERRATED_STRENGTH",
        narrative: `You rated ${DOMAIN_LABEL[dr.domain]} as an area of concern, but your diagnostic performance there was stronger than expected.`,
      });
    } else if (selfRating === "HIGH" && dr.accuracy < 0.55) {
      findings.push({
        domain: dr.domain,
        kind: "OVERRATED_CONFIDENCE",
        narrative: `You rated ${DOMAIN_LABEL[dr.domain]} as a strength — current evidence suggests there's more room to build here than expected, particularly in applying concepts to less familiar questions.`,
      });
    }
  }
  return findings;
}

/**
 * Only the two diagnostically-interesting confidence×performance patterns
 * are surfaced (spec section 19): correct-but-low-confidence (possible
 * fragile knowledge) and incorrect-but-high-confidence (possible
 * misconception). The two "expected" patterns aren't flagged individually.
 */
function computeConfidenceAlignment(
  state: CapabilityState,
  skillsById: Record<string, SkillNode>
): ConfidenceAlignmentFinding[] {
  const findings: ConfidenceAlignmentFinding[] = [];
  for (const [skillId, skillState] of Object.entries(state.skills)) {
    for (const attempt of skillState.attempts) {
      if (attempt.status !== "ANSWERED" || attempt.correct === null || !attempt.confidence) continue;
      const highConf = attempt.confidence === "CONFIDENT" || attempt.confidence === "VERY_CONFIDENT";
      const lowConf = attempt.confidence === "GUESSING" || attempt.confidence === "NOT_SURE";
      const skillName = skillsById[skillId]?.displayName ?? skillId;

      if (attempt.correct && lowConf) {
        findings.push({
          skillId,
          skillName,
          pattern: "CORRECT_LOW_CONFIDENCE",
          narrative: `Answered correctly on ${skillName} despite low stated confidence — possibly fragile or not-yet-consolidated knowledge.`,
        });
      } else if (!attempt.correct && highConf) {
        findings.push({
          skillId,
          skillName,
          pattern: "INCORRECT_HIGH_CONFIDENCE",
          narrative: `Answered incorrectly on ${skillName} despite high stated confidence — a possible misconception signal, though not yet certain from a single instance.`,
        });
      }
    }
  }
  return findings.slice(0, 6);
}

function recommendStartingPoint(
  focusAreas: string[],
  rootCauses: ReturnType<typeof detectRootCauses>,
  skillsById: Record<string, SkillNode>
): { skillId: string | null; reason: string } {
  if (rootCauses.length > 0 && rootCauses[0]) {
    const rc = rootCauses[0];
    const targetId = rc.relatedSkillId ?? rc.skillId;
    return { skillId: targetId, reason: rc.narrative };
  }
  if (focusAreas.length > 0 && focusAreas[0]) {
    const skillId = focusAreas[0];
    return {
      skillId,
      reason: `${skillsById[skillId]?.displayName ?? skillId} showed the clearest, most consistent gap in today's diagnostic.`,
    };
  }
  return {
    skillId: null,
    reason: "No clear focus area emerged from this diagnostic — broader practice across all three domains is a reasonable next step.",
  };
}
