// ============================================================================
// Example adapters implementing the read-only context ports (Phase 5-6) and
// the write-side ports into the six existing intelligence engines
// (Phase 45-50). These are deliberately thin and side-effect-visible (they
// just push into in-memory arrays) so tests can assert exactly what Feature
// 34 sent downstream, without asserting anything about how those engines
// process it — that logic belongs to those engines, not to this feature.
// ============================================================================

import type { OrgId, RoleContext, RoleId, SkillEvidence, StudentEvidenceContext, StudentId } from "../../domain/types.js";
import type {
  GapIdentifiedNotification,
  GrowthEvidenceEvent,
  MasterySnapshot,
  MasteryLevelSystemPort,
  NextBestActionPort,
  ReadinessSnapshot,
  RoleReadinessPort,
  RoleRequirementsPort,
  RoleSkillGapPort,
  SkillGapSummary,
  SkillSignalEnginePort,
  StudentEvidencePort,
  TechnicalGrowthTrackingPort,
} from "../ports.js";
import { lookupRoleContext, lookupStudentEvidence } from "./fixtures.js";

export class FixtureRoleRequirementsAdapter implements RoleRequirementsPort {
  async getRoleContext(roleId: RoleId, _orgId: OrgId): Promise<RoleContext> {
    return lookupRoleContext(roleId);
  }
}

export class FixtureStudentEvidenceAdapter implements StudentEvidencePort {
  async getStudentEvidenceContext(studentId: StudentId, _roleId: RoleId, _orgId: OrgId): Promise<StudentEvidenceContext> {
    return lookupStudentEvidence(studentId);
  }
}

/**
 * Records every evidence signal submitted. A real adapter would call the
 * actual Skill Signal Engine's ingestion API/queue; this one exists so tests
 * can assert Feature 34 produced correct signals without standing up that
 * engine.
 */
export class InMemorySkillSignalEngineAdapter implements SkillSignalEnginePort {
  public readonly received: SkillEvidence[] = [];

  async submitSkillEvidence(evidence: SkillEvidence[]): Promise<{ accepted: number; rejected: number }> {
    this.received.push(...evidence);
    return { accepted: evidence.length, rejected: 0 };
  }
}

export class InMemoryMasteryAdapter implements MasteryLevelSystemPort {
  constructor(private readonly snapshots: Record<string, MasterySnapshot>) {}
  async getMasterySnapshot(studentId: StudentId, skillId: string): Promise<MasterySnapshot | null> {
    return this.snapshots[`${studentId}:${skillId}`] ?? null;
  }
}

export class InMemoryGrowthTrackingAdapter implements TechnicalGrowthTrackingPort {
  public readonly events: GrowthEvidenceEvent[] = [];
  async recordGrowthEvent(event: GrowthEvidenceEvent): Promise<void> {
    this.events.push(event); // append-only — growth history is never overwritten
  }
}

export class InMemoryRoleSkillGapAdapter implements RoleSkillGapPort {
  constructor(private readonly gaps: SkillGapSummary[]) {}
  async getSkillGaps(_studentId: StudentId, _roleId: RoleId, _orgId: OrgId): Promise<SkillGapSummary[]> {
    return this.gaps;
  }
}

export class InMemoryRoleReadinessAdapter implements RoleReadinessPort {
  constructor(private readonly snapshot: ReadinessSnapshot | null) {}
  async getReadinessSnapshot(): Promise<ReadinessSnapshot | null> {
    return this.snapshot;
  }
}

export class InMemoryNextBestActionAdapter implements NextBestActionPort {
  public readonly notifications: GapIdentifiedNotification[] = [];
  async notifyGapIdentified(notification: GapIdentifiedNotification): Promise<void> {
    this.notifications.push(notification); // Feature 34 reports; it never picks the next activity itself (Phase 53)
  }
}
