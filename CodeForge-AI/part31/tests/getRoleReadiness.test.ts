import { describe, expect, it } from 'vitest';
import { getRoleReadiness } from '../src/application/getRoleReadiness';
import {
  makeInMemoryEvidenceProvider,
  makeInMemoryRoleModelProvider,
  makeInMemorySnapshotRepository,
  makeThrowingEvidenceProvider,
} from './fixtures/inMemoryAdapters';
import { BACKEND_DEVELOPER_ROLE, strongEvidence } from './fixtures/roleModels';

function makePorts(overrides: Partial<{ evidenceProvider: ReturnType<typeof makeInMemoryEvidenceProvider> }> = {}) {
  const evidence = [...strongEvidence('skill_programming', 5, 88), ...strongEvidence('skill_debugging', 5, 82)];
  return {
    evidenceProvider: overrides.evidenceProvider ?? makeInMemoryEvidenceProvider(evidence),
    roleModelProvider: makeInMemoryRoleModelProvider([BACKEND_DEVELOPER_ROLE]),
    snapshotRepository: makeInMemorySnapshotRepository(),
  };
}

describe('getRoleReadiness', () => {
  it('returns null for a role that does not exist, rather than throwing', async () => {
    const ports = makePorts();
    const result = await getRoleReadiness({
      studentId: 's1',
      organizationId: 'org1',
      roleId: 'role_does_not_exist',
      ports,
    });
    expect(result).toBeNull();
  });

  it('serves a cached snapshot on a second call within the staleness window, without re-fetching evidence', async () => {
    let evidenceCalls = 0;
    const evidence = [...strongEvidence('skill_programming', 5, 88), ...strongEvidence('skill_debugging', 5, 82)];
    const countingEvidenceProvider = {
      async getEvidenceForSkills(studentId: string, skillIds: string[]) {
        evidenceCalls += 1;
        return makeInMemoryEvidenceProvider(evidence).getEvidenceForSkills(studentId, skillIds);
      },
    };
    const ports = makePorts({ evidenceProvider: countingEvidenceProvider });

    const first = await getRoleReadiness({ studentId: 's1', organizationId: 'org1', roleId: 'role_backend_dev', ports });
    const second = await getRoleReadiness({ studentId: 's1', organizationId: 'org1', roleId: 'role_backend_dev', ports });

    expect(evidenceCalls).toBe(1); // second call was served from cache
    expect(second?.calculatedAt).toBe(first?.calculatedAt);
  });

  it('bypasses the cache and recomputes when forceRecalculate is set', async () => {
    let evidenceCalls = 0;
    const evidence = [...strongEvidence('skill_programming', 5, 88), ...strongEvidence('skill_debugging', 5, 82)];
    const countingEvidenceProvider = {
      async getEvidenceForSkills(studentId: string, skillIds: string[]) {
        evidenceCalls += 1;
        return makeInMemoryEvidenceProvider(evidence).getEvidenceForSkills(studentId, skillIds);
      },
    };
    const ports = makePorts({ evidenceProvider: countingEvidenceProvider });

    await getRoleReadiness({ studentId: 's1', organizationId: 'org1', roleId: 'role_backend_dev', ports });
    await getRoleReadiness({
      studentId: 's1',
      organizationId: 'org1',
      roleId: 'role_backend_dev',
      ports,
      options: { forceRecalculate: true },
    });

    expect(evidenceCalls).toBe(2);
  });

  it('degrades gracefully instead of crashing when the evidence source is completely unavailable', async () => {
    const ports = makePorts({ evidenceProvider: makeThrowingEvidenceProvider() });
    const result = await getRoleReadiness({ studentId: 's1', organizationId: 'org1', roleId: 'role_backend_dev', ports });

    expect(result).not.toBeNull();
    // every skill becomes unassessed, never a false failure
    expect(result!.skillBreakdown.every((s) => s.status === 'unassessed')).toBe(true);
    expect(result!.readinessState).toBe('NOT_ASSESSED');
  });

  it('invokes the observability hook with duration and state (Phase 52)', async () => {
    const ports = makePorts();
    let observed: { durationMs: number; state: string } | null = null;
    await getRoleReadiness({
      studentId: 's1',
      organizationId: 'org1',
      roleId: 'role_backend_dev',
      ports,
      options: { onCalculated: (info) => (observed = info) },
    });
    expect(observed).not.toBeNull();
    expect(observed!.durationMs).toBeGreaterThanOrEqual(0);
  });
});
