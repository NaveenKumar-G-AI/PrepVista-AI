import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  capabilities,
  evidenceItems,
  opportunities,
  opportunityCapabilityRequirements,
  readinessAuditLogs,
  readinessSnapshots,
  roleCapabilityRequirements,
  roleProfiles,
  studentRoleTargets,
} from '../db/schema';
import { CapabilityImportance, CapabilityRequirement, EvidenceItem, ReadinessState } from '../types/domain';
import { newId } from '../utils/id';

export interface RequirementSet {
  id: string;
  name: string;
  requirements: CapabilityRequirement[];
}

export interface SnapshotRecord {
  id: string;
  studentId: string;
  roleId: string;
  state: ReadinessState;
  confidence: string;
  topGapCapabilityId: string | null;
  reasonSummary: string;
  createdAt: Date;
}

/**
 * Owns everything that is genuinely Feature 37's own data: the role/
 * opportunity requirement catalogs (this feature's "Role Requirement
 * Engine"), evidence, readiness snapshots, and the audit trail. This is
 * deliberately NOT hidden behind an interface in `integrations/` — unlike
 * Features 33-36, there is no existing ACEAPT system this data comes from,
 * so there's nothing to swap it out for.
 */
export class ReadinessRepository {
  // ---------------------------------------------------------------------
  // Role & opportunity requirement catalogs
  // ---------------------------------------------------------------------

  async getRole(tenantId: string, roleId: string): Promise<RequirementSet | null> {
    const [role] = await db
      .select()
      .from(roleProfiles)
      .where(and(eq(roleProfiles.id, roleId), eq(roleProfiles.tenantId, tenantId)))
      .limit(1);
    if (!role) return null;

    const rows = await db
      .select({
        capabilityId: capabilities.id,
        capabilityName: capabilities.name,
        requiredLevel: roleCapabilityRequirements.requiredLevel,
        importance: roleCapabilityRequirements.importance,
      })
      .from(roleCapabilityRequirements)
      .innerJoin(capabilities, eq(capabilities.id, roleCapabilityRequirements.capabilityId))
      .where(eq(roleCapabilityRequirements.roleId, roleId));

    return {
      id: role.id,
      name: role.name,
      requirements: rows.map((r) => ({
        capabilityId: r.capabilityId,
        capabilityName: r.capabilityName,
        requiredLevel: r.requiredLevel,
        importance: r.importance as CapabilityImportance,
      })),
    };
  }

  async getOpportunity(tenantId: string, opportunityId: string): Promise<RequirementSet | null> {
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, tenantId)))
      .limit(1);
    if (!opp) return null;

    const rows = await db
      .select({
        capabilityId: capabilities.id,
        capabilityName: capabilities.name,
        requiredLevel: opportunityCapabilityRequirements.requiredLevel,
        importance: opportunityCapabilityRequirements.importance,
      })
      .from(opportunityCapabilityRequirements)
      .innerJoin(capabilities, eq(capabilities.id, opportunityCapabilityRequirements.capabilityId))
      .where(eq(opportunityCapabilityRequirements.opportunityId, opportunityId));

    return {
      id: opp.id,
      name: opp.title,
      requirements: rows.map((r) => ({
        capabilityId: r.capabilityId,
        capabilityName: r.capabilityName,
        requiredLevel: r.requiredLevel,
        importance: r.importance as CapabilityImportance,
      })),
    };
  }

  /** Local fallback for "which roles does this student target" until Feature 34 is wired in. */
  async getStudentTargetRoles(tenantId: string, studentId: string) {
    return db
      .select({ roleId: roleProfiles.id, roleName: roleProfiles.name, isPrimary: studentRoleTargets.isPrimary })
      .from(studentRoleTargets)
      .innerJoin(roleProfiles, eq(roleProfiles.id, studentRoleTargets.roleId))
      .where(and(eq(studentRoleTargets.studentId, studentId), eq(studentRoleTargets.tenantId, tenantId)));
  }

  async getCapabilityFreshnessWindows(capabilityIds: string[]): Promise<Map<string, number>> {
    if (capabilityIds.length === 0) return new Map();
    const rows = await db
      .select({ id: capabilities.id, freshnessWindowDays: capabilities.freshnessWindowDays })
      .from(capabilities)
      .where(inArray(capabilities.id, capabilityIds));
    return new Map(rows.map((r) => [r.id, r.freshnessWindowDays]));
  }

  // ---------------------------------------------------------------------
  // Evidence
  // ---------------------------------------------------------------------

  async getEvidenceForCapabilities(tenantId: string, studentId: string, capabilityIds: string[]): Promise<EvidenceItem[]> {
    if (capabilityIds.length === 0) return [];
    const rows = await db
      .select()
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.studentId, studentId),
          eq(evidenceItems.tenantId, tenantId),
          inArray(evidenceItems.capabilityId, capabilityIds)
        )
      );

    return rows.map(
      (r): EvidenceItem => ({
        id: r.id,
        studentId: r.studentId,
        capabilityId: r.capabilityId,
        sourceType: r.sourceType,
        occurredAt: r.occurredAt.toISOString(),
        score: r.score,
        // outcome is stored as free text at the DB boundary (see schema.ts); the write path
        // (evidenceIngestService) is the only place allowed to write into this column, and it
        // validates against the same union before insert.
        outcome: r.outcome as EvidenceItem['outcome'],
        context: r.context,
        validationState: r.validationState,
        claimedLevel: r.claimedLevel ?? null,
        externalRefId: r.externalRefId ?? null,
      })
    );
  }

  async insertEvidence(tenantId: string, item: Omit<EvidenceItem, 'id'> & { id?: string }): Promise<EvidenceItem> {
    const id = item.id ?? newId('evi');
    await db.insert(evidenceItems).values({
      id,
      studentId: item.studentId,
      tenantId,
      capabilityId: item.capabilityId,
      sourceType: item.sourceType,
      occurredAt: new Date(item.occurredAt),
      score: item.score,
      outcome: item.outcome,
      context: item.context,
      validationState: item.validationState,
      claimedLevel: item.claimedLevel ?? null,
      externalRefId: item.externalRefId ?? null,
    });
    return { ...item, id };
  }

  // ---------------------------------------------------------------------
  // Readiness snapshots & audit trail
  // ---------------------------------------------------------------------

  async saveSnapshot(params: {
    tenantId: string;
    studentId: string;
    roleId: string;
    state: ReadinessState;
    confidence: string;
    topGapCapabilityId: string | null;
    reasonSummary: string;
  }): Promise<void> {
    await db.insert(readinessSnapshots).values({ id: newId('snap'), ...params });
  }

  async getLatestSnapshot(tenantId: string, studentId: string, roleId: string): Promise<SnapshotRecord | null> {
    const [row] = await db
      .select()
      .from(readinessSnapshots)
      .where(and(eq(readinessSnapshots.studentId, studentId), eq(readinessSnapshots.tenantId, tenantId), eq(readinessSnapshots.roleId, roleId)))
      .orderBy(desc(readinessSnapshots.createdAt))
      .limit(1);
    return row ?? null;
  }

  async getSnapshotHistory(tenantId: string, studentId: string, roleId: string, limit = 20): Promise<SnapshotRecord[]> {
    return db
      .select()
      .from(readinessSnapshots)
      .where(and(eq(readinessSnapshots.studentId, studentId), eq(readinessSnapshots.tenantId, tenantId), eq(readinessSnapshots.roleId, roleId)))
      .orderBy(desc(readinessSnapshots.createdAt))
      .limit(limit);
  }

  async insertAuditLog(params: {
    tenantId: string;
    studentId: string;
    roleId: string;
    fromState: string | null;
    toState: string;
    reason: string;
    triggeredBy: string;
  }): Promise<void> {
    await db.insert(readinessAuditLogs).values({ id: newId('audit'), ...params });
  }
}
