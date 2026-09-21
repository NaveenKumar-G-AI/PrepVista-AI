import { AnswerChangeInsight, SkipStrategyInsight, TimeInvestmentFlag } from '../domain/types';
import { ScoredAttempt } from './scoringService';

const MIN_CHANGES_FOR_EVIDENCE = 3;

/**
 * Section 23: never label answer-changing negatively by default, and only
 * draw a conclusion once there is enough evidence. Below the evidence
 * threshold, insightText stays null even though the counts are still shown.
 */
export function analyzeAnswerChanges(scoredAttempts: ScoredAttempt[]): AnswerChangeInsight {
  let correctToWrong = 0;
  let wrongToCorrect = 0;
  let correctToCorrect = 0;
  let totalChanges = 0;

  for (const sa of scoredAttempts) {
    if (sa.attempt.answerChangeCount <= 0) continue;
    totalChanges += 1;
    const firstCorrect = sa.attempt.firstAnswer === sa.question.correctOptionId;
    const finalCorrect = sa.attempt.finalAnswer === sa.question.correctOptionId;
    if (firstCorrect && !finalCorrect) correctToWrong += 1;
    else if (!firstCorrect && finalCorrect) wrongToCorrect += 1;
    else if (firstCorrect && finalCorrect) correctToCorrect += 1;
    // (wrong -> wrong is intentionally uncounted in the three named buckets, section 23,
    // but still included in totalChanges.)
  }

  const netEffect = wrongToCorrect - correctToWrong;
  const hasSufficientEvidence = totalChanges >= MIN_CHANGES_FOR_EVIDENCE;

  let insightText: string | null = null;
  if (hasSufficientEvidence) {
    if (correctToWrong > wrongToCorrect + 1) {
      insightText = 'Your initial decisions are often stronger than your revised answers - consider trusting your first read more.';
    } else if (wrongToCorrect > correctToWrong + 1) {
      insightText = 'Revisiting and changing answers has been working in your favor overall - your second-guessing is often correcting real mistakes.';
    } else {
      insightText = 'Answer changes have had a roughly neutral effect so far - neither clearly helping nor hurting your score.';
    }
  }

  return { totalChanges, correctToWrong, wrongToCorrect, correctToCorrect, netEffect, hasSufficientEvidence, insightText };
}

function wasEverSkipped(sa: ScoredAttempt): boolean {
  return sa.attempt.navigationLog.some((e) => e.type === 'SKIP');
}

/** Section 21/22: the goal is efficient decisions under time pressure, not "skip as much as possible". */
export function analyzeSkipStrategy(scoredAttempts: ScoredAttempt[], overInvestmentFlags: TimeInvestmentFlag[]): SkipStrategyInsight {
  const overInvestedIds = new Set(overInvestmentFlags.map((f) => f.questionId));
  const totalQuestions = scoredAttempts.length || 1;

  const everSkipped = scoredAttempts.filter(wasEverSkipped);
  const totalSkips = everSkipped.length;

  const effectiveSkips = everSkipped.filter((sa) => sa.attempt.revisited && sa.answered && sa.correct).length;

  const trappedCount = scoredAttempts.filter(
    (sa) => !wasEverSkipped(sa) && !sa.correct && overInvestedIds.has(sa.question.id)
  ).length;

  const neverSkipsDespiteStruggle = totalSkips === 0 && trappedCount >= 2;
  const skipRatio = totalSkips / totalQuestions;
  const overAggressiveSkipping = skipRatio > 0.35;

  let insightText: string;
  if (neverSkipsDespiteStruggle) {
    insightText = `You never skipped a question this attempt, and ${trappedCount} question${trappedCount === 1 ? '' : 's'} turned into a time sink without paying off - skipping and returning later can protect the rest of the paper.`;
  } else if (overAggressiveSkipping && effectiveSkips === 0) {
    insightText = `You skipped ${totalSkips} of ${totalQuestions} questions and rarely converted a revisit into a correct answer - try committing to a first attempt more often before moving on.`;
  } else if (effectiveSkips > 0) {
    insightText = `Your skip-and-return strategy is paying off - you recovered ${effectiveSkips} question${effectiveSkips === 1 ? '' : 's'} you initially set aside.`;
  } else if (totalSkips === 0) {
    insightText = 'You did not skip any questions this attempt - a fine strategy as long as difficult questions are not eating into time for easier ones later in the paper.';
  } else {
    insightText = 'Your skip usage looks reasonable for this attempt - neither avoiding difficult questions nor getting stuck on them.';
  }

  return { totalSkips, effectiveSkips, trappedCount, neverSkipsDespiteStruggle, overAggressiveSkipping, insightText };
}
