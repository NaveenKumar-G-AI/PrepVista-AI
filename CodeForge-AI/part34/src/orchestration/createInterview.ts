// ============================================================================
// Use case: create interview. Wires Phase 5 (role context), Phase 8
// (blueprint), and Phase 34 (initial CREATED session state) together.
// Corresponds to the "create interview" capability in Phase 64's API list.
// ============================================================================

import { randomUUID } from "node:crypto";
import { BLUEPRINT_FACTORIES } from "../domain/blueprints/index.js";
import { validateBlueprint } from "../domain/blueprint.js";
import { INTERVIEW_ENGINE_VERSION, EVALUATION_PIPELINE_VERSION } from "../config/versions.js";
import {
  asInterviewDefinitionId,
  asSessionId,
  type ActorContext,
  type InterviewDefinition,
  type InterviewMode,
  type InterviewSession,
  type OrgId,
  type RoleId,
  type StudentId,
} from "../domain/types.js";
import type { AppContainer } from "./container.js";
import { requireAuthorized } from "./helpers.js";

export interface CreateInterviewInput {
  actor: ActorContext;
  orgId: OrgId;
  studentId: StudentId;
  roleId: RoleId;
  mode: InterviewMode;
  /** Required for SKILL_VERIFICATION and FOLLOW_UP_VERIFICATION modes (Phase 51). */
  targetSkillIds?: string[];
}

export interface CreateInterviewResult {
  definition: InterviewDefinition;
  session: InterviewSession;
}

export async function createInterview(container: AppContainer, input: CreateInterviewInput): Promise<CreateInterviewResult> {
  const { repositories, ports } = container;
  await requireAuthorized(ports.authz, input.actor, "INTERVIEW_CREATE", input.orgId, input.studentId);

  // Phase 5: role requirements come only from the existing role model — this
  // feature never invents them.
  const roleContext = await ports.roleRequirements.getRoleContext(input.roleId, input.orgId);

  const factory = BLUEPRINT_FACTORIES[input.mode];
  const blueprint = factory({
    roleId: input.roleId,
    skills: roleContext.skills,
    version: INTERVIEW_ENGINE_VERSION,
    targetSkillIds: input.targetSkillIds,
  });

  const validation = validateBlueprint(blueprint);
  if (!validation.ok) {
    // Defense in depth: buildBlueprint() already throws on an invalid
    // shape, so reaching this branch means something downstream mutated the
    // blueprint after construction — treat it as a hard configuration error.
    throw new Error(`Constructed blueprint failed validation: ${validation.errors.join("; ")}`);
  }

  await repositories.blueprints.save(blueprint, input.orgId);

  const definition: InterviewDefinition = {
    id: asInterviewDefinitionId(`def_${randomUUID()}`),
    blueprint,
    versionInfo: {
      interviewVersion: INTERVIEW_ENGINE_VERSION,
      roleModelVersion: roleContext.roleModelVersion,
      evaluationVersion: EVALUATION_PIPELINE_VERSION,
    },
    createdAt: new Date().toISOString(),
    createdBy: input.actor.userId,
  };
  await repositories.definitions.save(definition, input.orgId);

  const session: InterviewSession = {
    id: asSessionId(`sess_${randomUUID()}`),
    orgId: input.orgId,
    studentId: input.studentId,
    interviewDefinitionId: definition.id,
    roleId: input.roleId,
    mode: input.mode,
    state: "CREATED",
    versionInfo: definition.versionInfo,
    coverage: {},
    questionIds: [],
    createdAt: new Date().toISOString(),
  };
  await repositories.sessions.create(session);

  return { definition, session };
}
