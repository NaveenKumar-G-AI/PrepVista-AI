import { fisherInformation, scoreCandidate } from '../../src/engine/informationValue';
import { Question } from '../../src/domain/types';
import { SkillEvidence } from '../../src/domain/state';

function baseQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    skillId: 's1',
    format: 'mcq',
    difficultyRating: 0,
    difficultyBand: 'medium',
    isTransferVariant: false,
    isValidated: true,
    qualityScore: 1,
    isFlagged: false,
    tags: [],
    ...overrides,
  };
}

const emptyState = { exposure: {}, patternExposure: {} };

function evidence(overrides: Partial<SkillEvidence> = {}): SkillEvidence {
  return {
    skillId: 's1',
    estimate: 0,
    uncertainty: 1,
    surpriseWindow: [],
    evidenceCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    isUnstable: false,
    capabilityLabel: 'unknown',
    confidenceLabel: 'low',
    upperBoundaryDifficulty: 0,
    recentCorrectStreakAtOrAboveBoundary: 0,
    transferEvidenceCount: 0,
    transferCorrectCount: 0,
    potentialTransferGap: false,
    speedStatus: 'unknown',
    relativeResponseTimeEma: 1,
    speedCheckDone: false,
    needsSpeedCheck: false,
    fastWrongStreak: 0,
    needsRushInvestigation: false,
    highConfidenceWrongStreak: 0,
    lowConfidenceCorrectStreak: 0,
    calibrationFlag: 'none',
    initializedFromHistory: false,
    history: [],
    lastUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('fisherInformation', () => {
  it('peaks when difficulty equals ability', () => {
    const atMatch = fisherInformation(0, 0);
    const farAbove = fisherInformation(0, 3);
    const farBelow = fisherInformation(0, -3);
    expect(atMatch).toBeCloseTo(0.25, 5);
    expect(atMatch).toBeGreaterThan(farAbove);
    expect(atMatch).toBeGreaterThan(farBelow);
  });
});

describe('scoreCandidate', () => {
  it('boosts unexplored skills heavily relative to an already-confident one in investigate mode', () => {
    const unexploredScore = scoreCandidate(baseQuestion(), { mode: 'explore', targetSkillId: 's1', state: emptyState, skillEvidence: undefined });
    const exploredScore = scoreCandidate(baseQuestion(), {
      mode: 'investigate',
      targetSkillId: 's1',
      state: emptyState,
      skillEvidence: evidence({ evidenceCount: 5, confidenceLabel: 'high' }),
    });
    expect(unexploredScore).toBeGreaterThan(exploredScore);
  });

  it('penalizes a previously-exposed question relative to a fresh one', () => {
    const fresh = scoreCandidate(baseQuestion(), { mode: 'investigate', targetSkillId: 's1', state: emptyState, skillEvidence: undefined });
    const exposedState = { exposure: { q1: 2 }, patternExposure: {} };
    const exposed = scoreCandidate(baseQuestion(), { mode: 'investigate', targetSkillId: 's1', state: exposedState, skillEvidence: undefined });
    expect(exposed).toBeLessThan(fresh);
  });

  it('assigns a flagged (bad) question a score of exactly zero, never merely a lower score (spec section 33)', () => {
    const score = scoreCandidate(baseQuestion({ isFlagged: true }), { mode: 'investigate', targetSkillId: 's1', state: emptyState, skillEvidence: undefined });
    expect(score).toBe(0);
  });

  it('favors a question above the recorded upper boundary in challenge mode', () => {
    const strongEvidence = evidence({ estimate: 1.5, uncertainty: 0.2, evidenceCount: 5, upperBoundaryDifficulty: 1, confidenceLabel: 'high' });
    const belowBoundary = scoreCandidate(baseQuestion({ id: 'below', difficultyRating: 0.5 }), { mode: 'challenge', targetSkillId: 's1', state: emptyState, skillEvidence: strongEvidence });
    const aboveBoundary = scoreCandidate(baseQuestion({ id: 'above', difficultyRating: 1.8 }), { mode: 'challenge', targetSkillId: 's1', state: emptyState, skillEvidence: strongEvidence });
    expect(aboveBoundary).toBeGreaterThan(belowBoundary);
  });

  it('favors a transfer-variant question over a standard one in transfer mode', () => {
    const strongEvidence = evidence({ estimate: 1.2, uncertainty: 0.3, evidenceCount: 5, confidenceLabel: 'high' });
    const standard = scoreCandidate(baseQuestion({ id: 'standard' }), { mode: 'transfer', targetSkillId: 's1', state: emptyState, skillEvidence: strongEvidence });
    const transfer = scoreCandidate(baseQuestion({ id: 'transfer', isTransferVariant: true }), { mode: 'transfer', targetSkillId: 's1', state: emptyState, skillEvidence: strongEvidence });
    expect(transfer).toBeGreaterThan(standard);
  });
});
