// ============================================================
// DIAGNOSIS ENGINE (spec §4, §5, §36, §37, §38, §39)
//
// Runs all 16 classifiers for one skill, then decides whether the
// result is trustworthy enough to act on. Two protections live
// here rather than in any individual classifier:
//
//  - INSUFFICIENT_EVIDENCE (R): if there just isn't enough data,
//    say so instead of guessing. One wrong question is never
//    enough to declare a weakness (§38).
//  - INCONSISTENT_PERFORMANCE (Q): if there's plenty of data but
//    none of the 16 classifiers found a pattern in it, that
//    ambiguity is itself the honest answer, not a reason to force
//    one of the low-confidence guesses into "the" diagnosis.
// ============================================================

import { AttemptEvidence, DiagnosisHypothesis, EvidenceItem, MasteryEvidence, Skill, SkillDiagnosisReport, SkillId } from './types';
import { CLASSIFIERS, ClassifierContext } from './diagnosisClassifiers';
import { clusterErrors } from './errorClustering';

const MIN_ATTEMPTS_FOR_DIAGNOSIS = 3;
const MEDIUM_THRESHOLD = 0.5;
const INCONSISTENCY_MIN_ATTEMPTS = 4;
const INCONSISTENCY_SWITCH_RATE = 0.6;

export function diagnoseSkill(
  skillId: SkillId,
  evidence: EvidenceItem[],
  skills: Skill[],
  masteryBySkill: Map<SkillId, number>
): SkillDiagnosisReport {
  const ctx: ClassifierContext = { skillId, evidence, skills, masteryBySkill };
  const hypotheses: DiagnosisHypothesis[] = CLASSIFIERS.map((classifier) => classifier(ctx)).filter(
    (h): h is DiagnosisHypothesis => h !== null
  );

  const attempts = evidence.filter((e): e is AttemptEvidence => e.type === 'ATTEMPT');
  const evidenceCount = evidence.length;
  const bestScore = hypotheses.reduce((max, h) => Math.max(max, h.confidenceScore), 0);

  const hasEnoughAttempts = attempts.length >= MIN_ATTEMPTS_FOR_DIAGNOSIS;
  const hasOtherSignalType = evidence.some((e) => e.type === 'RETENTION' || e.type === 'TRANSFER' || e.type === 'SIMULATION');
  const mastery = evidence.find((e): e is MasteryEvidence => e.type === 'MASTERY');
  const masteryIsReassuring = !!mastery && !mastery.neverLearned && mastery.masteryLevel >= 0.7;

  if (!hasEnoughAttempts && !hasOtherSignalType && !masteryIsReassuring && bestScore < MEDIUM_THRESHOLD) {
    hypotheses.push({
      category: 'INSUFFICIENT_EVIDENCE',
      skillId,
      confidence: 'UNKNOWN',
      // High confidence in the meta-claim "we don't know yet" — not a claim about the skill itself.
      confidenceScore: 0.9,
      evidenceSummary: [`Only ${evidenceCount} evidence item(s) so far — not enough to diagnose responsibly.`],
      affectedSkillIds: [skillId],
      recommendedActionTypes: ['MICRO_QUIZ', 'VERIFY'],
      verificationMethod: 'Collect a few more attempts before drawing a conclusion.',
    });
  } else if (bestScore < MEDIUM_THRESHOLD && attempts.length >= INCONSISTENCY_MIN_ATTEMPTS) {
    const switchRate = correctnessSwitchRate(attempts);
    if (switchRate >= INCONSISTENCY_SWITCH_RATE) {
      hypotheses.push({
        category: 'INCONSISTENT_PERFORMANCE',
        skillId,
        confidence: 'LOW',
        confidenceScore: 0.4,
        evidenceSummary: [
          `Correctness alternates across recent attempts (switch rate ${(switchRate * 100).toFixed(0)}%) without matching a known failure pattern yet.`,
        ],
        affectedSkillIds: [skillId],
        recommendedActionTypes: ['MICRO_QUIZ', 'VERIFY'],
        verificationMethod: 'Watch the next several attempts for a clearer pattern before committing to an intervention.',
      });
    }
  }

  hypotheses.sort((a, b) => b.confidenceScore - a.confidenceScore);

  return {
    skillId,
    hypotheses,
    errorClusters: clusterErrors(attempts),
    evidenceCount,
  };
}

/** Fraction of consecutive attempt pairs (oldest→newest) that flip correct/incorrect. */
function correctnessSwitchRate(attempts: AttemptEvidence[]): number {
  if (attempts.length < 2) return 0;
  const sorted = [...attempts].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let switches = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].isCorrect !== sorted[i - 1].isCorrect) switches++;
  }
  return switches / (sorted.length - 1);
}
