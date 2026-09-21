import { ProblemContext, RoleContext } from '../types';
import { THRESHOLDS } from '../config';

type Thresholds = typeof THRESHOLDS;

/**
 * A single, shared threshold set adjusted by context — NOT a second quality engine.
 * A short algorithm challenge should not receive the same scrutiny as a multi-file
 * project; role context shifts what tends to matter without changing which rules exist.
 */
export function applyContextualPolicy(base: Thresholds, problem?: ProblemContext, role?: RoleContext): Thresholds {
  const adjusted: Thresholds = { ...base };

  if (problem?.scope === 'ALGORITHM_CHALLENGE') {
    adjusted.LONG_FUNCTION_LINES = Math.round(base.LONG_FUNCTION_LINES * 1.3);
    adjusted.EXCESSIVE_PARAMS = base.EXCESSIVE_PARAMS + 1;
    adjusted.GOD_FUNCTION_MIN_CATEGORIES = base.GOD_FUNCTION_MIN_CATEGORIES + 1;
  } else if (problem?.scope === 'MULTI_FILE_PROJECT') {
    adjusted.LONG_FUNCTION_LINES = Math.round(base.LONG_FUNCTION_LINES * 0.9);
  }

  if (role?.role === 'DATA_SCIENTIST' || role?.role === 'ML_ENGINEER') {
    // Hyperparameter-style literals are idiomatic in this domain; require more repeats
    // before treating a numeric literal as a maintainability concern.
    adjusted.MAGIC_NUMBER_REPEAT_FOR_MEDIUM = base.MAGIC_NUMBER_REPEAT_FOR_MEDIUM + 2;
  }

  return adjusted;
}
