import {
  Difficulty,
  DifficultyPerformancePoint,
  ErrorClassification,
  ErrorType,
  SkillPerformance,
} from '../domain/types';
import { DIFFICULTY_ORDER } from '../config/difficultyNorms';
import { ScoredAttempt } from './scoringService';

const MIN_ATTEMPTS_FOR_LABEL = 2;

function labelFor(accuracyPct: number, attempted: number): SkillPerformance['label'] {
  if (attempted < MIN_ATTEMPTS_FOR_LABEL) return 'INSUFFICIENT_DATA';
  if (accuracyPct >= 85) return 'STRONG';
  if (accuracyPct >= 70) return 'STABLE';
  if (accuracyPct >= 50) return 'RISK';
  return 'CRITICAL';
}

export function computeSkillPerformance(scoredAttempts: ScoredAttempt[]): SkillPerformance[] {
  const byKey = new Map<string, ScoredAttempt[]>();
  for (const sa of scoredAttempts) {
    if (!sa.attempt.firstViewedAt) continue; // never opened - not evidence of performance either way
    const key = `${sa.question.domain}::${sa.question.topic}::${sa.question.skill}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(sa);
  }

  const out: SkillPerformance[] = [];
  for (const [key, group] of byKey) {
    const [domain, topic, skill] = key.split('::') as [SkillPerformance['domain'], SkillPerformance['topic'], string];
    const attempted = group.filter((g) => g.answered).length;
    const correct = group.filter((g) => g.correct).length;
    const accuracyPct = attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : 0;
    const avgTimeSpentSeconds =
      group.length > 0
        ? Math.round(group.reduce((s, g) => s + g.attempt.timeSpentMs / 1000, 0) / group.length)
        : 0;

    out.push({
      domain,
      topic,
      skill,
      attempted,
      correct,
      accuracyPct,
      avgTimeSpentSeconds,
      label: labelFor(accuracyPct, attempted),
    });
  }

  return out.sort((a, b) => a.accuracyPct - b.accuracyPct);
}

export function computeDifficultyCurve(scoredAttempts: ScoredAttempt[]): DifficultyPerformancePoint[] {
  return DIFFICULTY_ORDER.map((difficulty) => {
    const group = scoredAttempts.filter((sa) => sa.question.difficulty === difficulty && sa.answered);
    const attempted = group.length;
    const correct = group.filter((g) => g.correct).length;
    return {
      difficulty,
      attempted,
      correct,
      accuracyPct: attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : null,
    };
  });
}

/**
 * Deterministic, rule-based error classification (section 27). This is NOT
 * an ML model - every branch is an explicit, inspectable rule over data the
 * server actually measured (time spent, skill accuracy elsewhere, whether
 * the answer was changed from a correct one). Confidence is reported
 * honestly: a single wrong answer with roughly-expected timing gets LOW
 * confidence, because one data point genuinely isn't enough to tell a
 * calculation slip from anything else (section 27: "Do not classify blindly").
 */
export function classifyErrors(scoredAttempts: ScoredAttempt[], skillPerformance: SkillPerformance[]): ErrorClassification[] {
  const skillAccuracy = new Map(skillPerformance.map((s) => [s.skill, s]));

  const results: ErrorClassification[] = [];
  for (const sa of scoredAttempts) {
    if (!sa.answered || sa.correct) continue; // only classify wrong, answered questions
    results.push(classifyOne(sa, skillAccuracy.get(sa.question.skill) ?? null));
  }
  return results;
}

function classifyOne(sa: ScoredAttempt, skillPerf: SkillPerformance | null): ErrorClassification {
  const spent = sa.attempt.timeSpentMs / 1000;
  const expected = sa.question.expectedTimeSeconds;
  const skillAcc = skillPerf && skillPerf.attempted >= MIN_ATTEMPTS_FOR_LABEL ? skillPerf.accuracyPct : null;
  const questionId = sa.question.id;

  // Rule 1: had the right answer, changed away from it.
  if (sa.attempt.answerChangeCount > 0 && sa.attempt.firstAnswer === sa.question.correctOptionId) {
    return {
      questionId,
      errorType: 'PROCEDURAL_ERROR',
      confidence: 'HIGH',
      reasoning:
        'Initially selected the correct answer but changed to an incorrect one before final submission - ' +
        'a second-guessing pattern rather than a knowledge gap.',
    };
  }

  // Rule 2: unusually fast for a wrong answer.
  if (spent < expected * 0.35) {
    if (skillAcc !== null && skillAcc >= 60) {
      return {
        questionId,
        errorType: 'CARELESS_ERROR',
        confidence: 'MEDIUM',
        reasoning: `Generally accurate on this skill (${skillAcc}% in this assessment) but answered this one unusually fast - looks like a careless slip rather than a knowledge gap.`,
      };
    }
    return {
      questionId,
      errorType: 'GUESS',
      confidence: 'MEDIUM',
      reasoning: 'Very little time was spent before answering, with no strong track record on this skill yet - consistent with a guess rather than a reasoned attempt.',
    };
  }

  // Rule 3: unusually slow for a wrong answer.
  if (spent > expected * 1.5) {
    if (skillAcc !== null && skillAcc >= 60) {
      return {
        questionId,
        errorType: 'TIME_PRESSURE',
        confidence: 'MEDIUM',
        reasoning: `The concept appears understood elsewhere (${skillAcc}% on this skill), but extended time on this question still ended in an error - time pressure likely disrupted execution rather than a concept gap.`,
      };
    }
    return {
      questionId,
      errorType: 'PARTIAL_UNDERSTANDING',
      confidence: 'MEDIUM',
      reasoning: 'Extended time was spent without reaching the correct answer, and this skill shows inconsistent performance overall - suggests partial rather than solid understanding.',
    };
  }

  // Rule 4: roughly expected timing - the hardest case to classify confidently from one data point.
  if (skillAcc !== null && skillAcc < 40) {
    return {
      questionId,
      errorType: 'CONCEPT_GAP',
      confidence: 'HIGH',
      reasoning: `Consistently low accuracy on this skill (${skillAcc}%) across this assessment points to a genuine concept gap rather than an isolated mistake.`,
    };
  }

  const fallbackByDomain: Record<string, ErrorType> = {
    QUANTITATIVE: 'CALCULATION_ERROR',
    LOGICAL: 'LOGICAL_ERROR',
    VERBAL: 'MISREAD',
  };
  const errorType = fallbackByDomain[sa.question.domain] ?? 'UNKNOWN';
  return {
    questionId,
    errorType,
    confidence: 'LOW',
    reasoning:
      'Time spent was roughly as expected but the answer was still wrong, with no other strong signal to lean on - ' +
      'a single instance like this is not enough to say more with confidence.',
  };
}
