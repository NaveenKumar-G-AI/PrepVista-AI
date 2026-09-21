import type {
  AttemptRecord,
  CapabilityState,
  Domain,
  EvidenceLevel,
  PendingFollowUp,
  SkillEvidenceState,
  SkillNode,
  SubEvidence,
} from "@/lib/domain/types";
import type { JoinedAttempt } from "@/lib/db/repo";

function emptySubEvidence(): SubEvidence {
  return { evidenceLevel: "NOT_ASSESSED", attempts: 0, correct: 0, accuracy: null, avgResponseTimeMs: null };
}

/**
 * The evidence ladder (spec section 30). Attempt count alone would force
 * unsupported precision on a single lucky/unlucky guess, so evidence level
 * blends *how much* we've asked with *how consistent* the answers were.
 */
/** Exported so reportBuilder.ts can classify domain-level (not just skill-level) evidence with the same thresholds. */
export function deriveEvidenceLevel(accuracy: number | null, attemptCount: number): EvidenceLevel {
  if (attemptCount === 0) return "NOT_ASSESSED";
  if (attemptCount === 1) return "LIMITED_EVIDENCE";
  if (attemptCount === 2 || accuracy === null) return "EMERGING";
  if (accuracy >= 0.85 && attemptCount >= 4) return "ADVANCED";
  if (accuracy >= 0.85) return "STRONG";
  if (accuracy >= 0.6) return "FUNCTIONAL";
  return "DEVELOPING";
}

function levelFromAttempts(attempts: AttemptRecord[]): SubEvidence {
  if (attempts.length === 0) return emptySubEvidence();

  const answered = attempts.filter((a) => a.status === "ANSWERED" && a.correct !== null);
  const correct = answered.filter((a) => a.correct).length;
  const accuracy = answered.length > 0 ? correct / answered.length : null;
  const avgResponseTimeMs =
    attempts.length > 0
      ? Math.round(attempts.reduce((sum, a) => sum + a.responseDurationMs, 0) / attempts.length)
      : null;

  // Deliberately never "WEAK" — section 31: never let incomplete coverage or
  // a rough patch read as a harsh, final-sounding label internally. The
  // report layer (reportBuilder.ts) is responsible for further softening
  // this into cautious, evidence-scoped student-facing language.
  const evidenceLevel = deriveEvidenceLevel(accuracy, attempts.length);

  return { evidenceLevel, attempts: attempts.length, correct, accuracy, avgResponseTimeMs };
}

function isVerified(attempts: AttemptRecord[], overall: SubEvidence): boolean {
  if (overall.accuracy === null) return false;
  const verificationAttempts = attempts.filter(
    (a) => (a.purpose === "VERIFICATION" || a.purpose === "PREREQUISITE_CHECK") && a.status === "ANSWERED" && a.correct !== null
  );
  if (verificationAttempts.length === 0) return false;
  const positiveTrend = overall.accuracy >= 0.6;
  return verificationAttempts.some((a) => (positiveTrend ? a.correct === true : a.correct === false));
}

export function computeCapabilityState(
  sessionId: string,
  history: JoinedAttempt[],
  skills: SkillNode[]
): CapabilityState {
  const skillsById = Object.fromEntries(skills.map((s) => [s.id, s]));
  const attemptsBySkill: Record<string, AttemptRecord[]> = {};
  const askedQuestionIds: string[] = [];

  for (const { response, presentation, question } of history) {
    askedQuestionIds.push(question.id);
    const record: AttemptRecord = {
      questionId: question.id,
      presentationId: presentation.id,
      applicationType: question.applicationType,
      difficulty: question.difficulty,
      purpose: presentation.purpose,
      status: response.status,
      correct: response.isCorrect,
      responseDurationMs: response.responseDurationMs,
      estimatedTimeSeconds: question.estimatedTimeSeconds,
      confidence: response.confidenceLevel,
      sequenceIndex: presentation.sequenceIndex,
    };
    (attemptsBySkill[question.skillNodeId] ??= []).push(record);
  }

  const skillStates: Record<string, SkillEvidenceState> = {};
  for (const skill of skills) {
    const attempts = (attemptsBySkill[skill.id] ?? []).sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    if (attempts.length === 0) {
      skillStates[skill.id] = {
        skillId: skill.id,
        overall: emptySubEvidence(),
        foundation: emptySubEvidence(),
        application: emptySubEvidence(),
        transfer: emptySubEvidence(),
        verified: false,
        attempts: [],
        lastAttemptCorrect: null,
      };
      continue;
    }
    const overall = levelFromAttempts(attempts);
    const foundation = levelFromAttempts(attempts.filter((a) => a.applicationType === "FOUNDATION"));
    const application = levelFromAttempts(attempts.filter((a) => a.applicationType === "APPLICATION"));
    const transfer = levelFromAttempts(attempts.filter((a) => a.applicationType === "TRANSFER"));
    const last = attempts[attempts.length - 1]!; // safe: the empty-array branch above already `continue`d

    skillStates[skill.id] = {
      skillId: skill.id,
      overall,
      foundation,
      application,
      transfer,
      verified: isVerified(attempts, overall),
      attempts,
      lastAttemptCorrect: last.status === "ANSWERED" ? last.correct : null,
    };
  }

  const domainsCovered = Array.from(
    new Set(
      Object.entries(attemptsBySkill)
        .filter(([, attempts]) => attempts.length > 0)
        .map(([skillId]) => skillsById[skillId]?.domain)
        .filter((d): d is Domain => !!d)
    )
  );
  const skillsCovered = Object.entries(attemptsBySkill)
    .filter(([, attempts]) => attempts.length > 0)
    .map(([skillId]) => skillId);

  const pendingFollowUps: PendingFollowUp[] = [];
  for (const skill of skills) {
    const state = skillStates[skill.id];
    if (!state || state.attempts.length === 0) continue;

    // An incorrect answer that hasn't yet been followed up with a dedicated
    // verification question (spec section 17: one wrong answer must not
    // automatically produce "student is weak").
    const hasVerification = state.attempts.some((a) => a.purpose === "VERIFICATION");
    if (state.lastAttemptCorrect === false && !hasVerification) {
      pendingFollowUps.push({ skillId: skill.id, reason: "UNVERIFIED_INCORRECT", relatedSkillId: null });
    }

    // Application-level weakness with an unassessed prerequisite (root-cause
    // trigger — spec section 27). Uses OVERALL evidence for the skill, not
    // just its application tier: a struggling FOUNDATION-tier reading is at
    // least as strong a reason to check the prerequisite as a struggling
    // APPLICATION-tier one — arguably stronger.
    if (skill.prerequisiteSkillId) {
      const overall = state.overall;
      const prereqState = skillStates[skill.prerequisiteSkillId];
      const prereqAssessed = prereqState && prereqState.attempts.length > 0;
      if (overall.attempts >= 2 && overall.accuracy !== null && overall.accuracy < 0.6 && !prereqAssessed) {
        pendingFollowUps.push({
          skillId: skill.id,
          reason: "PREREQUISITE_UNCHECKED",
          relatedSkillId: skill.prerequisiteSkillId,
        });
      }
    }
  }

  return {
    sessionId,
    skills: skillStates,
    domainsCovered,
    skillsCovered,
    questionsAttempted: history.length,
    questionsAnswered: history.filter((h) => h.response.status === "ANSWERED").length,
    pendingFollowUps,
    askedQuestionIds,
  };
}
