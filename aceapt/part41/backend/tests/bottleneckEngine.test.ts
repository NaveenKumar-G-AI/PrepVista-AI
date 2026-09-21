import { describe, it, expect } from 'vitest';
import { detectPrimaryBottleneck } from '../src/engines/bottleneckEngine.js';
import { extractSignals } from '../src/engines/signalEngine.js';
import { baseContext, daysAgo } from './fixtures.js';

describe('bottleneckEngine', () => {
  it('returns null when there is no corroborating evidence for any rule', () => {
    const ctx = baseContext({
      goal: { id: 'g1', studentId: 's', targetRole: 'Backend Engineer', requiredSkills: [], createdAt: daysAgo(10), active: true },
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    expect(bottleneck).toBeNull();
  });

  it('does NOT flag a bottleneck from a single weak metric alone (spec #8)', () => {
    // One missing skill out of many required ones is a weak (low-weight)
    // gap signal — on its own it should not clear the 0.3 corroboration bar.
    const ctx = baseContext({
      goal: {
        id: 'g1', studentId: 's', targetRole: 'Backend Engineer',
        requiredSkills: ['backend', 'databases', 'apis', 'testing', 'cloud', 'security', 'ci_cd', 'design'],
        createdAt: daysAgo(10), active: true,
      },
      evidence: [
        { id: 'e1', type: 'project', title: 'A', skillTags: ['backend'], strength: 'strong', createdAt: daysAgo(5) },
        { id: 'e2', type: 'project', title: 'B', skillTags: ['databases'], strength: 'strong', createdAt: daysAgo(5) },
        { id: 'e3', type: 'project', title: 'C', skillTags: ['apis'], strength: 'strong', createdAt: daysAgo(5) },
        { id: 'e4', type: 'project', title: 'D', skillTags: ['testing'], strength: 'strong', createdAt: daysAgo(5) },
        { id: 'e5', type: 'project', title: 'E', skillTags: ['cloud'], strength: 'strong', createdAt: daysAgo(5) },
        { id: 'e6', type: 'project', title: 'F', skillTags: ['security'], strength: 'strong', createdAt: daysAgo(5) },
        { id: 'e7', type: 'project', title: 'G', skillTags: ['ci_cd'], strength: 'strong', createdAt: daysAgo(5) },
        // 'design' deliberately left uncovered: 1/8 = 0.125 gap ratio, below the 0.3 bar
      ],
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    expect(bottleneck).toBeNull();
  });

  it('flags insufficient_technical_evidence when the gap is substantial', () => {
    const ctx = baseContext({
      evidence: [{ id: 'e1', type: 'project', title: 'Only project', skillTags: ['backend'], strength: 'weak', createdAt: daysAgo(5) }],
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    expect(bottleneck?.category).toBe('insufficient_technical_evidence');
    expect(bottleneck?.evidence.length).toBeGreaterThan(0);
  });

  it('only flags poor_interview_performance when interviews actually happened, and cascades to the dominant feedback tag', () => {
    const ctx = baseContext({
      evidence: [
        { id: 'e1', type: 'project', title: 'A', skillTags: ['backend'], strength: 'strong', createdAt: daysAgo(30) },
        { id: 'e2', type: 'project', title: 'B', skillTags: ['databases'], strength: 'strong', createdAt: daysAgo(30) },
        { id: 'e3', type: 'project', title: 'C', skillTags: ['apis'], strength: 'strong', createdAt: daysAgo(30) },
      ],
      applications: [
        { id: 'a1', opportunityId: 'o1', status: 'interview', appliedAt: daysAgo(20), outcomeTags: ['communication_gap'] },
        { id: 'a2', opportunityId: 'o2', status: 'interview', appliedAt: daysAgo(18), outcomeTags: ['communication_gap'] },
        { id: 'a3', opportunityId: 'o3', status: 'interview', appliedAt: daysAgo(15), outcomeTags: ['technical_knowledge_gap'] },
      ],
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    expect(bottleneck?.category).toBe('poor_interview_performance');
    expect(bottleneck?.cascade?.refinedCause).toBe('communication_gap');
  });

  it('surfaces exactly one bottleneck even when multiple rules corroborate (single-bottleneck principle, spec #9)', () => {
    const ctx = baseContext({
      evidence: [{ id: 'e1', type: 'project', title: 'Only project', skillTags: ['backend'], strength: 'weak', createdAt: daysAgo(5) }],
      opportunities: [
        { id: 'o1', title: 'Role A', type: 'internship', relevanceToGoal: 0.7, applied: false },
        { id: 'o2', title: 'Role B', type: 'internship', relevanceToGoal: 0.6, applied: false },
        { id: 'o3', title: 'Role C', type: 'internship', relevanceToGoal: 0.6, applied: false },
      ],
      applications: [],
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    expect(bottleneck).not.toBeNull();
    // Exactly one category is surfaced as THE bottleneck...
    expect(typeof bottleneck!.category).toBe('string');
    // ...while other corroborated candidates are kept, not discarded, as runner-ups.
    expect(bottleneck!.runnerUps.length).toBeGreaterThan(0);
  });
});
