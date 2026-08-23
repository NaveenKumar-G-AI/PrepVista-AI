import { z } from "zod";
import type { ActionDefinition } from "../registry/actionDefinition.js";
import { requireRole, resolveDepartmentScope } from "../permissions/permissionGuard.js";
import { checkBulkLimit } from "../permissions/policyGuard.js";
import { studentRepo } from "../db/seed.js";
import { trainingService } from "../services/trainingService.js";
import type { RiskLevel } from "../types/action.types.js";

const inputSchema = z.object({
  trainingName: z.string().min(1),
  readinessBelow: z.number().min(0).max(100),
  departments: z.array(z.string()).optional(),
});
type Input = z.infer<typeof inputSchema>;

function audienceFor(input: Input, institutionId: string, departments: string[] | undefined) {
  const base = studentRepo.belowReadiness(institutionId, input.readinessBelow);
  return departments?.length ? base.filter((s) => departments.includes(s.department)) : base;
}

/**
 * LEVEL 3 baseline, escalates to LEVEL 4 for very large cohorts (spec section
 * 55: "the same action can have different risk based on scope" — one draft
 * note is low risk, 500 status changes is high risk).
 */
export const assignTrainingToCohort: ActionDefinition<Input> = {
  actionType: "assign_training_to_cohort",
  category: "TRAINING",
  description: "Assign a training module to all students below a readiness threshold.",
  baseRiskLevel: "SENSITIVE_WRITE",
  inputSchema,

  checkPermission: (_input, ctx) =>
    requireRole(ctx, ["TPO_HEAD", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "ADMIN"]),

  checkPolicy: (input, ctx) => {
    const { departments } = resolveDepartmentScope(ctx, input.departments);
    const audience = audienceFor(input, ctx.institutionId, departments);
    return checkBulkLimit(audience.length);
  },

  computeRisk: (input, ctx): RiskLevel => {
    const { departments } = resolveDepartmentScope(ctx, input.departments);
    const count = audienceFor(input, ctx.institutionId, departments).length;
    return count > 200 ? "HIGH_RISK" : "SENSITIVE_WRITE";
  },

  buildPreview: (input, ctx) => {
    const { departments, narrowed } = resolveDepartmentScope(ctx, input.departments);
    const audience = audienceFor(input, ctx.institutionId, departments);
    const breakdown: Record<string, number> = {};
    for (const s of audience) breakdown[s.department] = (breakdown[s.department] ?? 0) + 1;
    return {
      headline: `Assign "${input.trainingName}" to ${audience.length} students with readiness below ${input.readinessBelow}`,
      audienceCount: audience.length,
      audienceBreakdown: breakdown,
      irreversible: false, // enrollments can be unassigned; the action registers no rollback here to keep the example focused
      extra: narrowed
        ? { scopeNote: `Your role restricts this action to your assigned department(s): ${departments?.join(", ")}.` }
        : undefined,
    };
  },

  execute: async (input, ctx, idempotencyKey) => {
    const { departments } = resolveDepartmentScope(ctx, input.departments);
    const audience = audienceFor(input, ctx.institutionId, departments);
    const detail = await trainingService.assignBulk(
      audience.map((s) => s.id),
      input.trainingName,
      idempotencyKey
    );
    return {
      summary: `${detail.succeeded} assigned, ${detail.skipped} skipped (already enrolled), ${detail.failed} failed.`,
      detail,
    };
  },
};
