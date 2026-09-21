/**
 * Section 4: Mastery Evidence Engine.
 *
 * This is the ONLY place raw AttemptEvents get turned into aggregate
 * numbers. Every other engine module consumes SkillEvidence, never raw
 * attempts directly — that keeps "what counts as evidence" defined in
 * exactly one place.
 *
 * Design decision worth calling out: difficulty / format / context / novelty
 * breakdowns are computed over INDEPENDENT attempts only. Section 5 treats
 * independence as foundational ("do not classify [94% guided] as robust
 * mastery") — it would be incoherent to then let guided attempts count
 * toward, say, "hard difficulty accuracy". Guided attempts still feed
 * `guidedAccuracy` and hint-usage evidence; they just don't count toward
 * the robustness dimensions.
 */

import { THRESHOLDS, REVIEW_PERIOD_DAYS } from '../domain/constants';
import {
  AttemptEvent,
  DifficultyLevel,
  DIFFICULTY_ORDER,
  NoveltyLevel,
  NOVELTY_ORDER,
  Question,
  QuestionFormat,
  SkillEvidence,
} from '../domain/types';

const FORMATS: QuestionFormat[] = [
  'direct',
  'word_problem',
  'table',
  'graph',
  'scenario',
  'multi_step',
  'data_interpretation',
  'applied',
];

function accuracyOf(attempts: AttemptEvent[]): number | null {
  if (attempts.length === 0) return null;
  return round(attempts.filter((a) => a.correct).length / attempts.length);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24);
}

export function buildEvidence(
  skillId: string,
  allAttempts: AttemptEvent[],
  questionsById: Map<string, Question>
): SkillEvidence {
  const attempts = allAttempts
    .filter((a) => a.skillId === skillId)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const independent = attempts.filter((a) => a.independent);
  const guided = attempts.filter((a) => !a.independent);
  const independentDistinctQuestions = new Set(independent.map((a) => a.questionId)).size;
  const recentIndependent = independent.slice(-THRESHOLDS.RECENT_WINDOW_SIZE);

  const byDifficulty = {} as SkillEvidence['byDifficulty'];
  for (const d of DIFFICULTY_ORDER) {
    const subset = independent.filter((a) => questionsById.get(a.questionId)?.difficulty === d);
    byDifficulty[d] = { attempts: subset.length, correct: subset.filter((a) => a.correct).length, accuracy: accuracyOf(subset) };
  }

  const byFormat = {} as SkillEvidence['byFormat'];
  for (const f of FORMATS) {
    const subset = independent.filter((a) => questionsById.get(a.questionId)?.format === f);
    byFormat[f] = { attempts: subset.length, correct: subset.filter((a) => a.correct).length, accuracy: accuracyOf(subset) };
  }

  const byNovelty = {} as SkillEvidence['byNovelty'];
  for (const n of NOVELTY_ORDER) {
    const subset = independent.filter((a) => questionsById.get(a.questionId)?.novelty === n);
    byNovelty[n] = { attempts: subset.length, correct: subset.filter((a) => a.correct).length, accuracy: accuracyOf(subset) };
  }

  const byContext: SkillEvidence['byContext'] = {};
  for (const a of independent) {
    const ctx = questionsById.get(a.questionId)?.context ?? 'unknown';
    if (!byContext[ctx]) byContext[ctx] = { attempts: 0, correct: 0, accuracy: null };
    byContext[ctx].attempts += 1;
    if (a.correct) byContext[ctx].correct += 1;
  }
  for (const ctx of Object.keys(byContext)) {
    byContext[ctx].accuracy = round(byContext[ctx].correct / byContext[ctx].attempts);
  }

  const familiar = independent.filter((a) => {
    const nov = questionsById.get(a.questionId)?.novelty;
    return nov === 'seen' || nov === 'similar';
  });
  const novel = independent.filter((a) => {
    const nov = questionsById.get(a.questionId)?.novelty;
    return nov === 'varied' || nov === 'novel';
  });

  // Section 11: retention. "Delayed" attempts are ones explicitly recorded
  // via a retention_check AND separated from the skill's last non-retention
  // practice by a real gap — this avoids a same-day re-answer masquerading
  // as delayed recall.
  const nonRetention = independent.filter((a) => a.source !== 'retention_check');
  const retentionAttempts = independent.filter((a) => a.source === 'retention_check');
  const lastNonRetentionAt = nonRetention.length ? nonRetention[nonRetention.length - 1].timestamp : null;
  const validRetentionAttempts = retentionAttempts.filter(
    (a) => !lastNonRetentionAt || daysBetween(a.timestamp, lastNonRetentionAt) >= REVIEW_PERIOD_DAYS.MIN_GAP_FOR_RETENTION_CHECK
  );

  // Rolling-window accuracy sequence for the stability check (section 13).
  const window = THRESHOLDS.STABILITY_WINDOW;
  const rollingAccuracies: number[] = [];
  for (let i = 0; i + window <= independent.length; i++) {
    const slice = independent.slice(i, i + window);
    rollingAccuracies.push(accuracyOf(slice)!);
  }

  return {
    skillId,
    totalAttempts: attempts.length,
    independentAttempts: independent.length,
    independentDistinctQuestions,
    guidedAccuracy: accuracyOf(guided),
    independentAccuracy: accuracyOf(recentIndependent),
    lifetimeIndependentAccuracy: accuracyOf(independent),
    byDifficulty,
    byFormat,
    byNovelty,
    byContext,
    familiarAccuracy: accuracyOf(familiar),
    novelAccuracy: accuracyOf(novel),
    novelIndependentAttempts: novel.length,
    retention: {
      immediateAccuracy: accuracyOf(nonRetention),
      delayedAccuracy: accuracyOf(validRetentionAttempts),
      delayedAttempts: validRetentionAttempts.length,
    },
    hintUsageRate: attempts.length ? round(attempts.filter((a) => a.hintUsed).length / attempts.length) : 0,
    avgRetries: attempts.length ? round(attempts.reduce((s, a) => s + a.retries, 0) / attempts.length) : 0,
    rollingAccuracies,
    lastAttemptAt: attempts.length ? attempts[attempts.length - 1].timestamp : null,
  };
}
