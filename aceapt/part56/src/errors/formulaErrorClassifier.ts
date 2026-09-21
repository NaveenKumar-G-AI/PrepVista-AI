import { FormulaErrorType, TrainingActivityType } from '../types';

/**
 * Per-attempt sub-checks used to classify a formula-related mistake (spec
 * sections 35-46, 205-215). Not every field applies to every activity type
 * - callers set only the checks relevant to what was actually being tested.
 */
export interface AttemptChecks {
  activityType: TrainingActivityType;
  /** RECALL/SELECT: did the student land on the objectively correct formula? */
  formulaCorrect?: boolean;
  /**
   * Only meaningful when formulaCorrect === false. True if the formula the
   * student picked instead is a known related/confusable formula (a
   * condition mistake) rather than an unrelated formula (a plain
   * recall/selection lapse). See spec sections 18-19, 39, 42, 211.
   */
  chosenFormulaRelatedToExpected?: boolean;
  mappingCorrect?: boolean;
  rearrangementCorrect?: boolean;
  arithmeticCorrect?: boolean;
  verificationCorrect?: boolean;
}

/**
 * Returns the FIRST failing check in causal order - formula identity, then
 * mapping, then rearrangement, then arithmetic, then verification - never a
 * list of every downstream symptom. This directly implements the "first
 * formula error" rule (spec sections 36, 116, 246): if the formula itself
 * is wrong, we do not also report a mapping error just because the numbers
 * ended up in the wrong slots of the wrong formula.
 */
export function classifyFormulaError(checks: AttemptChecks): FormulaErrorType | null {
  const { activityType } = checks;

  if (activityType === 'RECALL' && checks.formulaCorrect === false) {
    return 'FORMULA_RECALL_ERROR';
  }

  if (activityType === 'SELECT' && checks.formulaCorrect === false) {
    return checks.chosenFormulaRelatedToExpected ? 'FORMULA_CONDITION_ERROR' : 'FORMULA_SELECTION_ERROR';
  }

  if (checks.mappingCorrect === false) {
    return 'VARIABLE_MAPPING_ERROR';
  }

  if (checks.rearrangementCorrect === false) {
    return 'FORMULA_REARRANGEMENT_ERROR';
  }

  if (checks.arithmeticCorrect === false) {
    return 'FORMULA_APPLICATION_ERROR';
  }

  if (activityType === 'VERIFY' && checks.verificationCorrect === false) {
    return 'FORMULA_VERIFICATION_ERROR';
  }

  return null;
}

const TRANSFER_GAP_THRESHOLD = 0.25;
const RETENTION_GAP_THRESHOLD = 0.25;
const MIN_SAMPLES = 3;

/** spec sections 45, 124, 214: direct problems succeed, novel structure fails. */
export function detectTransferGap(
  directAccuracy: number,
  directSamples: number,
  novelAccuracy: number,
  novelSamples: number,
): boolean {
  if (directSamples < MIN_SAMPLES || novelSamples < MIN_SAMPLES) return false;
  return directAccuracy - novelAccuracy >= TRANSFER_GAP_THRESHOLD;
}

/** spec sections 46, 125-126, 184, 215: immediate success, delayed failure. */
export function detectRetentionGap(
  immediateAccuracy: number,
  immediateSamples: number,
  delayedAccuracy: number,
  delayedSamples: number,
): boolean {
  if (immediateSamples < MIN_SAMPLES || delayedSamples < MIN_SAMPLES) return false;
  return immediateAccuracy - delayedAccuracy >= RETENTION_GAP_THRESHOLD;
}
