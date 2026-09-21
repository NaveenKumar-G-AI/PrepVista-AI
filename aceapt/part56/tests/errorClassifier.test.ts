import { describe, expect, it } from 'vitest';
import { classifyFormulaError, detectRetentionGap, detectTransferGap } from '../src/errors/formulaErrorClassifier';

describe('classifyFormulaError', () => {
  it('classifies a recall failure', () => {
    expect(classifyFormulaError({ activityType: 'RECALL', formulaCorrect: false })).toBe('FORMULA_RECALL_ERROR');
  });

  it('classifies picking an unrelated formula as a selection error', () => {
    expect(classifyFormulaError({ activityType: 'SELECT', formulaCorrect: false, chosenFormulaRelatedToExpected: false })).toBe(
      'FORMULA_SELECTION_ERROR',
    );
  });

  it('classifies picking a related-but-wrong formula as a condition error', () => {
    expect(classifyFormulaError({ activityType: 'SELECT', formulaCorrect: false, chosenFormulaRelatedToExpected: true })).toBe(
      'FORMULA_CONDITION_ERROR',
    );
  });

  it('classifies right formula, wrong mapping as a mapping error (spec test 209), not an application error', () => {
    expect(
      classifyFormulaError({
        activityType: 'APPLY',
        formulaCorrect: true,
        mappingCorrect: false,
        arithmeticCorrect: false, // downstream of the mapping mistake - must not surface separately
      }),
    ).toBe('VARIABLE_MAPPING_ERROR');
  });

  it('classifies right formula and mapping, wrong arithmetic as an application error (spec test 210)', () => {
    expect(
      classifyFormulaError({
        activityType: 'APPLY',
        formulaCorrect: true,
        mappingCorrect: true,
        rearrangementCorrect: true,
        arithmeticCorrect: false,
      }),
    ).toBe('FORMULA_APPLICATION_ERROR');
  });

  it('classifies the correct canonical formula used with the wrong rearranged form (spec test 212)', () => {
    expect(
      classifyFormulaError({
        activityType: 'APPLY',
        formulaCorrect: true,
        mappingCorrect: true,
        rearrangementCorrect: false,
        arithmeticCorrect: false,
      }),
    ).toBe('FORMULA_REARRANGEMENT_ERROR');
  });

  it('classifies a final answer that violates the relationship as a verification error (spec test 213)', () => {
    expect(classifyFormulaError({ activityType: 'VERIFY', verificationCorrect: false })).toBe('FORMULA_VERIFICATION_ERROR');
  });

  it('returns null when every relevant check passes', () => {
    expect(
      classifyFormulaError({
        activityType: 'APPLY',
        formulaCorrect: true,
        mappingCorrect: true,
        rearrangementCorrect: true,
        arithmeticCorrect: true,
      }),
    ).toBeNull();
  });
});

describe('transfer and retention gap detection', () => {
  it('does not flag a transfer gap without enough samples (spec section 180: never from too little evidence)', () => {
    expect(detectTransferGap(0.9, 2, 0.4, 2)).toBe(false);
  });

  it('flags a transfer gap when direct succeeds and novel fails with enough samples (spec test 214)', () => {
    expect(detectTransferGap(0.9, 5, 0.4, 5)).toBe(true);
  });

  it('flags a retention gap when immediate succeeds and delayed fails (spec test 215)', () => {
    expect(detectRetentionGap(0.9, 5, 0.3, 4)).toBe(true);
  });

  it('does not flag a retention gap when performance holds up', () => {
    expect(detectRetentionGap(0.9, 5, 0.85, 5)).toBe(false);
  });
});
