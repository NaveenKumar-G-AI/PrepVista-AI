import { z } from "zod";
import type { ActionDefinition } from "../registry/actionDefinition.js";
import { requireRole, resolveDepartmentScope } from "../permissions/permissionGuard.js";
import { checkBulkLimit } from "../permissions/policyGuard.js";
import { studentRepo } from "../db/seed.js";
import { communicationService } from "../services/communicationService.js";

const inputSchema = z.object({
  driveId: z.string().min(1),
  message: z.string().min(1),
  channel: z.enum(["in_app", "email", "sms"]).default("in_app"),
  departments: z.array(z.string()).optional(),
});
type Input = z.infer<typeof inputSchema>;

function audienceFor(input: Input, institutionId: string, departments: string[] | undefined) {
  const base = studentRepo.eligibleNotApplied(institutionId, input.driveId).filter((s) => !s.optedOutOfComms);
  return departments?.length ? base.filter((s) => departments.includes(s.department)) : base;
}

/** LEVEL 3 - SENSITIVE_WRITE. Always requires confirmation. Routes through Part 9's CommunicationService. */
export const sendApplicationReminder: ActionDefinition<Input> = {
  actionType: "send_application_reminder",
  category: "COMMUNICATION",
  description: "Send an application deadline reminder to eligible students who have not applied to a drive.",
  baseRiskLevel: "SENSITIVE_WRITE",
  inputSchema,

  checkPermission: (_input, ctx) =>
    requireRole(ctx, ["TPO_HEAD", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "ADMIN"]),

  checkPolicy: (input, ctx) => {
    const { departments } = resolveDepartmentScope(ctx, input.departments);
    const audience = audienceFor(input, ctx.institutionId, departments);
    return checkBulkLimit(audience.length);
  },

  buildPreview: (input, ctx) => {
    const { departments, narrowed } = resolveDepartmentScope(ctx, input.departments);
    const audience = audienceFor(input, ctx.institutionId, departments);
    const breakdown: Record<string, number> = {};
    for (const s of audience) breakdown[s.department] = (breakdown[s.department] ?? 0) + 1;
    return {
      headline: `Send application reminder to ${audience.length} students`,
      audienceCount: audience.length,
      audienceBreakdown: breakdown,
      channel: input.channel === "in_app" ? "In-App" : input.channel === "email" ? "Email" : "SMS",
      schedule: "Immediately",
      message: input.message,
      irreversible: true,
      extra: narrowed
        ? { scopeNote: `Your role restricts this action to your assigned department(s): ${departments?.join(", ")}.` }
        : undefined,
    };
  },

  execute: async (input, ctx, idempotencyKey) => {
    const { departments } = resolveDepartmentScope(ctx, input.departments);
    const audience = audienceFor(input, ctx.institutionId, departments);
    const detail = await communicationService.sendBulk(
      audience.map((s) => ({ id: s.id, name: s.name })),
      input.message,
      input.channel,
      idempotencyKey
    );
    return {
      summary: `${detail.succeeded}/${detail.requested} delivered, ${detail.failed} failed.`,
      detail,
    };
  },
};
