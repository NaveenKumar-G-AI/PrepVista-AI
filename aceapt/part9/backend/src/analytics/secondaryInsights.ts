import { AnswerRecord, SimulationQuestionRef } from '../domain/types';
import { round1 } from '../util/math';

// ============================================================
// SECONDARY INSIGHTS  (spec sections 27, 31)
// ============================================================
// Two small, sample-size-gated analyses. Neither is listed as a named
// top-level service in spec section 48, so they live together here
// rather than as two near-empty files - both still only "report when
// supported by data" exactly as the spec requires.

export interface TopicSwitchFinding {
  hasSufficientData: boolean;
  switchAccuracy?: number;
  nonSwitchAccuracy?: number;
  deltaPoints?: number;
  message: string;
}

const MIN_SAMPLE = 5;
const MEANINGFUL_DELTA = 10;

export function analyzeTopicSwitching(
  orderedRefs: SimulationQuestionRef[],
  answers: Record<string, AnswerRecord>,
): TopicSwitchFinding {
  const isSwitch: boolean[] = [];
  const isCorrect: boolean[] = [];

  orderedRefs.forEach((ref, i) => {
    const a = answers[ref.questionId];
    if (!a || a.selectedOptionId === null) return;
    isSwitch.push(i > 0 && orderedRefs[i - 1].skill !== ref.skill);
    isCorrect.push(!!a.isCorrect);
  });

  const switchOutcomes = isCorrect.filter((_, idx) => isSwitch[idx]);
  const nonSwitchOutcomes = isCorrect.filter((_, idx) => !isSwitch[idx]);

  if (switchOutcomes.length < MIN_SAMPLE || nonSwitchOutcomes.length < MIN_SAMPLE) {
    return { hasSufficientData: false, message: 'Not enough data yet to reliably measure the effect of topic switching.' };
  }

  const switchAccuracy = round1((switchOutcomes.filter(Boolean).length / switchOutcomes.length) * 100);
  const nonSwitchAccuracy = round1((nonSwitchOutcomes.filter(Boolean).length / nonSwitchOutcomes.length) * 100);
  const deltaPoints = round1(nonSwitchAccuracy - switchAccuracy);

  return {
    hasSufficientData: true,
    switchAccuracy,
    nonSwitchAccuracy,
    deltaPoints,
    message:
      deltaPoints >= MEANINGFUL_DELTA
        ? 'Performance decreases immediately after rapid topic switching.'
        : 'No meaningful performance drop detected after topic switches.',
  };
}

export interface AnswerChangeFinding {
  hasSufficientData: boolean;
  successCount?: number;
  totalChanges?: number;
  message: string;
}

const MIN_CHANGE_SAMPLE = 3;

export function analyzeAnswerChanges(answers: AnswerRecord[]): AnswerChangeFinding {
  const changed = answers.filter((a) => a.previousOptionIds.length > 0);
  if (changed.length < MIN_CHANGE_SAMPLE) {
    return { hasSufficientData: false, message: 'Not enough answer changes this session to draw a conclusion.' };
  }
  const successCount = changed.filter((a) => a.isCorrect).length;
  return {
    hasSufficientData: true,
    successCount,
    totalChanges: changed.length,
    message: `Answer changes were successful in ${successCount} of ${changed.length} cases.`,
  };
}
