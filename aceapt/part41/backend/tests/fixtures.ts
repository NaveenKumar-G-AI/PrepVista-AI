import type { StrategyContext } from '../src/types/strategy.js';

export function baseContext(overrides: Partial<StrategyContext> = {}): StrategyContext {
  return {
    studentId: 'test-student',
    goal: {
      id: 'goal-1',
      studentId: 'test-student',
      targetRole: 'Backend Engineer',
      requiredSkills: ['backend', 'databases', 'apis'],
      createdAt: new Date().toISOString(),
      active: true,
    },
    skills: [],
    evidence: [],
    opportunities: [],
    applications: [],
    recentDecisions: [],
    recentOutcomes: [],
    constraints: [],
    currentStrategy: { id: 'strategy-1', studentId: 'test-student', currentVersionId: null, status: 'insufficient_data', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    currentVersion: null,
    recentActions: [],
    priorities: {},
    asOf: new Date().toISOString(),
    ...overrides,
  };
}

export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

export function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString();
}
