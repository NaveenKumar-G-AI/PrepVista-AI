import { z } from "zod";
import type { ActionDefinition } from "../registry/actionDefinition.js";
import { requireOwnStudentRecord } from "../permissions/permissionGuard.js";
import { offerRepo } from "../db/seed.js";
import { offerService } from "../services/domainServices.js";

const inputSchema = z.object({
  offerId: z.string().min(1),
  studentId: z.string().min(1),
});
type Input = z.infer<typeof inputSchema>;

/**
 * Student self-service action (spec sections 46-48). High-risk in
 * consequence (accepting an offer is close to irreversible in the real
 * workflow) but strictly scoped: a student may only ever act on their own
 * offer, never another student's, and the action still routes through
 * Part 6's normal offer service rather than mutating offer state directly
 * (spec section 47: "Then use Part 6 service").
 */
export const acceptOffer: ActionDefinition<Input> = {
  actionType: "accept_offer",
  category: "OFFER",
  description: "Accept a placement offer (student self-service).",
  baseRiskLevel: "HIGH_RISK",
  inputSchema,

  checkPermission: (input, ctx) => {
    if (ctx.role !== "STUDENT") {
      return { ok: false, reason: "Only the student may accept their own offer." };
    }
    return requireOwnStudentRecord(ctx, input.studentId);
  },

  checkPolicy: (input, ctx) => {
    const offer = offerRepo.byId(ctx.institutionId, input.offerId);
    if (!offer) return { ok: false, reason: "Offer not found." };
    if (offer.studentId !== input.studentId) return { ok: false, reason: "This offer does not belong to the requesting student." };
    return { ok: true };
  },

  checkPreconditions: (input, ctx) => {
    const offer = offerRepo.byId(ctx.institutionId, input.offerId)!;
    if (offer.status !== "pending") {
      return { ok: false, reason: `Offer is already ${offer.status}; it can no longer be accepted.` };
    }
    return { ok: true };
  },

  buildPreview: (input, ctx) => {
    const offer = offerRepo.byId(ctx.institutionId, input.offerId)!;
    return {
      headline: `Accept offer from ${offer.company}`,
      irreversible: true,
      extra: { company: offer.company, ctc: offer.ctc, acceptanceDeadline: offer.deadline },
    };
  },

  execute: async (input, ctx) => {
    const offer = await offerService.acceptOffer(ctx.institutionId, input.offerId);
    return {
      summary: `Offer from ${offer.company} accepted.`,
      detail: { requested: 1, succeeded: 1, failed: 0, skipped: 0, errors: [] },
      raw: offer,
    };
  },
};
