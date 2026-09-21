import { evaluateStopping } from '../../src/engine/stoppingCriteria';
import { SKILLS } from '../../src/infra/seedFixtures';
import { createInitialSkillEvidence } from '../../src/engine/evidence';
import { AdaptiveDiagnosticState } from '../../src/domain/state';

const quantSkills = SKILLS.filter((s) => s.domain === 'Quant');

function stateWith(overrides: Partial<AdaptiveDiagnosticState>): AdaptiveDiagnosticState {
  const skillEvidence: AdaptiveDiagnosticState['skillEvidence'] = {};
  for (const s of quantSkills) skillEvidence[s.id] = createInitialSkillEvidence(s.id);
  return {
    sessionId: 's1',
    student: { studentId: 'stu' },
    config: { objective: 'general_baseline', requiredDomains: ['Quant'], minQuestionsPerDomain: 0, maxQuestions: 20, minQuestions: 5, targetEvidenceConfidence: 'moderate' },
    status: 'in_progress',
    skillEvidence,
    coverage: { Quant: { domain: 'Quant', questionsAsked: 0, minimumRequired: 0, satisfied: true } },
    exposure: {},
    patternExposure: {},
    recentResponses: [],
    fatigue: { responseTimeTrend: 'stable', accuracyTrend: 'stable', consecutiveFastGuesses: 0, severity: 'none', recommendPause: false },
    decisionLog: [],
    askedQuestionIds: [],
    questionsAsked: 0,
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function markAllHighConfidence(state: AdaptiveDiagnosticState) {
  for (const s of quantSkills) {
    state.skillEvidence[s.id] = { ...state.skillEvidence[s.id], evidenceCount: 5, correctCount: 4, confidenceLabel: 'high', capabilityLabel: 'proficient' };
  }
}

describe('evaluateStopping', () => {
  it('stops at the hard question cap regardless of evidence state', () => {
    const state = stateWith({ questionsAsked: 20, config: { objective: 'general_baseline', requiredDomains: ['Quant'], minQuestionsPerDomain: 0, maxQuestions: 20, minQuestions: 5, targetEvidenceConfidence: 'moderate' } });
    const result = evaluateStopping(state, quantSkills, 0.5);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('max_questions_reached');
  });

  it('does not stop before minQuestions even if evidence already looks sufficient', () => {
    const state = stateWith({ questionsAsked: 2 });
    markAllHighConfidence(state);
    const result = evaluateStopping(state, quantSkills, 0.5);
    expect(result.shouldStop).toBe(false);
  });

  it('stops early once minQuestions is met and every in-scope skill has sufficient evidence (spec section 38)', () => {
    const state = stateWith({ questionsAsked: 6 });
    markAllHighConfidence(state);
    const result = evaluateStopping(state, quantSkills, 0.5);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('sufficient_evidence');
  });

  it('continues past minQuestions when a skill still needs a speed check even if confidence is high', () => {
    const state = stateWith({ questionsAsked: 6 });
    markAllHighConfidence(state);
    const firstSkillId = quantSkills[0].id;
    state.skillEvidence[firstSkillId] = { ...state.skillEvidence[firstSkillId], needsSpeedCheck: true };
    const result = evaluateStopping(state, quantSkills, 0.5);
    expect(result.shouldStop).toBe(false);
  });

  it('stops on diminishing returns once past minQuestions even without full evidence sufficiency', () => {
    const state = stateWith({ questionsAsked: 6 });
    const result = evaluateStopping(state, quantSkills, 0.001);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('diminishing_returns');
  });

  it('recommends a pause on severe fatigue without forcing a stop (spec section 40)', () => {
    const state = stateWith({ questionsAsked: 6, fatigue: { responseTimeTrend: 'increasing', accuracyTrend: 'declining', consecutiveFastGuesses: 0, severity: 'high', recommendPause: true } });
    const result = evaluateStopping(state, quantSkills, 0.5);
    expect(result.shouldStop).toBe(false);
    expect(result.reason).toBe('fatigue_pause_recommended');
  });
});
