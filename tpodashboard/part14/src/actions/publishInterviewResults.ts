import { z } from "zod";
import type { ActionDefinition } from "../registry/actionDefinition.js";
import { requireRole } from "../permissions/permissionGuard.js";
import { interviewRepo } from "../db/seed.js";
import { interviewService } from "../services/domainServices.js";

const inputSchema = z.object({
  driveId: z.string().min(1),
  // Typed confirmation: the actor must state why, per spec section 27
  // ("possibly typed confirmation" for very high-risk actions).
  confirmationReason: z.string().min(10, "Provide a brief reason (at least 10 characters) for publishing these results."),
});
type Input = z.infer<typeof inputSchema>;

/**
 * LEVEL 4 - HIGH_RISK. Publication is irreversible and institution-wide in
 * consequence. Only TPO_HEAD may initiate it, every result for the drive must
 * already be in "reviewed" status (spec section 54: "Do not let AI 'fix'
 * missing preconditions by guessing" — if some are still pending, this
 * action refuses outright rather than publishing a subset).
 */
export const publishInterviewResults: ActionDefinition<Input> = {
  actionType: "publish_interview_results",
  category: "INTERVIEW",
  description: "Publish reviewed interview results for a drive to students.",
  baseRiskLevel: "HIGH_RISK",
  inputSchema,

  checkPermission: (_input, ctx) => requireRole(ctx, ["TPO_HEAD"]),

  checkPolicy: () => ({ ok: true }),

  checkPreconditions: (input, ctx) => {
    const results = interviewRepo.forDrive(ctx.institutionId, input.driveId);
    if (results.length === 0) {
      return { ok: false, reason: `No interview results found for drive ${input.driveId}.` };
    }
    const pending = results.filter((r) => r.status === "pending");
    if (pending.length > 0) {
      return {
        ok: false,
        reason: `${pending.length} of ${results.length} results are still pending review. All results must be reviewed before publication.`,
      };
    }
    const alreadyPublished = results.every((r) => r.status === "published");
    if (alreadyPublished) {
      return { ok: false, reason: "All results for this drive are already published." };
    }
    return { ok: true };
  },

  buildPreview: (input, ctx) => {
    const results = interviewRepo.forDrive(ctx.institutionId, input.driveId);
    const toPublish = results.filter((r) => r.status === "reviewed");
    const selected = toPublish.filter((r) => r.outcome === "selected").length;
    return {
      headline: `Publish ${toPublish.length} interview results for ${input.driveId}`,
      audienceCount: toPublish.length,
      audienceBreakdown: { selected, rejected: toPublish.length - selected },
      diff: toPublish.slice(0, 5).map((r) => ({ target: r.studentId, from: "reviewed (unpublished)", to: "published" })),
      irreversible: true,
      extra: {
        reason: input.confirmationReason,
        note: toPublish.length > 5 ? `...and ${toPublish.length - 5} more.` : undefined,
      },
    };
  },

  execute: async (input, ctx) => {
    const { published } = await interviewService.publishResults(ctx.institutionId, input.driveId);
    return {
      summary: `${published} interview results published for ${input.driveId}.`,
      detail: { requested: published, succeeded: published, failed: 0, skipped: 0, errors: [] },
    };
  },
};
