import { StudentState } from '../domain/types';
import { COLD_START_MIN_HISTORY } from '../config';

/**
 * A new student has no intervention history to personalize from. Callers
 * use this to fall back to general problem-fit rules (already what ranking
 * does by default via the COLD_START flag) and to soften the language used
 * in explanations rather than claiming a personalized pattern that doesn't
 * exist yet (Section 47: "do not fake personalization").
 */
export function isColdStart(state: StudentState): boolean {
  return state.interventionHistory.length < COLD_START_MIN_HISTORY;
}
