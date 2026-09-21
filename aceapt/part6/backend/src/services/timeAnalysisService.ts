import { Assessment, Domain, SectionTimeUsage, TimeAnalysis, TimeInvestmentFlag } from '../domain/types';
import { OVER_INVESTMENT_MULTIPLIER, UNDER_INVESTMENT_FRACTION } from '../config/difficultyNorms';
import { ScoredAttempt } from './scoringService';

function timeSpentSeconds(sa: ScoredAttempt): number {
  return Math.round(sa.attempt.timeSpentMs / 1000);
}

/**
 * Over-investment (section 19): time spent relative to a question's expected
 * time, difficulty, and the benefit available (same score as a much faster
 * question) - flagged regardless of correctness, since sinking 180s into a
 * question you still got wrong is the clearest possible waste of a fixed
 * time budget.
 *
 * Under-investment (section 20): explicitly NOT "every fast answer is bad".
 * We only flag fast-and-wrong answers (rushed guess), or unusually fast
 * answers on MEDIUM+/HARD questions (a lucky-looking guess worth a second
 * look) - fast-and-correct on an EASY question is just competence, not rushing.
 */
function classifyInvestment(sa: ScoredAttempt, position: number): TimeInvestmentFlag | null {
  if (!sa.attempt.firstViewedAt) return null; // never opened - not an investment decision at all
  const spent = timeSpentSeconds(sa);
  const expected = sa.question.expectedTimeSeconds;

  if (spent > expected * OVER_INVESTMENT_MULTIPLIER) {
    return {
      questionId: sa.question.id,
      position,
      kind: 'OVER_INVESTMENT',
      timeSpentSeconds: spent,
      expectedTimeSeconds: expected,
      correct: sa.answered ? sa.correct : null,
      note: sa.correct
        ? `Spent ${spent}s (expected ~${expected}s) and still got it right - the time may have been recoverable elsewhere.`
        : `Spent ${spent}s (expected ~${expected}s) and still got it wrong - this is the costliest kind of time loss.`,
    };
  }

  const isRushedWrong = sa.answered && !sa.correct && spent < expected * UNDER_INVESTMENT_FRACTION;
  const isSuspiciouslyFast =
    sa.answered && sa.correct && sa.question.difficulty !== 'EASY' && spent < expected * UNDER_INVESTMENT_FRACTION;

  if (isRushedWrong || isSuspiciouslyFast) {
    return {
      questionId: sa.question.id,
      position,
      kind: 'UNDER_INVESTMENT',
      timeSpentSeconds: spent,
      expectedTimeSeconds: expected,
      correct: sa.correct,
      note: isRushedWrong
        ? `Answered in ${spent}s (expected ~${expected}s) and got it wrong - looks like a rushed guess rather than reasoned elimination.`
        : `Answered a ${sa.question.difficulty.replace('_', ' ').toLowerCase()} question correctly in just ${spent}s - possibly a strong instinct, possibly a lucky guess; worth a second look.`,
    };
  }

  return null;
}

export function analyzeTime(assessment: Assessment, scoredAttempts: ScoredAttempt[]): TimeAnalysis {
  const totalTimeSeconds = assessment.durationSeconds;

  const startedMs = assessment.startedAt ? Date.parse(assessment.startedAt) : null;
  const endMs = assessment.submittedAt
    ? Date.parse(assessment.submittedAt)
    : assessment.endsAt
      ? Math.min(Date.now(), Date.parse(assessment.endsAt))
      : Date.now();
  const rawUsed = startedMs !== null ? Math.round((endMs - startedMs) / 1000) : 0;
  const timeUsedSeconds = Math.min(totalTimeSeconds, Math.max(0, rawUsed));
  const timeRemainingSeconds = Math.max(0, totalTimeSeconds - timeUsedSeconds);

  const viewed = scoredAttempts.filter((sa) => sa.attempt.firstViewedAt);
  const avgTimePerQuestionSeconds =
    viewed.length > 0 ? Math.round(viewed.reduce((s, sa) => s + timeSpentSeconds(sa), 0) / viewed.length) : 0;

  const unansweredCount = scoredAttempts.filter((sa) => !sa.answered).length;
  // "Due to time" = never even opened - see file-level rationale below.
  const unansweredDueToTime = scoredAttempts.filter((sa) => !sa.answered && !sa.attempt.firstViewedAt).length;

  const overInvestmentFlags: TimeInvestmentFlag[] = [];
  const underInvestmentFlags: TimeInvestmentFlag[] = [];
  scoredAttempts.forEach((sa, i) => {
    const flag = classifyInvestment(sa, i + 1);
    if (flag?.kind === 'OVER_INVESTMENT') overInvestmentFlags.push(flag);
    if (flag?.kind === 'UNDER_INVESTMENT') underInvestmentFlags.push(flag);
  });

  const domains: Domain[] = ['QUANTITATIVE', 'LOGICAL', 'VERBAL'];
  const sectionTimeUsage: SectionTimeUsage[] = domains
    .map((domain) => {
      const inDomain = scoredAttempts.filter((sa) => sa.question.domain === domain);
      if (inDomain.length === 0) return null;
      const actualTimeSeconds = inDomain.reduce((s, sa) => s + timeSpentSeconds(sa), 0);
      const allocatedShareSeconds = Math.round((inDomain.length / scoredAttempts.length) * totalTimeSeconds);
      return { domain, allocatedShareSeconds, actualTimeSeconds, questionsCount: inDomain.length };
    })
    .filter((x): x is SectionTimeUsage => x !== null);

  return {
    totalTimeSeconds,
    timeUsedSeconds,
    timeRemainingSeconds,
    avgTimePerQuestionSeconds,
    unansweredCount,
    unansweredDueToTime,
    overInvestmentFlags,
    underInvestmentFlags,
    sectionTimeUsage,
  };
}
