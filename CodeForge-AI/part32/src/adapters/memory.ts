/**
 * ============================================================================
 * DEV / TEST FIXTURES ONLY - NOT PRODUCTION ADAPTERS (Phase 76)
 * ============================================================================
 * Everything in this file lives entirely in process memory. It exists so
 * the application and API layers can be exercised end-to-end without a
 * real database, queue, or upstream service - exactly the kind of test
 * fixture Phase 76 explicitly permits ("Test fixtures are permitted only
 * in tests/local development"). Do not route production traffic through
 * these. See src/adapters/postgresGapRepository.ts for the real persistence
 * adapter, and README.md "Wiring in your real systems" for the rest.
 */

import { randomUUID } from "node:crypto";
import type {
  CachePort,
  EvidencePort,
  EventBusPort,
  GapRepositoryPort,
  NextBestActionPort,
  PersistedGapSnapshot,
  RoleModelPort,
  RoleReadinessPort,
  RoleRequirementBundle,
  SkillStatePort,
  TechnicalMasteryReportPort,
} from "../ports/index.js";
import type { DomainEvent, EvidenceRecord, GapHistoryEntry, MasteryLevel } from "../domain/types.js";

export class InMemoryRoleModelAdapter implements RoleModelPort {
  constructor(private roles: Map<string, RoleRequirementBundle> = new Map()) {}

  seedRole(bundle: RoleRequirementBundle): void {
    this.roles.set(bundle.roleId, bundle);
  }

  async getRoleRequirements(roleId: string): Promise<RoleRequirementBundle> {
    const bundle = this.roles.get(roleId);
    if (!bundle) throw new Error(`Unknown role: ${roleId}`);
    return bundle;
  }

  async listAvailableRoles(): Promise<{ roleId: string; roleName: string }[]> {
    return [...this.roles.values()].map((r) => ({ roleId: r.roleId, roleName: r.roleName }));
  }

  async findRolesRequiringSkill(skillId: string): Promise<string[]> {
    return [...this.roles.values()]
      .filter((r) => r.requirements.some((req) => req.skillId === skillId))
      .map((r) => r.roleId);
  }
}

export class InMemorySkillStateAdapter implements SkillStatePort {
  constructor(private state: Map<string, MasteryLevel | null> = new Map()) {}

  seedMastery(studentId: string, skillId: string, level: MasteryLevel | null): void {
    this.state.set(`${studentId}:${skillId}`, level);
  }

  async getCurrentMastery(studentId: string, skillIds: string[]): Promise<Map<string, MasteryLevel | null>> {
    const result = new Map<string, MasteryLevel | null>();
    for (const skillId of skillIds) {
      result.set(skillId, this.state.get(`${studentId}:${skillId}`) ?? null);
    }
    return result;
  }
}

export class InMemoryEvidenceAdapter implements EvidencePort {
  constructor(private records: EvidenceRecord[] = []) {}

  seedEvidence(records: EvidenceRecord[]): void {
    this.records.push(...records);
  }

  async getEvidence(studentId: string, skillId: string): Promise<EvidenceRecord[]> {
    return this.records.filter((r) => r.studentId === studentId && r.skillId === skillId);
  }
}

export class InMemoryGapRepositoryAdapter implements GapRepositoryPort {
  private snapshots = new Map<string, PersistedGapSnapshot>();
  private history: GapHistoryEntry[] = [];

  private key(organizationId: string, studentId: string, roleId: string, skillId: string): string {
    return `${organizationId}:${studentId}:${roleId}:${skillId}`;
  }

  async getSnapshot(organizationId: string, studentId: string, roleId: string, skillId: string) {
    return this.snapshots.get(this.key(organizationId, studentId, roleId, skillId)) ?? null;
  }

  async saveSnapshot(snapshot: PersistedGapSnapshot): Promise<void> {
    this.snapshots.set(
      this.key(snapshot.organizationId, snapshot.studentId, snapshot.roleId, snapshot.skillId),
      snapshot,
    );
  }

  async recordHistory(entry: GapHistoryEntry): Promise<void> {
    this.history.push(entry);
  }

  async listSnapshotsForRole(organizationId: string, studentId: string, roleId: string) {
    return [...this.snapshots.values()].filter(
      (s) => s.organizationId === organizationId && s.studentId === studentId && s.roleId === roleId,
    );
  }

  async getHistory(organizationId: string, studentId: string, roleId: string, skillId: string) {
    return this.history.filter(
      (h) =>
        h.organizationId === organizationId &&
        h.studentId === studentId &&
        h.roleId === roleId &&
        h.skillId === skillId,
    );
  }
}

export class InMemoryCacheAdapter implements CachePort {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async invalidate(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class InMemoryEventBusAdapter implements EventBusPort {
  private handlers = new Map<string, ((event: DomainEvent) => Promise<void>)[]>();

  async publish(event: DomainEvent): Promise<void> {
    const list = this.handlers.get(event.type) ?? [];
    for (const handler of list) {
      await handler(event);
    }
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }
}

/** No-op stand-ins for the downstream engines (Phase 43-45). Real
 *  integration means implementing these ports against your actual Next
 *  Best Action / Role Readiness / Technical Mastery Report services. */
export class NoopNextBestActionAdapter implements NextBestActionPort {
  public calls: unknown[] = [];
  async submitGapContext(context: Parameters<NextBestActionPort["submitGapContext"]>[0]): Promise<void> {
    this.calls.push(context);
  }
}
export class NoopRoleReadinessAdapter implements RoleReadinessPort {
  public calls: unknown[] = [];
  async submitGapContext(context: Parameters<RoleReadinessPort["submitGapContext"]>[0]): Promise<void> {
    this.calls.push(context);
  }
}
export class NoopTechnicalMasteryReportAdapter implements TechnicalMasteryReportPort {
  public calls: unknown[] = [];
  async submitGapContext(context: Parameters<TechnicalMasteryReportPort["submitGapContext"]>[0]): Promise<void> {
    this.calls.push(context);
  }
}

export function randomId(): string {
  return randomUUID();
}
