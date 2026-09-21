import { applyResponse, createInitialSkillEvidence, deriveCapabilityLabel, updateCapability } from '../../src/engine/evidence';
import { Question, ResponseRecord } from '../../src/domain/types';

const skillId = 'sk1';

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q',
    skillId,
    format: 'mcq',
    difficultyRating: 0,
    difficultyBand: 'medium',
    isTransferVariant: false,
    isValidated: true,
    qualityScore: 1,
    isFlagged: false,
    tags: [],
    expectedResponseTimeMs: 30000,
    ...overrides,
  };
}

function response(isCorrect: boolean, responseTimeMs: number, extra: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    id: 'r',
    sessionId: 's',
    questionId: 'q',
    skillId,
    difficultyRating: 0,
    isCorrect,
    responseTimeMs,
    answeredAt: new Date().toISOString(),
    ...extra,
  };
}

describe('deriveCapabilityLabel', () => {
  it('never labels a skill with zero evidence as anything other than unknown (spec section 11)', () => {
    expect(deriveCapabilityLabel(0, -5)).toBe('unknown');
    expect(deriveCapabilityLabel(0, 5)).toBe('unknown');
  });
});

describe('updateCapability', () => {
  it('increases ability on a correct response and decreases it on an incorrect one', () => {
    const up = updateCapability({ priorAbility: 0, priorUncertainty: 1, difficulty: 0, isCorrect: true, recentSurprises: [] });
    const down = updateCapability({ priorAbility: 0, priorUncertainty: 1, difficulty: 0, isCorrect: false, recentSurprises: [] });
    expect(up.ability).toBeGreaterThan(0);
    expect(down.ability).toBeLessThan(0);
  });

  it('flags instability when recent surprises swing wildly', () => {
    // Alternating strongly-correct-when-expected-wrong and vice versa.
    const first = updateCapability({ priorAbility: 0, priorUncertainty: 1, difficulty: -2, isCorrect: false, recentSurprises: [] });
    const second = updateCapability({
      priorAbility: first.ability,
      priorUncertainty: first.uncertainty,
      difficulty: 2,
      isCorrect: true,
      recentSurprises: first.updatedSurpriseWindow,
    });
    expect(second.isUnstable).toBe(true);
  });
});

describe('applyResponse', () => {
  it('flags needsSpeedCheck after a slow-but-correct response, then clears it after one controlled check', () => {
    let evidence = createInitialSkillEvidence(skillId);
    evidence = applyResponse(evidence, response(true, 60000), question()); // 60000/30000 = 2.0 -> slow
    expect(evidence.needsSpeedCheck).toBe(true);
    evidence = applyResponse(evidence, response(true, 30000), question({ id: 'q2' })); // 1.0 -> moderate, the dedicated check
    expect(evidence.needsSpeedCheck).toBe(false);
    expect(evidence.speedCheckDone).toBe(true);
  });

  it('flags needsRushInvestigation only after two consecutive fast-and-wrong responses (spec section 26)', () => {
    let evidence = createInitialSkillEvidence(skillId);
    evidence = applyResponse(evidence, response(false, 2000), question({ id: 'q1' }));
    expect(evidence.needsRushInvestigation).toBe(false);
    evidence = applyResponse(evidence, response(false, 2500), question({ id: 'q2' }));
    expect(evidence.needsRushInvestigation).toBe(true);
  });

  it('resets the rush streak once a response is not fast-and-wrong', () => {
    let evidence = createInitialSkillEvidence(skillId);
    evidence = applyResponse(evidence, response(false, 2000), question({ id: 'q1' }));
    evidence = applyResponse(evidence, response(true, 20000), question({ id: 'q2' }));
    expect(evidence.fastWrongStreak).toBe(0);
    expect(evidence.needsRushInvestigation).toBe(false);
  });

  it('flags a potential transfer gap when familiar performance is strong but a transfer item is missed (spec sections 15, 58)', () => {
    let evidence = createInitialSkillEvidence(skillId);
    for (let i = 0; i < 4; i++) {
      evidence = applyResponse(evidence, response(true, 20000), question({ id: `q-fam-${i}` }));
    }
    expect(evidence.potentialTransferGap).toBe(false);
    evidence = applyResponse(evidence, response(false, 20000, { questionId: 'qt' }), question({ id: 'qt', isTransferVariant: true }));
    expect(evidence.transferEvidenceCount).toBe(1);
    expect(evidence.potentialTransferGap).toBe(true);
  });

  it('does not flag a transfer gap when transfer performance matches familiar performance', () => {
    let evidence = createInitialSkillEvidence(skillId);
    for (let i = 0; i < 4; i++) {
      evidence = applyResponse(evidence, response(true, 20000), question({ id: `q-fam-${i}` }));
    }
    evidence = applyResponse(evidence, response(true, 20000, { questionId: 'qt' }), question({ id: 'qt', isTransferVariant: true }));
    expect(evidence.potentialTransferGap).toBe(false);
  });

  it('flags overconfidence after two high-confidence-wrong responses, without diagnosing the student (spec section 29)', () => {
    let evidence = createInitialSkillEvidence(skillId);
    evidence = applyResponse(evidence, response(false, 15000, { confidence: { level: 'high' } }), question({ id: 'q1' }));
    expect(evidence.calibrationFlag).toBe('none');
    evidence = applyResponse(evidence, response(false, 15000, { confidence: { level: 'high' } }), question({ id: 'q2' }));
    expect(evidence.calibrationFlag).toBe('overconfidence');
  });
});
