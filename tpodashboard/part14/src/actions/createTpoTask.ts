import { z } from "zod";
import type { ActionDefinition } from "../registry/actionDefinition.js";
import { requireRole } from "../permissions/permissionGuard.js";
import { taskService } from "../services/domainServices.js";

const inputSchema = z.object({
  title: z.string().min(1),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});
type Input = z.infer<typeof inputSchema>;

/**
 * LEVEL 2 - LOW_RISK_WRITE. Institution policy (policyGuard.institutionPolicy)
 * marks this action PRE_APPROVED, so it executes immediately without an
 * explicit confirmation click when initiated by a human (spec section 8:
 * "May execute immediately if configured by institution policy").
 */
export const createTpoTask: ActionDefinition<Input> = {
  actionType: "create_tpo_task",
  category: "TASK",
  description: "Create an internal TPO task/reminder.",
  baseRiskLevel: "LOW_RISK_WRITE",
  inputSchema,

  checkPermission: (_input, ctx) =>
    requireRole(ctx, ["TPO_HEAD", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "MANAGEMENT", "ADMIN"]),

  checkPolicy: () => ({ ok: true }),

  buildPreview: (input) => ({
    headline: `Create task: "${input.title}"`,
    irreversible: false,
    extra: { dueDate: input.dueDate, priority: input.priority },
  }),

  execute: async (input, ctx) => {
    const task = await taskService.create(ctx.institutionId, ctx.userId, input.title, input.dueDate, input.priority);
    return {
      summary: `Task "${task.title}" created.`,
      detail: { requested: 1, succeeded: 1, failed: 0, skipped: 0, errors: [] },
      raw: task,
    };
  },
};
