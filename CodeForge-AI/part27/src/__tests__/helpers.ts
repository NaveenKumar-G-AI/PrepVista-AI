import type { RawEvidenceInput } from '../types/evidence.js';

let counter = 0;

/** Builds a valid RawEvidenceInput with sensible defaults — override only what a test cares about. */
export function makeRawEvidence(overrides: Partial<RawEvidenceInput> & { skillId: string }): RawEvidenceInput {
  counter += 1;
  return {
    studentId: 'student-1',
    source: 'correctness',
    sourceRecordId: `sub-${counter}`,
    evidenceType: 'DETERMINISTIC',
    outcome: 'positive',
    strength: 1,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function daysAgoIso(days: number, fromIso: string): string {
  return new Date(new Date(fromIso).getTime() - days * 86_400_000).toISOString();
}

export const NOW = '2026-08-20T00:00:00.000Z';

export function makeSkillState(overrides: Partial<import('../types/skill-state.js').SkillState> & { skillId: string }): import('../types/skill-state.js').SkillState {
  return {
    studentId: 'student-1',
    state: 'PROFICIENT',
    performanceScore: 0.8,
    confidence: { level: 'MODERATE', score: 0.6, evidenceCount: 5, distinctSources: 2 },
    trajectory: 'STABLE',
    retention: 'RETAINED',
    transfer: 'MODERATE',
    regressionSeverity: null,
    firstDemonstrated: NOW,
    lastDemonstrated: NOW,
    lastStrongEvidence: NOW,
    evidenceRefs: ['ev1'],
    evidenceCount: 5,
    growthModelVersion: '2026.08.1',
    rulesVersion: '2026.08.1',
    computedAt: NOW,
    ...overrides,
  };
}

export function makeGrowthEvent(
  overrides: Partial<import('../types/growth-event.js').GrowthEvent> & { eventType: import('../types/growth-event.js').GrowthEventType },
): import('../types/growth-event.js').GrowthEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
    studentId: 'student-1',
    skillId: null,
    timestamp: NOW,
    evidenceRefs: ['ev1'],
    confidence: 'MODERATE',
    previousState: null,
    newState: null,
    explanation: 'test event',
    modelVersion: '2026.08.1',
    ...overrides,
  };
}
