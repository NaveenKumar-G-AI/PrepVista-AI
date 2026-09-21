import { selectMode } from '../../src/engine/modeSelector';
import { SKILLS } from '../../src/infra/seedFixtures';
import { createInitialSkillEvidence } from '../../src/engine/evidence';
import { AdaptiveDiagnosticState } from '../../src/domain/state';

function baseState(overrides: Partial<AdaptiveDiagnosticState> = {}): AdaptiveDiagnosticState {
  const skillEvidence: AdaptiveDiagnosticState['skillEvidence'] = {};
  for (const s of SKILLS) skillEvidence[s.id] = createInitialSkillEvidence(s.id);
  return {
    sessionId: 's1',
    student: { studentId: 'stu' },
    config: {
      objective: 'general_baseline',
      requiredDomains: ['Quant'],
      minQuestionsPerDomain: 0,
      maxQuestions: 30,
      minQuestions: 5,
      targetEvidenceConfidence: 'moderate',
    },
    status: 'in_progress',
    skillEvidence,
    coverage: { Quant: { domain: 'Quant', questionsAsked: 10, minimumRequired: 0, satisfied: true } },
    exposure: {},
    patternExposure: {},
    recentResponses: [],
    fatigue: { responseTimeTrend: 'stable', accuracyTrend: 'stable', consecutiveFastGuesses: 0, severity: 'none', recommendPause: false },
    decisionLog: [],
    askedQuestionIds: [],
    questionsAsked: 10,
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('selectMode - spec worked examples', () => {
  it('example 75: favors the unknown mixed skill once other Quant skills already have evidence', () => {
    const state = baseState();
    state.skillEvidence['quant.arithmetic.percentage'] = {
      ...state.skillEvidence['quant.arithmetic.percentage'],
      evidenceCount: 5,
      correctCount: 5,
      estimate: 1.4,
      uncertainty: 0.3,
      confidenceLabel: 'high',
      capabilityLabel: 'advanced',
    };
    state.skillEvidence['quant.arithmetic.ratio'] = {
      ...state.skillEvidence['quant.arithmetic.ratio'],
      evidenceCount: 3,
      correctCount: 2,
      estimate: 0.2,
      uncertainty: 0.5,
      confidenceLabel: 'moderate',
      capabilityLabel: 'developing',
    };
    // percentage_ratio_mixed, probability, and algebra remain at zero evidence.

    const decision = selectMode(state, SKILLS);
    expect(decision.mode).toBe('explore');
    expect(decision.targetSkillId).toBe('quant.arithmetic.percentage_ratio_mixed');
  });

  it('example 76: an all-correct streak triggers challenge, not another easy question', () => {
    const state = baseState();
    for (const id of ['quant.arithmetic.percentage', 'quant.arithmetic.ratio', 'quant.arithmetic.percentage_ratio_mixed', 'quant.algebra.core']) {
      state.skillEvidence[id] = {
        ...state.skillEvidence[id],
        evidenceCount: 3,
        correctCount: 3,
        estimate: 1.5,
        uncertainty: 0.3,
        confidenceLabel: 'high',
        capabilityLabel: 'advanced',
      };
    }
    state.skillEvidence['quant.arithmetic.probability'] = {
      ...state.skillEvidence['quant.arithmetic.probability'],
      evidenceCount: 4,
      correctCount: 4,
      estimate: 2.0,
      uncertainty: 0.25,
      confidenceLabel: 'high',
      capabilityLabel: 'advanced',
      recentCorrectStreakAtOrAboveBoundary: 4,
      upperBoundaryDifficulty: 2,
    };

    const decision = selectMode(state, SKILLS);
    expect(decision.mode).toBe('challenge');
    expect(decision.targetSkillId).toBe('quant.arithmetic.probability');
  });

  it('example 77: alternating correct/wrong triggers verify, not a harder question', () => {
    const state = baseState({
      config: { ...baseState().config, requiredDomains: ['Verbal'] },
      coverage: { Verbal: { domain: 'Verbal', questionsAsked: 4, minimumRequired: 0, satisfied: true } },
    });
    state.skillEvidence['verbal.grammar.core'] = {
      ...state.skillEvidence['verbal.grammar.core'],
      evidenceCount: 4,
      correctCount: 2,
      incorrectCount: 2,
      estimate: 0,
      uncertainty: 0.8,
      isUnstable: true,
      confidenceLabel: 'low',
      capabilityLabel: 'developing',
    };

    const decision = selectMode(state, SKILLS);
    expect(decision.mode).toBe('verify');
    expect(decision.targetSkillId).toBe('verbal.grammar.core');
  });

  it('example 80: a skill with no evidence is explored, never pre-labeled weak', () => {
    const state = baseState();
    const decision = selectMode(state, SKILLS);
    expect(decision.mode).toBe('explore');
    expect(state.skillEvidence[decision.targetSkillId].capabilityLabel).toBe('unknown');
  });

  it('a strong, confident, correct-but-slow streak triggers investigate (speed check) instead of challenge', () => {
    const state = baseState();
    for (const id of ['quant.arithmetic.percentage', 'quant.arithmetic.ratio', 'quant.arithmetic.percentage_ratio_mixed', 'quant.algebra.core']) {
      // High confidence but no challenge streak and transfer already
      // resolved cleanly, so these skills are neither challenge- nor
      // transfer-ready and don't mask the assertion below.
      state.skillEvidence[id] = {
        ...state.skillEvidence[id],
        evidenceCount: 3,
        correctCount: 3,
        estimate: 1.5,
        uncertainty: 0.3,
        confidenceLabel: 'high',
        capabilityLabel: 'advanced',
        transferEvidenceCount: 2,
        transferCorrectCount: 2,
      };
    }
    state.skillEvidence['quant.arithmetic.probability'] = {
      ...state.skillEvidence['quant.arithmetic.probability'],
      evidenceCount: 4,
      correctCount: 4,
      estimate: 2.0,
      uncertainty: 0.25,
      confidenceLabel: 'high',
      capabilityLabel: 'advanced',
      recentCorrectStreakAtOrAboveBoundary: 4,
      upperBoundaryDifficulty: 2,
      needsSpeedCheck: true,
    };

    const decision = selectMode(state, SKILLS);
    expect(decision.mode).toBe('investigate');
    expect(decision.targetSkillId).toBe('quant.arithmetic.probability');
  });

  it('coverage guardrail forces an under-covered domain once the question budget gets tight', () => {
    const state = baseState({
      config: { objective: 'general_baseline', requiredDomains: ['Quant', 'Verbal'], minQuestionsPerDomain: 2, maxQuestions: 4, minQuestions: 4, targetEvidenceConfidence: 'moderate' },
      coverage: {
        Quant: { domain: 'Quant', questionsAsked: 2, minimumRequired: 2, satisfied: true },
        Verbal: { domain: 'Verbal', questionsAsked: 0, minimumRequired: 2, satisfied: false },
      },
      questionsAsked: 2,
    });
    // Quant skills all look strong and would otherwise trigger challenge/transfer.
    for (const id of ['quant.arithmetic.percentage', 'quant.arithmetic.ratio', 'quant.arithmetic.percentage_ratio_mixed', 'quant.arithmetic.probability', 'quant.algebra.core']) {
      state.skillEvidence[id] = { ...state.skillEvidence[id], evidenceCount: 3, correctCount: 3, estimate: 1.5, uncertainty: 0.3, confidenceLabel: 'high', capabilityLabel: 'advanced', recentCorrectStreakAtOrAboveBoundary: 3, upperBoundaryDifficulty: 1.5 };
    }

    const decision = selectMode(state, SKILLS);
    expect(decision.domainScope).toEqual(['Verbal']);
    expect(decision.targetSkillId).toBe('verbal.grammar.core');
  });
});
