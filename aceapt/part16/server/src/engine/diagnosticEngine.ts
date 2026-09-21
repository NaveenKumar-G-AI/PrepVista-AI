import crypto from 'node:crypto';
import { AttemptEvidence, StudentSkillHistory, StepType } from '../types/evidence';
import { Confidence, RootCause, RootCauseCandidate, ROOT_CAUSE_PRIORITY, ROOT_CAUSE_LABELS } from '../types/rootCause';
import { Diagnosis, DiagnosticUiPanel, SignalStatus } from '../types/diagnosis';

const MIN_SAMPLE_FOR_CONFIDENT_INFERENCE = 3;
const LOW_ACCURACY_THRESHOLD = 0.5;
const STRONG_ACCURACY_THRESHOLD = 0.75;
const SLOW_RESPONSE_MULTIPLIER = 1.6;
const RUSHED_RESPONSE_MULTIPLIER = 0.5;

const STEP_TYPE_TO_ROOT_CAUSE: Record<StepType, RootCause> = {
  concept: RootCause.CONCEPT_GAP,
  strategy: RootCause.STRATEGY_GAP,
  procedure: RootCause.PROCEDURAL_GAP,
  calculation: RootCause.CALCULATION_ERROR,
  interpretation: RootCause.INTERPRETATION_ERROR,
};

/**
 * Runs the deterministic rule set against one attempt + the student's history
 * and returns a ranked, confidence-scored diagnosis. This function must never
 * call an LLM — see Section 38: evidence -> structured diagnostic engine first,
 * LLM generation (wording only) happens downstream of this.
 */
export function diagnose(evidence: AttemptEvidence, history: StudentSkillHistory): Diagnosis {
  const candidates: RootCauseCandidate[] = [];

  if (evidence.correct) {
    // A correct answer still produces a (empty/positive) diagnosis record so the
    // event trail and effectiveness calculations have a complete picture, but we
    // don't manufacture a root cause when nothing failed.
    return buildDiagnosis(evidence, [], history);
  }

  // 1) Self-report is the strongest available signal when present (Section 10).
  if (evidence.selfReportedReasonCode) {
    candidates.push(selfReportToCandidate(evidence.selfReportedReasonCode));
  }

  // 2) Step-level evidence (solution path) — highest confidence because it's direct.
  if (evidence.solutionPath && evidence.solutionPath.length > 0) {
    const firstWrongStep = evidence.solutionPath.find((s) => !s.correct);
    if (firstWrongStep) {
      const cause = STEP_TYPE_TO_ROOT_CAUSE[firstWrongStep.stepType];
      const priorStepsCorrect = evidence.solutionPath
        .filter((s) => s.stepNumber < firstWrongStep.stepNumber)
        .every((s) => s.correct);
      candidates.push({
        cause,
        confidence: priorStepsCorrect ? Confidence.HIGH : Confidence.MODERATE,
        evidenceSummary: `Solution steps were correct through step ${firstWrongStep.stepNumber - 1}; the approach diverged at a ${firstWrongStep.stepType} step.`,
      });
    }
  }

  // 3) Aggregate accuracy signals (used when there is no direct step evidence, or to corroborate it).
  const recentSkill = history.recentAccuracy.find((r) => r.skillId === evidence.skillId);
  const prereqSamples = history.recentAccuracy.filter((r) => evidence.prerequisiteSkillIds.includes(r.skillId));
  const weakPrereq = prereqSamples.find(
    (p) => p.sampleSize >= MIN_SAMPLE_FOR_CONFIDENT_INFERENCE && p.accuracy < LOW_ACCURACY_THRESHOLD
  );

  if (!evidence.solutionPath && weakPrereq) {
    candidates.push({
      cause: RootCause.PREREQUISITE_GAP,
      confidence: Confidence.MODERATE,
      evidenceSummary: `Recent accuracy on the prerequisite skill is ${Math.round(weakPrereq.accuracy * 100)}% over ${weakPrereq.sampleSize} attempts.`,
    });
  }

  if (!evidence.solutionPath && recentSkill && recentSkill.sampleSize >= MIN_SAMPLE_FOR_CONFIDENT_INFERENCE) {
    if (recentSkill.accuracy < LOW_ACCURACY_THRESHOLD && !weakPrereq) {
      candidates.push({
        cause: RootCause.CONCEPT_GAP,
        confidence: Confidence.MODERATE,
        evidenceSummary: `Recent accuracy on this skill is ${Math.round(recentSkill.accuracy * 100)}% over ${recentSkill.sampleSize} attempts, with prerequisites intact.`,
      });
    }
  }

  // 4) Regression vs. never-mastered — a skill that was previously proficient/mastered
  // and is now failing points to retention, not a fresh concept gap (Section 25).
  if (history.masteryState === 'mastered' || history.masteryState === 'proficient') {
    candidates.push({
      cause: RootCause.RETENTION_GAP,
      confidence: Confidence.MODERATE,
      evidenceSummary: `This skill was previously "${history.masteryState}"; the current failure looks like regression rather than a first-time gap.`,
    });
  }

  // 5) Familiar-strong / unfamiliar-weak -> transfer or application gap (Section 26).
  if (evidence.questionType === 'unfamiliar_context' && recentSkill && recentSkill.accuracy >= STRONG_ACCURACY_THRESHOLD) {
    candidates.push({
      cause: RootCause.TRANSFER_GAP,
      confidence: Confidence.MODERATE,
      evidenceSummary: `Accuracy on familiar-format questions for this skill is ${Math.round(recentSkill.accuracy * 100)}%, but this attempt used an unfamiliar framing.`,
    });
  } else if (
    (evidence.questionType === 'mixed' || evidence.difficulty === 'hard') &&
    recentSkill &&
    recentSkill.accuracy >= STRONG_ACCURACY_THRESHOLD
  ) {
    candidates.push({
      cause: RootCause.APPLICATION_GAP,
      confidence: Confidence.MODERATE,
      evidenceSummary: `Foundation accuracy on this skill is strong (${Math.round(recentSkill.accuracy * 100)}%), but this was a harder/composite application of it.`,
    });
  }

  // 6) Assessment-condition gap: strong normal practice, weak under exam-simulation conditions (Section 28).
  if (evidence.questionType === 'exam_simulation' && recentSkill && recentSkill.accuracy >= STRONG_ACCURACY_THRESHOLD) {
    candidates.push({
      cause: RootCause.ASSESSMENT_CONDITION_GAP,
      confidence: Confidence.MODERATE,
      evidenceSummary: `Normal-practice accuracy is strong (${Math.round(recentSkill.accuracy * 100)}%); this failure occurred under exam-simulation conditions.`,
    });
  }

  // 7) Speed signal — only meaningful alongside an error; correct-but-slow is out of scope here (Section 27 handles it separately).
  if (evidence.responseTimeSeconds > evidence.expectedTimeSeconds * SLOW_RESPONSE_MULTIPLIER) {
    candidates.push({
      cause: RootCause.SPEED_GAP,
      confidence: Confidence.LOW,
      evidenceSummary: `Response time (${evidence.responseTimeSeconds}s) was well above the expected ${evidence.expectedTimeSeconds}s for this difficulty.`,
    });
  } else if (evidence.responseTimeSeconds < evidence.expectedTimeSeconds * RUSHED_RESPONSE_MULTIPLIER) {
    candidates.push({
      cause: RootCause.INTERPRETATION_ERROR,
      confidence: Confidence.LOW,
      evidenceSummary: `Response time (${evidence.responseTimeSeconds}s) was much shorter than the expected ${evidence.expectedTimeSeconds}s, consistent with a rushed reading of the question.`,
    });
  }

  // 8) Heavy hint use before failing corroborates a genuine gap rather than a slip.
  if (evidence.hintsUsed >= 3) {
    candidates.push({
      cause: RootCause.PROCEDURAL_GAP,
      confidence: Confidence.LOW,
      evidenceSummary: `${evidence.hintsUsed} hints were used before this attempt, suggesting the procedure wasn't yet independent.`,
    });
  }

  // 9) Inconsistent recent pattern with no clear trend.
  if (
    !evidence.solutionPath &&
    recentSkill &&
    recentSkill.sampleSize >= MIN_SAMPLE_FOR_CONFIDENT_INFERENCE &&
    recentSkill.accuracy >= LOW_ACCURACY_THRESHOLD &&
    recentSkill.accuracy < STRONG_ACCURACY_THRESHOLD &&
    candidates.length === 0
  ) {
    candidates.push({
      cause: RootCause.CONSISTENCY_GAP,
      confidence: Confidence.LOW,
      evidenceSummary: `Recent accuracy on this skill is mixed (${Math.round(recentSkill.accuracy * 100)}%) without a clear single pattern.`,
    });
  }

  return buildDiagnosis(evidence, candidates, history);
}

function selfReportToCandidate(reason: AttemptEvidence['selfReportedReasonCode']): RootCauseCandidate {
  const map: Record<NonNullable<AttemptEvidence['selfReportedReasonCode']>, RootCause> = {
    no_concept: RootCause.CONCEPT_GAP,
    no_method: RootCause.STRATEGY_GAP,
    know_method_cant_solve: RootCause.PROCEDURAL_GAP,
    calculation_mistake: RootCause.CALCULATION_ERROR,
    dont_understand_question: RootCause.INTERPRETATION_ERROR,
    running_out_of_time: RootCause.SPEED_GAP,
  };
  const cause = map[reason as NonNullable<AttemptEvidence['selfReportedReasonCode']>];
  return {
    cause,
    confidence: Confidence.HIGH,
    evidenceSummary: 'Student self-reported this as the point of difficulty.',
  };
}

function buildDiagnosis(evidence: AttemptEvidence, rawCandidates: RootCauseCandidate[], history: StudentSkillHistory): Diagnosis {
  // De-duplicate by cause, keeping the highest-confidence entry for each.
  const byCause = new Map<RootCause, RootCauseCandidate>();
  for (const c of rawCandidates) {
    const existing = byCause.get(c.cause);
    if (!existing || confidenceRank(c.confidence) > confidenceRank(existing.confidence)) {
      byCause.set(c.cause, c);
    }
  }
  const deduped = Array.from(byCause.values());

  const insufficientEvidence = !evidence.correct && deduped.length === 0;

  let primary: RootCauseCandidate;
  let secondary: RootCauseCandidate[] = [];
  let isMultiFactor = false;

  if (evidence.correct) {
    primary = { cause: RootCause.CONCEPT_GAP, confidence: Confidence.LOW, evidenceSummary: 'Attempt was correct; no root cause applicable.' };
    secondary = [];
  } else if (insufficientEvidence) {
    // Section 35: don't manufacture a confident conclusion from thin evidence.
    primary = {
      cause: RootCause.CONCEPT_GAP,
      confidence: Confidence.LOW,
      evidenceSummary: 'Not enough history yet to isolate a specific cause; defaulting to a general concept check.',
    };
  } else {
    const ordered = [...deduped].sort(
      (a, b) => ROOT_CAUSE_PRIORITY.indexOf(a.cause) - ROOT_CAUSE_PRIORITY.indexOf(b.cause)
    );
    primary = ordered[0];
    secondary = ordered.slice(1);
    isMultiFactor = ordered.length > 1;
  }

  const uiPanel = buildUiPanel(evidence, primary, secondary, insufficientEvidence);

  return {
    attemptId: attemptIdFor(evidence),
    studentId: evidence.studentId,
    skillId: evidence.skillId,
    primary,
    secondary,
    isMultiFactor,
    insufficientEvidence,
    uiPanel,
    createdAt: new Date().toISOString(),
  };
}

function confidenceRank(c: Confidence): number {
  return { [Confidence.HIGH]: 3, [Confidence.MODERATE]: 2, [Confidence.LOW]: 1 }[c];
}

function buildUiPanel(
  evidence: AttemptEvidence,
  primary: RootCauseCandidate,
  secondary: RootCauseCandidate[],
  insufficientEvidence: boolean
): DiagnosticUiPanel {
  const causes = [primary, ...secondary].map((c) => c.cause);
  const has = (c: RootCause) => causes.includes(c);

  const conceptStatus: SignalStatus = evidence.correct
    ? 'ok'
    : has(RootCause.CONCEPT_GAP) || has(RootCause.PREREQUISITE_GAP)
    ? 'fail'
    : 'ok';
  const methodStatus: SignalStatus = evidence.correct
    ? 'ok'
    : has(RootCause.STRATEGY_GAP) || has(RootCause.APPLICATION_GAP) || has(RootCause.TRANSFER_GAP)
    ? 'warning'
    : 'ok';
  const calculationStatus: SignalStatus = evidence.correct
    ? 'ok'
    : has(RootCause.CALCULATION_ERROR)
    ? 'warning'
    : has(RootCause.INTERPRETATION_ERROR)
    ? 'warning'
    : 'ok';

  const likelyIssueLabel = evidence.correct
    ? 'No issue detected'
    : insufficientEvidence
    ? 'Gathering more evidence'
    : ROOT_CAUSE_LABELS[primary.cause];

  return { conceptStatus, methodStatus, calculationStatus, likelyIssueLabel };
}

function attemptIdFor(evidence: AttemptEvidence): string {
  return crypto
    .createHash('sha256')
    .update(`${evidence.studentId}:${evidence.questionId}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 24);
}
