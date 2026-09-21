import { describe, expect, it } from 'vitest';
import { computeRoleReadiness } from '../src/domain/readinessEngine';
import { BACKEND_DEVELOPER_ROLE, NOW, adequateEvidence, ev, strongEvidence, unstableEvidence } from './fixtures/roleModels';

describe('Golden case A — strong core skills, weak optional skill -> Ready', () => {
  it('reaches READY or STRONGLY_READY, with the weak optional skill neither blocking nor listed as a strength', () => {
    const evidence = [
      ...strongEvidence('skill_programming', 6, 90),
      ...strongEvidence('skill_debugging', 6, 85),
      ...adequateEvidence('skill_sql', 3, 78),
      ...adequateEvidence('skill_api_design', 3, 75),
      ...adequateEvidence('skill_system_design', 2, 70),
      ev('skill_graphql', 22, { tier: 'weak_indirect' }), // weak, but optional
    ];
    const result = computeRoleReadiness({
      studentId: 's_a',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence,
      now: NOW,
    });

    expect(result.coreGatePassed).toBe(true);
    expect(['READY', 'STRONGLY_READY']).toContain(result.readinessState);
    expect(result.blockers.find((b) => b.skillId === 'skill_graphql')).toBeUndefined();
    expect(result.strengths.find((s) => s.skillId === 'skill_graphql')).toBeUndefined();
  });
});

describe('Golden case B — strong optional skills, weak mandatory (core) skill -> Not Ready', () => {
  it('is capped below READY because a core skill fails its gate, however strong everything else is', () => {
    const evidence = [
      ...strongEvidence('skill_programming', 6, 92),
      ...unstableEvidence('skill_debugging', [30, 25, 35, 20, 28]), // core, well below "competent"
      ...strongEvidence('skill_sql', 5, 90),
      ...strongEvidence('skill_api_design', 5, 90),
      ...strongEvidence('skill_graphql', 5, 90), // optional, excellent — must not compensate
    ];
    const result = computeRoleReadiness({
      studentId: 's_b',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence,
      now: NOW,
    });

    expect(result.coreGatePassed).toBe(false);
    expect(['NOT_ASSESSED', 'EARLY_STAGE', 'DEVELOPING']).toContain(result.readinessState);
    expect(result.blockers.some((b) => b.skillId === 'skill_debugging')).toBe(true);
  });
});

describe('Golden case C — very little evidence -> Unassessed / low confidence', () => {
  it('reports NOT_ASSESSED or EARLY_STAGE with low confidence rather than guessing', () => {
    const evidence = [ev('skill_programming', 80, { tier: 'verified_direct_performance' })];
    const result = computeRoleReadiness({
      studentId: 's_c',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence,
      now: NOW,
    });

    expect(['NOT_ASSESSED', 'EARLY_STAGE']).toContain(result.readinessState);
    expect(result.confidence).toBe('low');
  });
});

describe('Golden case D — strong recent evidence -> improved readiness over time', () => {
  it('shows a higher score/state once recent strong evidence is included than with only the early weak evidence', () => {
    const earlyOnly = [
      ev('skill_programming', 40, { tier: 'verified_understanding', timestamp: '2026-04-01T00:00:00Z' }),
      ev('skill_debugging', 40, { tier: 'verified_understanding', timestamp: '2026-04-01T00:00:00Z' }),
    ];
    const withRecentGrowth = [
      ...earlyOnly,
      ...strongEvidence('skill_programming', 5, 90),
      ...strongEvidence('skill_debugging', 5, 88),
    ];

    const early = computeRoleReadiness({
      studentId: 's_d',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence: earlyOnly,
      now: NOW,
    });
    const later = computeRoleReadiness({
      studentId: 's_d',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence: withRecentGrowth,
      now: NOW,
    });

    expect(later.readinessScore).toBeGreaterThan(early.readinessScore);
    const programmingSignalTrend = later.skillBreakdown.find((s) => s.skillId === 'skill_programming')?.recentTrend;
    expect(programmingSignalTrend).toBe('improving');
  });
});

describe('Golden case E — high scores but inconsistent performance -> confidence reduced', () => {
  it('has lower confidence than an equivalently-scored but stable student', () => {
    const stableEvidence = [
      ...unstableEvidence('skill_programming', [88, 85, 90, 87, 89, 86]),
      ...strongEvidence('skill_debugging', 5, 85),
    ];
    const inconsistentEvidence = [
      // Average (~82) still clears the "strong" bar for programming, same as
      // the stable fixture — the point is that meeting the bar on average
      // doesn't hide unreliable performance from confidence or blockers.
      ...unstableEvidence('skill_programming', [98, 65, 96, 68, 97, 66]),
      ...strongEvidence('skill_debugging', 5, 85),
    ];

    const stable = computeRoleReadiness({
      studentId: 's_e1',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence: stableEvidence,
      now: NOW,
    });
    const inconsistent = computeRoleReadiness({
      studentId: 's_e2',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence: inconsistentEvidence,
      now: NOW,
    });

    expect(inconsistent.confidenceScore).toBeLessThan(stable.confidenceScore);
    expect(inconsistent.blockers.some((b) => b.skillId === 'skill_programming' && b.type === 'inconsistent_performance')).toBe(
      true,
    );
  });
});
