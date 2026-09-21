import { describe, it, expect } from 'vitest';
import { evaluateMilestones, milestoneKey } from '../milestones/milestone-engine.js';
import { makeSkillState, makeGrowthEvent, daysAgoIso, NOW } from './helpers.js';

describe('evaluateMilestones', () => {
  it('awards FIRST_RECOVERY when a SKILL_RECOVERED event exists', () => {
    const events = [makeGrowthEvent({ eventType: 'SKILL_RECOVERED', skillId: 'debug-1', confidence: 'MODERATE', evidenceRefs: ['ev1', 'ev2'] })];
    const result = evaluateMilestones({ studentId: 'student-1', skillStates: [], events }, new Set(), NOW, () => 'm1');
    const recovery = result.find((m) => m.definitionId === 'FIRST_RECOVERY');
    expect(recovery).toBeDefined();
    expect(recovery?.skillId).toBe('debug-1');
  });

  it('never re-awards a milestone already in alreadyAwardedKeys — idempotency, section 57', () => {
    const events = [makeGrowthEvent({ eventType: 'SKILL_RECOVERED', skillId: 'debug-1' })];
    const already = new Set([milestoneKey('FIRST_RECOVERY', 'debug-1')]);
    const result = evaluateMilestones({ studentId: 'student-1', skillStates: [], events }, already, NOW, () => 'm2');
    expect(result.find((m) => m.definitionId === 'FIRST_RECOVERY')).toBeUndefined();
  });

  it('never awards a milestone from LOW-confidence evidence — section 30', () => {
    const events = [makeGrowthEvent({ eventType: 'SKILL_RECOVERED', skillId: 'debug-1', confidence: 'LOW' })];
    const result = evaluateMilestones({ studentId: 'student-1', skillStates: [], events }, new Set(), NOW, () => 'm3');
    expect(result.find((m) => m.definitionId === 'FIRST_RECOVERY')).toBeUndefined();
  });

  it('withholds SUSTAINED_DEBUGGING_IMPROVEMENT without a debuggingSkillIds taxonomy adapter — section 10/31', () => {
    const events = [
      makeGrowthEvent({ eventType: 'SKILL_RECOVERED', skillId: 'debug-1', timestamp: daysAgoIso(5, NOW) }),
      makeGrowthEvent({ eventType: 'SKILL_IMPROVED', skillId: 'debug-1', timestamp: NOW }),
    ];
    const result = evaluateMilestones({ studentId: 'student-1', skillStates: [], events }, new Set(), NOW, () => 'm4');
    expect(result.find((m) => m.definitionId === 'SUSTAINED_DEBUGGING_IMPROVEMENT')).toBeUndefined();
  });

  it('awards SUSTAINED_DEBUGGING_IMPROVEMENT once the adapter is supplied and two corroborating events exist', () => {
    const events = [
      makeGrowthEvent({ eventType: 'SKILL_RECOVERED', skillId: 'debug-1', timestamp: daysAgoIso(5, NOW) }),
      makeGrowthEvent({ eventType: 'SKILL_IMPROVED', skillId: 'debug-1', timestamp: NOW }),
    ];
    const result = evaluateMilestones({ studentId: 'student-1', skillStates: [], events, debuggingSkillIds: new Set(['debug-1']) }, new Set(), NOW, () => 'm5');
    expect(result.find((m) => m.definitionId === 'SUSTAINED_DEBUGGING_IMPROVEMENT')).toBeDefined();
  });

  it('awards STABLE_MASTERY_MULTI_CONTEXT for a mastered, high-confidence, strongly-transferred, retained skill', () => {
    const skillStates = [
      makeSkillState({
        skillId: 'arrays-1',
        state: 'MASTERED',
        confidence: { level: 'HIGH', score: 0.95, evidenceCount: 12, distinctSources: 4 },
        transfer: 'STRONG',
        retention: 'RETAINED',
      }),
    ];
    const result = evaluateMilestones({ studentId: 'student-1', skillStates, events: [] }, new Set(), NOW, () => 'm6');
    expect(result.find((m) => m.definitionId === 'STABLE_MASTERY_MULTI_CONTEXT')).toBeDefined();
  });

  it('never invents a milestone with no supporting event or state at all', () => {
    const result = evaluateMilestones({ studentId: 'student-1', skillStates: [], events: [] }, new Set(), NOW, () => 'm7');
    expect(result).toHaveLength(0);
  });
});
