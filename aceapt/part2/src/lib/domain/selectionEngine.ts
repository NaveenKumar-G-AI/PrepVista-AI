import type {
  ApplicationType,
  CapabilityState,
  Domain,
  Question,
  QuestionPurpose,
  SkillEvidenceState,
  SkillNode,
} from "@/lib/domain/types";

export const MIN_QUESTIONS = 14;
export const MAX_QUESTIONS = 28;
const REQUIRED_DOMAINS: Domain[] = ["QUANTITATIVE", "LOGICAL", "VERBAL"];
const MIN_SKILLS_PER_DOMAIN = 2;

export interface SelectedQuestion {
  question: Question;
  purpose: QuestionPurpose;
  rationale: string;
  captureConfidence: boolean;
}

/**
 * Picks the single best next question given everything known so far.
 *
 * Deterministic and explainable by design (spec section 14: "the selection
 * algorithm must be explainable internally... deterministic scoring/ranking
 * is acceptable and preferred over an unnecessarily complex black-box
 * model"). No randomness — ties break on question id so behavior is
 * reproducible given identical input state.
 *
 * Priority order (highest score wins):
 *   1. PREREQUISITE_CHECK — a skill showed weak application-level evidence
 *      and its prerequisite has never been probed (root-cause trigger).
 *   2. VERIFICATION — the last response in a skill was incorrect and hasn't
 *      been re-checked yet (spec section 17: one wrong answer must not
 *      immediately produce "student is weak").
 *   3. BASELINE / COVERAGE — a skill (and, within that, an under-covered
 *      domain) hasn't been touched yet this session.
 *   4. DIFFICULTY_ESCALATION / DIFFICULTY_REDUCTION — adapt difficulty
 *      within an already-touched skill based on the most recent result,
 *      preferring foundation before application before transfer.
 */
export function selectNextQuestion(
  state: CapabilityState,
  availableQuestions: Question[],
  skills: SkillNode[]
): SelectedQuestion | null {
  const skillsById = Object.fromEntries(skills.map((s) => [s.id, s]));
  const candidates = availableQuestions.filter((q) => !state.askedQuestionIds.includes(q.id));
  if (candidates.length === 0) return null;

  const scored = candidates.map((q) => scoreCandidate(q, state, skillsById));
  scored.sort((a, b) => b.score - a.score || a.question.id.localeCompare(b.question.id));

  const best = scored[0];
  if (!best) return null; // unreachable given the length check above, but keeps types honest
  return {
    question: best.question,
    purpose: best.purpose,
    rationale: best.rationale,
    captureConfidence: shouldCaptureConfidence(best.purpose, state.questionsAttempted),
  };
}

interface ScoredCandidate {
  question: Question;
  score: number;
  purpose: QuestionPurpose;
  rationale: string;
}

function scoreCandidate(
  q: Question,
  state: CapabilityState,
  skillsById: Record<string, SkillNode>
): ScoredCandidate {
  const skill = skillsById[q.skillNodeId];
  const skillState = state.skills[q.skillNodeId];

  // Defensive guard: every question in the bank should reference a real
  // skill (the validation pipeline checks this — see questionValidator.ts).
  // If that invariant is ever violated, deprioritize rather than crash.
  if (!skill) {
    return { question: q, score: -1, purpose: "COVERAGE", rationale: "Skill metadata missing for this question." };
  }

  // Priority 1: prerequisite investigation. Any question for the
  // prerequisite skill can serve as the probe — some skills (like
  // Q_PCT_A) are inherently application-tier and have no FOUNDATION
  // question of their own, so requiring FOUNDATION here would silently
  // exclude them. Foundation and lower difficulty are still preferred via
  // scoring, just not required.
  const prereqFollowUp = state.pendingFollowUps.find(
    (f) => f.reason === "PREREQUISITE_UNCHECKED" && f.relatedSkillId === q.skillNodeId
  );
  if (prereqFollowUp) {
    const triggeringSkill = skillsById[prereqFollowUp.skillId];
    const foundationBonus = q.applicationType === "FOUNDATION" ? 3 : 0;
    return {
      question: q,
      score: 100 + (4 - q.difficulty) + foundationBonus,
      purpose: "PREREQUISITE_CHECK",
      rationale: `${skill.displayName} has never been assessed, and ${triggeringSkill?.displayName ?? prereqFollowUp.skillId} is showing weak application-level evidence that may trace back to it.`,
    };
  }

  // Priority 2: verify an unresolved incorrect response before drawing any conclusion.
  const verifyFollowUp = state.pendingFollowUps.find(
    (f) => f.reason === "UNVERIFIED_INCORRECT" && f.skillId === q.skillNodeId
  );
  if (verifyFollowUp) {
    const lastAttempt = skillState && skillState.attempts.length > 0 ? skillState.attempts[skillState.attempts.length - 1] : undefined;
    const lastDifficulty = lastAttempt?.difficulty ?? q.difficulty;
    const closeness = 5 - Math.abs(q.difficulty - lastDifficulty);
    return {
      question: q,
      score: 90 + closeness,
      purpose: "VERIFICATION",
      rationale: `The previous ${skill.displayName} response was incorrect — asking a related question before treating this as a real weakness.`,
    };
  }

  // Priority 3: baseline / coverage for an untouched skill.
  if (!skillState || skillState.attempts.length === 0) {
    const domainAttempts = countDomainAttempts(state, skillsById, skill.domain);
    const domainCoverageBonus = Math.max(0, 15 - domainAttempts * 2);
    const foundationBonus = q.applicationType === "FOUNDATION" ? 15 : 0;
    const easyBonus = q.difficulty <= 2 ? 10 : 0;
    return {
      question: q,
      score: 50 + domainCoverageBonus + foundationBonus + easyBonus,
      purpose: state.skillsCovered.length === 0 ? "BASELINE" : "COVERAGE",
      rationale: `${skill.displayName} has not been assessed yet this session.`,
    };
  }

  // Priority 4: adapt difficulty within an already-touched skill.
  const targetDifficulty = nextDifficultyFor(skillState);
  const difficultyFit = 10 - Math.abs(q.difficulty - targetDifficulty) * 3;
  const orderFit = applicationOrderScore(q.applicationType, skillState);
  const lastDifficulty = skillState.attempts[skillState.attempts.length - 1]?.difficulty ?? q.difficulty;
  const purpose: QuestionPurpose = q.difficulty > lastDifficulty ? "DIFFICULTY_ESCALATION" : "DIFFICULTY_REDUCTION";

  return {
    question: q,
    score: 20 + difficultyFit + orderFit,
    purpose,
    rationale:
      purpose === "DIFFICULTY_ESCALATION"
        ? `Recent ${skill.displayName} responses were correct — increasing difficulty.`
        : `Adjusting ${skill.displayName} difficulty based on the most recent response.`,
  };
}

function countDomainAttempts(state: CapabilityState, skillsById: Record<string, SkillNode>, domain: Domain): number {
  let count = 0;
  for (const [skillId, skillState] of Object.entries(state.skills)) {
    if (skillsById[skillId]?.domain === domain) count += skillState.attempts.length;
  }
  return count;
}

function nextDifficultyFor(state: SkillEvidenceState): 1 | 2 | 3 | 4 {
  const last = state.attempts[state.attempts.length - 1];
  if (!last) return 2;
  if (last.status !== "ANSWERED" || last.correct === null) return last.difficulty; // hold difficulty after a skip/don't-know
  if (last.correct) return Math.min(4, last.difficulty + 1) as 1 | 2 | 3 | 4;
  return Math.max(1, last.difficulty - 1) as 1 | 2 | 3 | 4;
}

function applicationOrderScore(type: ApplicationType, state: SkillEvidenceState): number {
  const foundationTouched = state.foundation.attempts >= 1;
  const foundationSolid = state.foundation.accuracy !== null && state.foundation.accuracy >= 0.5;
  const applicationTouched = state.application.attempts >= 1;
  const applicationSolid = state.application.accuracy !== null && state.application.accuracy >= 0.5;

  if (type === "FOUNDATION" && !foundationTouched) return 8;
  if (type === "APPLICATION" && foundationSolid) return 6;
  if (type === "TRANSFER" && applicationTouched && applicationSolid) return 4;
  if (type === "FOUNDATION") return 2;
  return 0;
}

/**
 * Confidence is captured on strategically selected questions, not every
 * question (spec section 18) — specifically where the confidence×performance
 * signal is most valuable (verification / prerequisite investigation), plus
 * a light periodic sample during ordinary coverage so the report still has
 * some confidence-alignment signal across the board.
 */
function shouldCaptureConfidence(purpose: QuestionPurpose, questionsAttemptedSoFar: number): boolean {
  if (purpose === "VERIFICATION" || purpose === "PREREQUISITE_CHECK") return true;
  return questionsAttemptedSoFar % 3 === 0;
}

// -----------------------------------------------------------------------------
// Stopping condition
// -----------------------------------------------------------------------------

export interface StoppingDecision {
  stop: boolean;
  reason: string | null;
}

/**
 * Not a fixed question count (spec section 32). Stops when either a hard
 * ceiling is hit, or when the minimum has been reached AND every domain has
 * real coverage AND there's no unresolved verification/prerequisite flag
 * left dangling.
 */
export function evaluateStoppingCondition(
  state: CapabilityState,
  skills: SkillNode[],
  totalAvailableQuestions: number
): StoppingDecision {
  if (state.questionsAttempted >= MAX_QUESTIONS) {
    return { stop: true, reason: "Reached the maximum question count for this diagnostic." };
  }
  if (state.questionsAttempted >= totalAvailableQuestions) {
    return { stop: true, reason: "Every available question in the bank has been used." };
  }
  if (state.questionsAttempted < MIN_QUESTIONS) {
    return { stop: false, reason: null };
  }

  const skillsById = Object.fromEntries(skills.map((s) => [s.id, s]));
  const domainSkillCounts: Record<Domain, Set<string>> = {
    QUANTITATIVE: new Set(),
    LOGICAL: new Set(),
    VERBAL: new Set(),
  };
  for (const skillId of state.skillsCovered) {
    const domain = skillsById[skillId]?.domain;
    if (domain) domainSkillCounts[domain].add(skillId);
  }
  const allDomainsCovered = REQUIRED_DOMAINS.every((d) => domainSkillCounts[d].size >= MIN_SKILLS_PER_DOMAIN);
  const noPendingFollowUps = state.pendingFollowUps.length === 0;

  if (allDomainsCovered && noPendingFollowUps) {
    return { stop: true, reason: "Minimum coverage reached across all domains with no unresolved follow-ups." };
  }
  return { stop: false, reason: null };
}
