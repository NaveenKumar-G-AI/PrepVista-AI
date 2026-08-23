import { z } from "zod";
import type { ActionDefinition } from "../registry/actionDefinition.js";
import { requireRole } from "../permissions/permissionGuard.js";
import { studentRepo } from "../db/seed.js";
import { communicationService } from "../services/communicationService.js";

const inputSchema = z.object({
  studentId: z.string().min(1),
  driveId: z.string().min(1),
});
type Input = z.infer<typeof inputSchema>;

/**
 * LEVEL 2 - LOW_RISK_WRITE, single-recipient notification. Registered as
 * PRE_APPROVED in institution policy with maxAutonomousRecipients = 1, so the
 * automation rule engine can fire this end-to-end when a single interview
 * result is published, without requiring a human click for every one-line
 * notification (spec section 50 example: "When an interview result is
 * published -> notify student"). Note this is a single-student notification,
 * distinct from — and much lower-risk than — the bulk publish_interview_results
 * action itself, which always requires explicit TPO_HEAD confirmation.
 */
export const notifyStudentResultPublished: ActionDefinition<Input> = {
  actionType: "notify_student_result_published",
  category: "COMMUNICATION",
  description: "Notify a single student that their interview result has been published.",
  baseRiskLevel: "LOW_RISK_WRITE",
  inputSchema,

  checkPermission: (_input, ctx) => requireRole(ctx, ["ADMIN", "TPO_HEAD", "PLACEMENT_OFFICER"]),

  checkPolicy: () => ({ ok: true }),

  buildPreview: (input) => ({
    headline: `Notify ${input.studentId} that their result for ${input.driveId} is published`,
    audienceCount: 1,
    channel: "In-App",
    irreversible: false,
  }),

  execute: async (input, ctx, idempotencyKey) => {
    const student = studentRepo.byId(input.studentId);
    const detail = await communicationService.sendBulk(
      student ? [{ id: student.id, name: student.name }] : [{ id: input.studentId, name: input.studentId }],
      `Your interview result for ${input.driveId} has been published. Check your dashboard.`,
      "in_app",
      idempotencyKey
    );
    return { summary: `Notified ${detail.succeeded}/${detail.requested}.`, detail };
  },
};
