import { describe, it, expect } from 'vitest';
import { assessStrategyHealth } from '../src/engines/strategyHealthEngine.js';
import { extractSignals } from '../src/engines/signalEngine.js';
import { detectDrift } from '../src/engines/guardEngines.js';
import { baseContext } from './fixtures.js';

describe('strategyHealthEngine (spec #11-12)', () => {
  it('returns insufficient_data when almost nothing is known yet', () => {
    const ctx = baseContext({ goal: null, evidence: [], opportunities: [], recentActions: [] });
    const signals = extractSignals(ctx);
    const drift = detectDrift(ctx);
    const health = assessStrategyHealth(ctx, signals, drift);
    expect(health.overallStatus).toBe('insufficient_data');
  });

  it('marks direction as poor and overall as shift_recommended when there is no goal', () => {
    const ctx = baseContext({
      goal: null,
      evidence: [{ id: 'e1', type: 'project', title: 'A', skillTags: ['x'], strength: 'strong', createdAt: new Date().toISOString() }],
      opportunities: [{ id: 'o1', title: 'Role', type: 'internship', relevanceToGoal: 0.5, applied: false }],
      recentActions: [{ id: 'a1', strategyId: 's1', kind: 'gather_information', title: 'x', status: 'completed', valueTier: 'low', reasoning: '', createdAt: new Date().toISOString() }],
    });
    const signals = extractSignals(ctx);
    const drift = detectDrift(ctx);
    const health = assessStrategyHealth(ctx, signals, drift);
    expect(health.direction.status).toBe('poor');
    expect(health.overallStatus).toBe('shift_recommended');
  });

  it('does not collapse the six dimensions into a single blended score (spec: keep them distinct)', () => {
    const ctx = baseContext({
      evidence: [{ id: 'e1', type: 'project', title: 'A', skillTags: ['backend'], strength: 'strong', createdAt: new Date().toISOString() }],
    });
    const signals = extractSignals(ctx);
    const drift = detectDrift(ctx);
    const health = assessStrategyHealth(ctx, signals, drift);
    const dims = [health.direction, health.readiness, health.evidence, health.opportunity, health.execution, health.adaptation];
    expect(dims).toHaveLength(6);
    for (const d of dims) {
      expect(['good', 'fair', 'poor', 'unknown']).toContain(d.status);
      expect(typeof d.explanation).toBe('string');
      expect(d.explanation.length).toBeGreaterThan(0);
    }
  });
});
