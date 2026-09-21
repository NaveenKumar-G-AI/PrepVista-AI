import { describe, it, expect } from 'vitest';
import { classifyAssistanceNeed } from '../src/domain/engine/assistanceClassifier.js';

describe('classifyAssistanceNeed (Sections 35-38: right kind of help, not a generic re-teach)', () => {
  it('Section 36: "I know the formula but don\'t know what to plug in" -> INTERPRETATION, not CONCEPT', () => {
    expect(classifyAssistanceNeed({ studentNote: "I know the formula but don't know what to plug in" })).toBe('INTERPRETATION');
  });
  it('Section 37: "I keep getting the arithmetic wrong" -> CALCULATION, not FORMULA', () => {
    expect(classifyAssistanceNeed({ studentNote: 'I know what to calculate but I keep getting the arithmetic wrong' })).toBe('CALCULATION');
  });
  it('Section 38: "I have no idea what to do" -> STRATEGY, not a final answer', () => {
    expect(classifyAssistanceNeed({ studentNote: 'I have no idea what to do' })).toBe('STRATEGY');
  });
  it('falls back to inferring from the validator result when there is no useful note', () => {
    expect(classifyAssistanceNeed({ lastResult: 'UNIT_ERROR' })).toBe('UNIT');
    expect(classifyAssistanceNeed({ lastResult: 'FORMAT_ERROR' })).toBe('INTERPRETATION');
  });
});
