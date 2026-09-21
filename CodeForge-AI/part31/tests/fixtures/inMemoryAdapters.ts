// TEST-ONLY fixtures. Phase 67 explicitly allows fixtures inside tests —
// these must never be imported from src/. They exist to make the ports in
// src/ports genuinely exercisable without a real database or upstream
// services.
import type { EvidenceProvider, RoleModelProvider, SnapshotRepository, VersionedSnapshot } from '../../src/ports';
import type { EvidenceRecord, ReadinessResult, RoleModel } from '../../src/domain/types';

export function makeInMemoryRoleModelProvider(models: RoleModel[]): RoleModelProvider {
  return {
    async getRoleModel(roleId: string) {
      const model = models.find((m) => m.roleId === roleId);
      if (!model) throw new Error(`role not found: ${roleId}`);
      return model;
    },
  };
}

export function makeInMemoryEvidenceProvider(
  evidence: EvidenceRecord[],
  failingSkillIds: Set<string> = new Set(),
): EvidenceProvider {
  return {
    async getEvidenceForSkills(_studentId: string, skillIds: string[]) {
      const unavailableSkillIds = new Set<string>();
      const result: EvidenceRecord[] = [];
      for (const id of skillIds) {
        if (failingSkillIds.has(id)) {
          unavailableSkillIds.add(id);
          continue;
        }
        result.push(...evidence.filter((e) => e.skillId === id));
      }
      return { evidence: result, unavailableSkillIds };
    },
  };
}

export function makeThrowingEvidenceProvider(): EvidenceProvider {
  return {
    async getEvidenceForSkills() {
      throw new Error('evidence service unavailable');
    },
  };
}

export function makeInMemorySnapshotRepository(): SnapshotRepository & { callCounts: { save: number; history: number } } {
  const snapshots = new Map<string, VersionedSnapshot>();
  const history: ReadinessResult[] = [];
  const key = (studentId: string, roleId: string) => `${studentId}::${roleId}`;
  const callCounts = { save: 0, history: 0 };

  return {
    callCounts,
    async getCurrentSnapshot(studentId, roleId) {
      return snapshots.get(key(studentId, roleId)) ?? null;
    },
    async saveIfVersion(studentId, roleId, expectedVersion, result) {
      callCounts.save += 1;
      const k = key(studentId, roleId);
      const current = snapshots.get(k) ?? null;
      const currentVersion = current ? current.version : null;
      if (currentVersion !== expectedVersion) return null; // conflict — caller retries
      const next: VersionedSnapshot = { version: (current?.version ?? 0) + 1, result };
      snapshots.set(k, next);
      return next;
    },
    async appendHistory(result) {
      callCounts.history += 1;
      history.push(result);
    },
    async getHistory(studentId, roleId, limit = 20) {
      return history.filter((h) => h.studentId === studentId && h.roleId === roleId).slice(-limit);
    },
  };
}
