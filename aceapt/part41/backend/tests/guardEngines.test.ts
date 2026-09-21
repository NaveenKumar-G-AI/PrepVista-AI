import { describe, it, expect } from 'vitest';
import { checkConstraints } from '../src/engines/guardEngines.js';
import { detectDrift } from '../src/engines/guardEngines.js';
import { baseContext, daysAgo } from './fixtures.js';

describe('checkConstraints (spec #37-39)', () => {
  it('passes when planned effort fits available hours', () => {
    const ctx = baseContext({ constraints: [{ id: 'c1', studentId: 's', type: 'time', description: '', hoursPerWeek: 20 }] });
    const result = checkConstraints(ctx, ['apply_to_opportunity']); // ~2h
    expect(result.ok).toBe(true);
    expect(result.overcommitted).toBe(false);
  });

  it('flags overcommitment when planned effort exceeds available hours', () => {
    const ctx = baseContext({ constraints: [{ id: 'c1', studentId: 's', type: 'time', description: '', hoursPerWeek: 5 }] });
    const result = checkConstraints(ctx, ['build_project', 'improve_skill']); // 8h + 5h = 13h > 5h
    expect(result.ok).toBe(false);
    expect(result.overcommitted).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('does not claim a violation when no time constraint has been stated', () => {
    const ctx = baseContext({ constraints: [] });
    const result = checkConstraints(ctx, ['build_project']);
    expect(result.availableHoursPerWeek).toBeNull();
    expect(result.ok).toBe(true);
  });
});

describe('detectDrift (spec #13-14)', () => {
  it('does not flag drift with too little recent activity to judge', () => {
    const ctx = baseContext({ recentActions: [] });
    const result = detectDrift(ctx);
    expect(result.driftDetected).toBe(false);
  });

  it('flags drift when recent actions are mostly unrelated to the goal', () => {
    const ctx = baseContext({
      goal: { id: 'g1', studentId: 's', targetRole: 'Backend Engineer', requiredSkills: ['backend', 'databases', 'apis'], createdAt: daysAgo(90), active: true },
      recentActions: [
        { id: 'a1', strategyId: 's1', kind: 'gather_information', title: 'Photography certification', status: 'completed', valueTier: 'low', reasoning: '', createdAt: daysAgo(5) },
        { id: 'a2', strategyId: 's1', kind: 'gather_information', title: 'Unrelated marketing course', status: 'completed', valueTier: 'low', reasoning: '', createdAt: daysAgo(4) },
        { id: 'a3', strategyId: 's1', kind: 'gather_information', title: 'Cooking class', status: 'completed', valueTier: 'low', reasoning: '', createdAt: daysAgo(3) },
        { id: 'a4', strategyId: 's1', kind: 'gather_information', title: 'Language app streak', status: 'completed', valueTier: 'low', reasoning: '', createdAt: daysAgo(2) },
      ],
    });
    const result = detectDrift(ctx);
    expect(result.driftDetected).toBe(true);
    expect(result.explanation).toContain('Backend Engineer');
  });

  it('does not flag drift when recent actions clearly connect to the goal', () => {
    const ctx = baseContext({
      goal: { id: 'g1', studentId: 's', targetRole: 'Backend Engineer', requiredSkills: ['backend', 'databases', 'apis'], createdAt: daysAgo(90), active: true },
      recentActions: [
        { id: 'a1', strategyId: 's1', kind: 'build_project', title: 'Backend API project', status: 'completed', valueTier: 'high', reasoning: '', createdAt: daysAgo(5) },
        { id: 'a2', strategyId: 's1', kind: 'apply_to_opportunity', title: 'Apply to backend internship', status: 'completed', valueTier: 'high', reasoning: '', createdAt: daysAgo(4) },
        { id: 'a3', strategyId: 's1', kind: 'improve_skill', title: 'Databases deep-dive', status: 'completed', valueTier: 'medium', reasoning: '', createdAt: daysAgo(3) },
        { id: 'a4', strategyId: 's1', kind: 'practice_weak_area', title: 'Backend interview practice', status: 'completed', valueTier: 'medium', reasoning: '', createdAt: daysAgo(2) },
      ],
    });
    const result = detectDrift(ctx);
    expect(result.driftDetected).toBe(false);
  });
});
