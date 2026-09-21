// Pacing Engine (spec sections 39, 62-65, 70): whole-session time budget
// tracking. Deliberately does NOT force equal time per question (spec 39) -
// it only compares aggregate elapsed-vs-budget pace.

export interface PacingState {
  totalQuestions: number;
  timeBudgetMs: number;
  elapsedMs: number;
  questionsCompleted: number;
  correctCount: number;
}

export type PaceStatus = 'AHEAD' | 'ON_TRACK' | 'BEHIND';

export interface PacingSummary {
  requiredPaceMsPerQuestion: number;
  actualPaceMsPerQuestion: number;
  paceStatus: PaceStatus;
  accuracy: number;
  message: string;
}

const PACE_TOLERANCE_RATIO = 0.1;
const STRONG_ACCURACY = 0.85;
const WEAK_ACCURACY = 0.75;

export function summarizePacing(state: PacingState, toleranceRatio: number = PACE_TOLERANCE_RATIO): PacingSummary {
  const requiredPace = state.totalQuestions > 0 ? state.timeBudgetMs / state.totalQuestions : 0;
  const actualPace = state.questionsCompleted > 0 ? state.elapsedMs / state.questionsCompleted : requiredPace;

  let paceStatus: PaceStatus = 'ON_TRACK';
  if (requiredPace > 0) {
    const diffRatio = (actualPace - requiredPace) / requiredPace;
    if (diffRatio > toleranceRatio) paceStatus = 'BEHIND';
    else if (diffRatio < -toleranceRatio) paceStatus = 'AHEAD';
  }

  const accuracy = state.questionsCompleted > 0 ? state.correctCount / state.questionsCompleted : 0;

  let message: string;
  if (paceStatus === 'BEHIND' && accuracy >= STRONG_ACCURACY) {
    message = 'You are behind your target pace, but your accuracy is strong. Consider moving through easier questions a little more quickly.';
  } else if (paceStatus === 'AHEAD' && accuracy < WEAK_ACCURACY) {
    message = "You're ahead of pace, but your accuracy has dropped. Slow down slightly.";
  } else if (paceStatus === 'BEHIND') {
    message = "You're behind pace - prioritize the questions you're most confident about.";
  } else if (paceStatus === 'AHEAD') {
    message = "You're ahead of pace with solid accuracy - keep this rhythm.";
  } else {
    message = "You're on pace.";
  }

  return { requiredPaceMsPerQuestion: requiredPace, actualPaceMsPerQuestion: actualPace, paceStatus, accuracy, message };
}
