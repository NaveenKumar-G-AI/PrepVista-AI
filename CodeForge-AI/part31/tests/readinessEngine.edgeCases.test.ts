import { describe, expect, it } from 'vitest';
import { computeRoleReadiness } from '../src/domain/readinessEngine';
import { BACKEND_DEVELOPER_ROLE, NOW, adequateEvidence, ev, strongEvidence } from './fixtures/roleModels';

function compute(evidence: ReturnType<typeof ev>[]) {
  return computeRoleReadiness({
    studentId: 's1',
    organizationId: 'org1',
    roleModel: BACKEND_DEVELOPER_ROLE,
    evidence,
    now: NOW,
  });
}

describe('Edge cases (Phase 55)', () => {
  it('no evidence at all -> NOT_ASSESSED, low confidence, every skill unassessed, no crash', () => {
    const result = compute([]);
    expect(result.readinessState).toBe('NOT_ASSESSED');
    expect(result.confidence).toBe('low');
    expect(result.skillBreakdown.every((s) => s.status === 'unassessed')).toBe(true);
    // never mislabels a genuinely-untested skill as a numeric failure
    expect(result.skillBreakdown.every((s) => s.currentMastery === 'unassessed')).toBe(true);
  });

  it('one evidence item on one skill -> that skill is insufficient_evidence, not silently "assessed"', () => {
    const result = compute([ev('skill_programming', 90, { tier: 'verified_direct_performance' })]);
    const programming = result.skillBreakdown.find((s) => s.skillId === 'skill_programming')!;
    expect(programming.status).toBe('insufficient_evidence');
    expect(result.coreGatePassed).toBe(false); // programming is core and still isn't "assessed"
  });

  it('very old evidence still counts, but is discounted relative to fresh evidence of the same score', () => {
    const veryOld = compute(
      Array.from({ length: 4 }, () => ev('skill_programming', 90, { tier: 'verified_direct_performance', timestamp: '2024-01-01T00:00:00Z' })),
    );
    const recent = compute(strongEvidence('skill_programming', 4, 90));
    const oldSignal = veryOld.skillBreakdown.find((s) => s.skillId === 'skill_programming')!;
    const recentSignal = recent.skillBreakdown.find((s) => s.skillId === 'skill_programming')!;
    expect(oldSignal.status).toBe('assessed'); // still counts
    expect(oldSignal.confidenceScore).toBeLessThan(recentSignal.confidenceScore); // but trusted less
  });

  it('conflicting/alternating evidence is flagged unstable, not averaged away silently', () => {
    const evidence = [90, 20, 88, 25, 91, 18].map((score, i) =>
      ev('skill_debugging', score, { tier: 'verified_direct_performance', timestamp: `2026-0${(i % 6) + 1}-15T00:00:00Z` }),
    );
    const result = compute(evidence);
    const signal = result.skillBreakdown.find((s) => s.skillId === 'skill_debugging')!;
    expect(signal.status).toBe('assessed');
    // confidence should reflect the instability even though status is "assessed"
    expect(signal.confidenceScore).toBeLessThan(0.72);
  });

  it('strong core skills + entirely unassessed optional skill -> no blocker generated for the optional gap', () => {
    const result = compute([...strongEvidence('skill_programming', 5, 90), ...strongEvidence('skill_debugging', 5, 88)]);
    expect(result.blockers.find((b) => b.skillId === 'skill_graphql')).toBeUndefined();
  });

  it('all skills unassessed -> NOT_ASSESSED with zero coverage', () => {
    const result = compute([]);
    expect(result.readinessState).toBe('NOT_ASSESSED');
    expect(result.coverage).toBe(0);
  });

  it('all skills strong -> STRONGLY_READY', () => {
    const evidence = BACKEND_DEVELOPER_ROLE.skills.flatMap((s) => strongEvidence(s.skillId, 6, 92));
    const result = compute(evidence);
    expect(result.coreGatePassed).toBe(true);
    expect(result.readinessState).toBe('STRONGLY_READY');
  });

  it('all skills weak -> never APPROACHING_READY or better', () => {
    const evidence = BACKEND_DEVELOPER_ROLE.skills.flatMap((s) => strongEvidence(s.skillId, 5, 22));
    const result = compute(evidence);
    expect(['NOT_ASSESSED', 'EARLY_STAGE', 'DEVELOPING']).toContain(result.readinessState);
  });

  it('multiple roles evaluated independently do not leak state between calculations', () => {
    const frontendRole = {
      ...BACKEND_DEVELOPER_ROLE,
      roleId: 'role_frontend_dev',
      roleName: 'Frontend Developer',
      skills: [
        { ...BACKEND_DEVELOPER_ROLE.skills[0], skillId: 'skill_frontend_fundamentals', skillName: 'Frontend Fundamentals' },
      ],
    };
    const evidence = [...strongEvidence('skill_programming', 5, 90), ...strongEvidence('skill_frontend_fundamentals', 5, 90)];

    const backendResult = computeRoleReadiness({
      studentId: 's1',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence,
      now: NOW,
    });
    const frontendResult = computeRoleReadiness({
      studentId: 's1',
      organizationId: 'org1',
      roleModel: frontendRole,
      evidence,
      now: NOW,
    });

    expect(backendResult.roleId).toBe('role_backend_dev');
    expect(frontendResult.roleId).toBe('role_frontend_dev');
    // Backend still requires debugging/SQL/etc, unaffected by frontend's evidence set
    expect(backendResult.coreGatePassed).toBe(false); // debugging still unassessed for backend
    expect(frontendResult.coreGatePassed).toBe(true); // frontend's only requirement is met
  });

  it('a changed role model (different version, different threshold) changes the result without new evidence', () => {
    const evidence = [...strongEvidence('skill_programming', 5, 75), ...strongEvidence('skill_debugging', 5, 65)];
    const strictRole = {
      ...BACKEND_DEVELOPER_ROLE,
      version: 'role-model-v2-strict',
      skills: BACKEND_DEVELOPER_ROLE.skills.map((s) => (s.skillId === 'skill_debugging' ? { ...s, minimumMastery: 'strong' as const } : s)),
    };

    const lenient = computeRoleReadiness({ studentId: 's1', organizationId: 'org1', roleModel: BACKEND_DEVELOPER_ROLE, evidence, now: NOW });
    const strict = computeRoleReadiness({ studentId: 's1', organizationId: 'org1', roleModel: strictRole, evidence, now: NOW });

    expect(lenient.roleModelVersion).toBe('role-model-v1');
    expect(strict.roleModelVersion).toBe('role-model-v2-strict');
    expect(strict.coreGatePassed).toBe(false); // stricter bar for debugging now fails
  });

  it('every result is stamped with the current algorithm version for traceability (Phase 25)', () => {
    const result = compute(strongEvidence('skill_programming', 5, 90));
    expect(result.algorithmVersion).toBe('readiness-algorithm-v1.0.0');
  });

  it('missing upstream data for one skill degrades that skill to unassessed, not to a false zero', () => {
    const result = computeRoleReadiness({
      studentId: 's1',
      organizationId: 'org1',
      roleModel: BACKEND_DEVELOPER_ROLE,
      evidence: [...strongEvidence('skill_programming', 5, 90), ...strongEvidence('skill_debugging', 5, 88)],
      unavailableSkillIds: new Set(['skill_sql']),
      now: NOW,
    });
    const sql = result.skillBreakdown.find((s) => s.skillId === 'skill_sql')!;
    expect(sql.status).toBe('unassessed');
    expect(result.warnings.some((w) => w.includes('SQL'))).toBe(true);
  });

  it('adequate-but-not-spectacular evidence across all skills still clears an APPROACHING_READY-or-better bar', () => {
    const evidence = BACKEND_DEVELOPER_ROLE.skills.flatMap((s) => adequateEvidence(s.skillId, 3, 74));
    const result = compute(evidence);
    expect(['APPROACHING_READY', 'READY', 'STRONGLY_READY']).toContain(result.readinessState);
  });
});
