// ============================================================================
// Phase 51 — "Support targeted technical interviews for uncertain skills...
// Role Gap -> SQL uncertain -> Skill Verification Interview -> SQL evidence
// -> Gap confidence updated. This should be a configurable interview mode."
//
// A thin convenience wrapper over createInterview(): it reads the existing
// Role Skill Gap Analysis (read-only), picks the gap skills worth targeting,
// and creates a SKILL_VERIFICATION session for exactly those. It does not
// duplicate gap-analysis logic — the selection rule below (HIGH/MEDIUM
// priority, non-MET) is intentionally the only "policy" this file contains.
// ============================================================================

import { createInterview, type CreateInterviewResult } from "./createInterview.js";
import type { ActorContext, OrgId, RoleId, StudentId } from "../domain/types.js";
import type { AppContainer } from "./container.js";
import { NotFoundError } from "./helpers.js";

export interface CreateGapVerificationInterviewInput {
  actor: ActorContext;
  orgId: OrgId;
  studentId: StudentId;
  roleId: RoleId;
  /** Cap on how many gap skills one interview targets, so it stays a short, focused session (Phase 51: "targeted"). */
  maxSkills?: number;
}

export async function createGapVerificationInterview(
  container: AppContainer,
  input: CreateGapVerificationInterviewInput,
): Promise<CreateInterviewResult> {
  const gaps = await container.ports.roleSkillGap.getSkillGaps(input.studentId, input.roleId, input.orgId);

  const targetSkillIds = gaps
    .filter((g) => g.gapState !== "MET" && (g.priority === "HIGH" || g.priority === "MEDIUM"))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, input.maxSkills ?? 3)
    .map((g) => g.skillId);

  if (targetSkillIds.length === 0) {
    throw new NotFoundError("Unresolved high/medium-priority role skill gaps for student", input.studentId);
  }

  return createInterview(container, {
    actor: input.actor,
    orgId: input.orgId,
    studentId: input.studentId,
    roleId: input.roleId,
    mode: "SKILL_VERIFICATION",
    targetSkillIds,
  });
}

function priorityRank(priority: "HIGH" | "MEDIUM" | "LOW"): number {
  return priority === "HIGH" ? 0 : priority === "MEDIUM" ? 1 : 2;
}
