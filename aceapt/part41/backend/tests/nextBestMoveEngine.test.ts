import { describe, it, expect } from 'vitest';
import { determineNextBestMove, generateCandidates } from '../src/engines/nextBestMoveEngine.js';
import { extractSignals } from '../src/engines/signalEngine.js';
import { detectPrimaryBottleneck } from '../src/engines/bottleneckEngine.js';
import { baseContext, daysAgo, daysFromNow } from './fixtures.js';

describe('nextBestMoveEngine', () => {
  it('recommends applying to the highest-relevance opportunity when nothing else dominates', () => {
    const ctx = baseContext({
      evidence: [
        { id: 'e1', type: 'project', title: 'A', skillTags: ['backend'], strength: 'strong', createdAt: daysAgo(30) },
        { id: 'e2', type: 'project', title: 'B', skillTags: ['databases'], strength: 'strong', createdAt: daysAgo(30) },
        { id: 'e3', type: 'project', title: 'C', skillTags: ['apis'], strength: 'strong', createdAt: daysAgo(30) },
      ],
      opportunities: [
        { id: 'o1', title: 'High-fit role', type: 'internship', relevanceToGoal: 0.9, deadline: daysFromNow(5), applied: false },
        { id: 'o2', title: 'Low-fit role', type: 'internship', relevanceToGoal: 0.3, applied: false },
      ],
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    const move = determineNextBestMove(ctx, signals, bottleneck);
    expect(move?.kind).toBe('apply_to_opportunity');
    expect(move?.targetId).toBe('o1');
  });

  it('never shows a raw numeric score on the move — only a tier', () => {
    const ctx = baseContext({
      opportunities: [{ id: 'o1', title: 'Role', type: 'internship', relevanceToGoal: 0.8, applied: false }],
    });
    const signals = extractSignals(ctx);
    const move = determineNextBestMove(ctx, signals, null);
    expect(move).not.toBeNull();
    expect(['high', 'medium', 'low']).toContain(move!.tier);
    expect((move as unknown as Record<string, unknown>).rawScore).toBeUndefined();
  });

  it('flags a candidate as constraint-violating when it would exceed the stated weekly hours', () => {
    const ctx = baseContext({
      constraints: [{ id: 'c1', studentId: 's', type: 'time', description: 'limited time', hoursPerWeek: 1 }],
      evidence: [{ id: 'e1', type: 'project', title: 'Only one', skillTags: ['backend'], strength: 'weak', createdAt: daysAgo(5) }],
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    const candidates = generateCandidates(ctx, signals, bottleneck);
    const buildProject = candidates.find((c) => c.kind === 'build_project');
    // build_project defaults to 8h/week, which does not fit a 1h/week budget
    expect(buildProject?.violatesConstraints).toBe(true);
  });

  it('reports blockedByConstraints when literally nothing generated fits the budget (spec #38), rather than silently recommending it anyway', () => {
    const ctx = baseContext({
      constraints: [{ id: 'c1', studentId: 's', type: 'time', description: 'limited time', hoursPerWeek: 1 }],
      evidence: [{ id: 'e1', type: 'project', title: 'Only one', skillTags: ['backend'], strength: 'weak', createdAt: daysAgo(5) }],
      // No opportunities on file, so build_project (which needs 8h) is the
      // only candidate the engine can generate for this bottleneck — and it
      // does not fit a 1h/week budget. There is genuinely no feasible move.
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    const move = determineNextBestMove(ctx, signals, bottleneck);
    expect(move?.kind).toBe('build_project');
    expect(move?.blockedByConstraints).toBe(true);
  });

  it('picks a feasible alternative over a higher-scoring but infeasible candidate when one is available', () => {
    const ctx = baseContext({
      constraints: [{ id: 'c1', studentId: 's', type: 'time', description: 'limited time', hoursPerWeek: 3 }],
      evidence: [{ id: 'e1', type: 'project', title: 'Only one', skillTags: ['backend'], strength: 'weak', createdAt: daysAgo(5) }],
      opportunities: [{ id: 'o1', title: 'Small-fit role', type: 'internship', relevanceToGoal: 0.6, applied: false }],
      // build_project (8h) still doesn't fit a 3h/week budget, but
      // apply_to_opportunity (~2h) does, and should win instead.
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    const move = determineNextBestMove(ctx, signals, bottleneck);
    expect(move?.kind).toBe('apply_to_opportunity');
    expect(move?.blockedByConstraints).toBe(false);
  });

  it('offers apply_to_opportunity when application volume is low relative to open opportunities', () => {
    const ctx = baseContext({
      evidence: [
        { id: 'e1', type: 'project', title: 'A', skillTags: ['backend'], strength: 'strong', createdAt: daysAgo(30) },
        { id: 'e2', type: 'project', title: 'B', skillTags: ['databases'], strength: 'strong', createdAt: daysAgo(30) },
        { id: 'e3', type: 'project', title: 'C', skillTags: ['apis'], strength: 'strong', createdAt: daysAgo(30) },
      ],
      opportunities: [
        { id: 'o1', title: 'Role A', type: 'internship', relevanceToGoal: 0.55, applied: false },
        { id: 'o2', title: 'Role B', type: 'internship', relevanceToGoal: 0.55, applied: false },
        { id: 'o3', title: 'Role C', type: 'internship', relevanceToGoal: 0.55, applied: false },
      ],
      applications: [],
    });
    const signals = extractSignals(ctx);
    const bottleneck = detectPrimaryBottleneck(ctx, signals);
    const move = determineNextBestMove(ctx, signals, bottleneck);
    expect(move?.kind).toBe('apply_to_opportunity');
  });
});
