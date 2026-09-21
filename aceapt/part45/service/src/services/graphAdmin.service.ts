import { skillRepository } from '../repositories/skill.repository';
import { relationshipRepository } from '../repositories/relationship.repository';
import { graphVersionRepository } from '../repositories/graphVersion.repository';
import { loadGraphSnapshot, invalidateGraphCache } from './graphQuery.service';
import { runFullValidation } from './graphValidation.service';
import { ApiError } from '../api/middleware/errorHandler';
import { zDomain, zSkillLevel, zRelationshipType, zRelationshipSource, zSkillCode, zEvidenceConfidence } from '../domain/enums';
import { z } from 'zod';
import type { ValidationReport } from '../domain/types';

// -----------------------------------------------------------------------
// VERSIONING MODEL (documented here because it's a deliberate scope
// decision, not an oversight): skills/relationships are edited IN PLACE —
// same row, same id, same stable `code` for the life of the skill — rather
// than as full immutable per-version snapshots. GraphVersion is a
// publication checkpoint/audit marker (spec section 20's effective_from /
// effective_to / status fields), not a container that gets copied on every
// edit. This satisfies the spec's versioning requirements (DRAFT -> REVIEW
// -> VALIDATED -> PUBLISHED -> ARCHIVED lifecycle, gated publishing, a
// queryable history of what was live when) without the schema complexity
// of reconciling duplicate rows sharing one stable code across snapshots.
//
// Known limitation (see README): because this is edit-in-place rather than
// full snapshots, rollback repoints the "current version" marker but does
// NOT reconstruct prior field-level values of edited skills/relationships —
// that would need a proper audit/diff log, which is a reasonable next
// increment rather than something this reference build includes.
// -----------------------------------------------------------------------

export const CreateSkillInput = z.object({
  code: zSkillCode,
  displayName: z.string().min(1).max(200),
  domain: zDomain,
  level: zSkillLevel,
  description: z.string().max(2000).optional(),
  parentId: z.string().optional(),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInput>;

export const UpdateSkillInput = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  parentId: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'VALIDATED', 'ARCHIVED']).optional(), // PUBLISHED is only reachable via publish()
});
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;

export const CreateRelationshipInput = z.object({
  fromSkillId: z.string(),
  toSkillId: z.string(),
  relationshipType: zRelationshipType,
  weight: z.number().min(0).max(1).default(1),
  confidence: zEvidenceConfidence.default('MODERATE'),
  source: zRelationshipSource,
  rationale: z.string().max(500).optional(),
});
export type CreateRelationshipInput = z.infer<typeof CreateRelationshipInput>;

export const UpdateRelationshipInput = z.object({
  weight: z.number().min(0).max(1).optional(),
  confidence: zEvidenceConfidence.optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'VALIDATED', 'ARCHIVED']).optional(),
  rationale: z.string().max(500).optional(),
});
export type UpdateRelationshipInput = z.infer<typeof UpdateRelationshipInput>;

/** The single mutable "in progress" version that new/edited content is stamped with until the next publish. */
async function getOrCreateWorkingVersion() {
  const all = await graphVersionRepository.listAll();
  const working = all.find((v) => v.status === 'DRAFT');
  if (working) return working;
  const label = `draft-${new Date().toISOString().slice(0, 19)}`;
  return graphVersionRepository.create(label, 'Auto-created working version for in-progress edits.');
}

export async function createSkill(input: CreateSkillInput) {
  const existing = await skillRepository.findByCode(input.code);
  if (existing) throw new ApiError(409, 'SKILL_CODE_EXISTS', `Skill code "${input.code}" already exists.`);
  if (input.parentId) {
    const parent = await skillRepository.findById(input.parentId);
    if (!parent) throw new ApiError(400, 'INVALID_PARENT', `parentId "${input.parentId}" does not exist.`);
  }
  const version = await getOrCreateWorkingVersion();
  const skill = await skillRepository.create({
    code: input.code,
    displayName: input.displayName,
    domain: input.domain,
    level: input.level,
    description: input.description,
    parentId: input.parentId ?? null,
    status: 'DRAFT',
    graphVersionId: version.id,
  });
  invalidateGraphCache();
  return skill;
}

export async function updateSkill(skillId: string, input: UpdateSkillInput) {
  const existing = await skillRepository.findById(skillId);
  if (!existing) throw new ApiError(404, 'SKILL_NOT_FOUND', `Skill ${skillId} does not exist.`);
  if (input.parentId) {
    const parent = await skillRepository.findById(input.parentId);
    if (!parent) throw new ApiError(400, 'INVALID_PARENT', `parentId "${input.parentId}" does not exist.`);
    if (input.parentId === skillId) throw new ApiError(400, 'INVALID_PARENT', 'A skill cannot be its own parent.');
  }
  const updated = await skillRepository.update(skillId, input);
  invalidateGraphCache();
  return updated;
}

export async function createRelationship(input: CreateRelationshipInput) {
  const [from, to] = await Promise.all([skillRepository.findById(input.fromSkillId), skillRepository.findById(input.toSkillId)]);
  if (!from) throw new ApiError(400, 'INVALID_FROM_SKILL', `fromSkillId "${input.fromSkillId}" does not exist.`);
  if (!to) throw new ApiError(400, 'INVALID_TO_SKILL', `toSkillId "${input.toSkillId}" does not exist.`);
  if (input.fromSkillId === input.toSkillId) throw new ApiError(400, 'SELF_RELATIONSHIP', 'A skill cannot have a relationship to itself.');

  const version = await getOrCreateWorkingVersion();
  const relationship = await relationshipRepository.create({
    fromSkillId: input.fromSkillId,
    toSkillId: input.toSkillId,
    relationshipType: input.relationshipType,
    weight: input.weight,
    confidence: input.confidence,
    source: input.source,
    rationale: input.rationale,
    status: 'DRAFT',
    graphVersionId: version.id,
  });
  invalidateGraphCache();
  return relationship;
}

export async function updateRelationship(relationshipId: string, input: UpdateRelationshipInput) {
  const existing = await relationshipRepository.findById(relationshipId);
  if (!existing) throw new ApiError(404, 'RELATIONSHIP_NOT_FOUND', `Relationship ${relationshipId} does not exist.`);
  const updated = await relationshipRepository.update(relationshipId, input);
  invalidateGraphCache();
  return updated;
}

/** Section 59: run the full integrity suite against what the graph WOULD look like — used both as a standalone check and as the publish gate. */
export async function validateProposedGraph(): Promise<ValidationReport> {
  const snapshot = await loadGraphSnapshot(undefined); // all statuses except ARCHIVED-only concerns — see filter below
  const activeNodes = snapshot.nodes.filter((n) => n.status !== 'ARCHIVED');
  const activeEdges = snapshot.edges.filter((e) => e.status !== 'ARCHIVED');
  return runFullValidation(activeNodes, activeEdges);
}

export interface PublishResult {
  published: boolean;
  versionId?: string;
  versionLabel?: string;
  report: ValidationReport;
  skillsPublished?: number;
  relationshipsPublished?: number;
}

/** Section 59: "Publishing should fail when critical integrity issues exist." */
export async function publishPendingChanges(): Promise<PublishResult> {
  const report = await validateProposedGraph();
  if (!report.isValid) {
    return { published: false, report };
  }

  const working = await getOrCreateWorkingVersion();
  const previousActive = await graphVersionRepository.getActivePublished();

  const pendingSkills = (await skillRepository.listAll()).filter((s) => s.status === 'VALIDATED' || s.status === 'REVIEW' || s.status === 'DRAFT');
  const pendingRelationships = (await relationshipRepository.listAll()).filter((r) => r.status === 'VALIDATED' || r.status === 'REVIEW' || r.status === 'DRAFT');

  for (const skill of pendingSkills) {
    await skillRepository.update(skill.id, { status: 'PUBLISHED', graphVersionId: working.id });
  }
  for (const rel of pendingRelationships) {
    await relationshipRepository.update(rel.id, { status: 'PUBLISHED', graphVersionId: working.id });
  }

  await graphVersionRepository.updateStatus(working.id, 'PUBLISHED', { effectiveFrom: new Date() });
  if (previousActive && previousActive.id !== working.id) {
    await graphVersionRepository.updateStatus(previousActive.id, 'ARCHIVED', { effectiveTo: new Date() });
  }

  invalidateGraphCache();
  return {
    published: true,
    versionId: working.id,
    versionLabel: working.versionLabel,
    report,
    skillsPublished: pendingSkills.length,
    relationshipsPublished: pendingRelationships.length,
  };
}

/**
 * Simplified rollback (see the module-level note above): repoints which
 * GraphVersion is considered "active" for audit/reporting. Does not revert
 * field-level edits made to individual skills/relationships since that
 * version was superseded — see README "Known limitations".
 */
export async function rollbackToVersion(versionId: string) {
  const target = await graphVersionRepository.getById(versionId);
  if (!target) throw new ApiError(404, 'VERSION_NOT_FOUND', `Graph version ${versionId} does not exist.`);
  if (target.status !== 'ARCHIVED') throw new ApiError(400, 'INVALID_ROLLBACK_TARGET', 'Can only roll back to an ARCHIVED version.');

  const currentActive = await graphVersionRepository.getActivePublished();
  if (currentActive) {
    await graphVersionRepository.updateStatus(currentActive.id, 'ARCHIVED', { effectiveTo: new Date() });
  }
  const restored = await graphVersionRepository.updateStatus(target.id, 'PUBLISHED', { effectiveFrom: new Date(), effectiveTo: null });
  invalidateGraphCache();
  return restored;
}
