import { describe, expect, it } from 'vitest';
import { analyzeBottleneck } from '../src/bottleneck/formulaBottleneckAnalyzer';
import { COMPETENCY_DIMENSIONS, CompetencyDimension, DimensionEvidence, FormulaStudentState } from '../src/types';

function emptyState(): FormulaStudentState {
  const dimensions = {} as Record<CompetencyDimension, DimensionEvidence>;
  for (const dim of COMPETENCY_DIMENSIONS) dimensions[dim] = { attempts: 0, correct: 0, recentOutcomes: [] };
  return {
    studentId: 'student-1',
    formulaId: 'fx-speed-distance-time',
    dimensions,
    supportLevel: 'FORMULA_SHOWN',
    independentStreak: 0,
    regressionFlag: false,
  };
}

function withEvidence(state: FormulaStudentState, dim: CompetencyDimension, outcomes: boolean[]): FormulaStudentState {
  state.dimensions[dim] = {
    attempts: outcomes.length,
    correct: outcomes.filter(Boolean).length,
    recentOutcomes: outcomes,
  };
  return state;
}

describe('analyzeBottleneck', () => {
  it('returns null when there is not enough evidence anywhere', () => {
    const state = withEvidence(emptyState(), 'selection', [false]); // 1 sample only
    expect(analyzeBottleneck(state)).toBeNull();
  });

  it('does not trigger off a single failed attempt out of the minimum sample size (spec section 180)', () => {
    const state = withEvidence(emptyState(), 'recall', [true, true, true, false]); // 4 samples, 75% - at the "not weak" line
    expect(analyzeBottleneck(state)).toBeNull();
  });

  it('picks recall when recall is weak, before considering later stages (spec section 67)', () => {
    let state = emptyState();
    state = withEvidence(state, 'recall', [false, false, true, false, false]);
    state = withEvidence(state, 'selection', [true, true, true, true, true]);
    const result = analyzeBottleneck(state);
    expect(result?.dimension).toBe('recall');
    expect(result?.suggestedActivity).toBe('RECALL');
  });

  it('moves on to selection once recall is strong (spec section 67: "Recall high, Selection low -> discrimination training")', () => {
    let state = emptyState();
    state = withEvidence(state, 'recall', [true, true, true, true, true]);
    state = withEvidence(state, 'selection', [false, true, false, false, true]);
    const result = analyzeBottleneck(state);
    expect(result?.dimension).toBe('selection');
    expect(result?.suggestedActivity).toBe('SELECT');
  });

  it('skips dimensions with insufficient evidence even if their raw accuracy looks low', () => {
    let state = emptyState();
    state = withEvidence(state, 'recall', [true, true, true, true, true]);
    state = withEvidence(state, 'selection', [false]); // only 1 sample - not trusted yet
    state = withEvidence(state, 'mapping', [false, false, false, false, false]);
    const result = analyzeBottleneck(state);
    expect(result?.dimension).toBe('mapping');
  });

  it('reports trend alongside the bottleneck', () => {
    let state = emptyState();
    state = withEvidence(state, 'recall', [false, false, false, false, false, true, true, true, true, true]);
    const result = analyzeBottleneck(state);
    // Overall accuracy across the window is still below threshold even though the second half improved.
    expect(result?.dimension).toBe('recall');
    expect(result?.trend).toBe('IMPROVING');
  });
});
