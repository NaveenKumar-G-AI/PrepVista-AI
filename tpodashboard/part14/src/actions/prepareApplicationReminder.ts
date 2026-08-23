import { z } from "zod";
import type { ActionDefinition } from "../registry/actionDefinition.js";
import { requireRole } from "../permissions/permissionGuard.js";
import { studentRepo } from "../db/seed.js";
import { wrapUntrustedText } from "../security/sanitize.js";

const inputSchema = z.object({
  driveId: z.string().min(1),
  deadlineText: z.string().min(1),
});
type Input = z.infer<typeof inputSchema>;

/** LEVEL 1 - PREPARE. Produces a draft only; no consequential state change, no confirmation gate. */
export const prepareApplicationReminder: ActionDefinition<Input> = {
  actionType: "prepare_application_reminder",
  category: "COMMUNICATION",
  description: "Draft (but do not send) an application deadline reminder for a drive.",
  baseRiskLevel: "PREPARE",
  inputSchema,

  checkPermission: (_input, ctx) =>
    requireRole(ctx, ["TPO_HEAD", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "ADMIN"]),

  checkPolicy: () => ({ ok: true }),

  buildPreview: (input, ctx) => {
    const audience = studentRepo.eligibleNotApplied(ctx.institutionId, input.driveId);
    // deadlineText may ultimately trace back to drive metadata pulled from an
    // uploaded JD/notice; treat it as untrusted display data, never as an
    // instruction (spec sections 65-66).
    const safeDeadline = wrapUntrustedText("drive deadline text", input.deadlineText);
    return {
      headline: `Draft reminder for ${audience.length} students who haven't applied to ${input.driveId}`,
      audienceCount: audience.length,
      channel: "In-App",
      message: `Applications for ${input.driveId} close ${input.deadlineText}.`,
      irreversible: false,
      extra: { note: "Draft only. No message will be sent until send_application_reminder is proposed, previewed and confirmed.", safeDeadline },
    };
  },

  execute: async (input, ctx) => {
    const audience = studentRepo.eligibleNotApplied(ctx.institutionId, input.driveId);
    return {
      summary: `Draft prepared for ${audience.length} students. Nothing was sent.`,
      detail: { requested: audience.length, succeeded: audience.length, failed: 0, skipped: 0, errors: [] },
    };
  },
};
