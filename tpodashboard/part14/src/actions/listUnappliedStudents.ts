import { z } from "zod";
import type { ActionDefinition } from "../registry/actionDefinition.js";
import { requireRole } from "../permissions/permissionGuard.js";
import { studentRepo } from "../db/seed.js";

const inputSchema = z.object({
  driveId: z.string().min(1),
});
type Input = z.infer<typeof inputSchema>;

/** LEVEL 0 - READ. No side effect, no confirmation. */
export const listUnappliedStudents: ActionDefinition<Input> = {
  actionType: "list_unapplied_students",
  category: "APPLICATION",
  description: "Show eligible students who have not yet applied to a drive.",
  baseRiskLevel: "READ",
  inputSchema,

  checkPermission: (_input, ctx) =>
    requireRole(ctx, ["TPO_HEAD", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "MANAGEMENT", "ADMIN"]),

  checkPolicy: () => ({ ok: true }),

  buildPreview: (input, ctx) => {
    const students = studentRepo.eligibleNotApplied(ctx.institutionId, input.driveId);
    const filtered = ctx.departments?.length ? students.filter((s) => ctx.departments!.includes(s.department)) : students;
    const breakdown: Record<string, number> = {};
    for (const s of filtered) breakdown[s.department] = (breakdown[s.department] ?? 0) + 1;
    return {
      headline: `${filtered.length} eligible students have not applied to ${input.driveId}`,
      audienceCount: filtered.length,
      audienceBreakdown: breakdown,
      irreversible: false,
    };
  },

  execute: async (input, ctx) => {
    const students = studentRepo.eligibleNotApplied(ctx.institutionId, input.driveId);
    const filtered = ctx.departments?.length ? students.filter((s) => ctx.departments!.includes(s.department)) : students;
    return {
      summary: `${filtered.length} eligible, not-applied students for ${input.driveId}.`,
      detail: { requested: filtered.length, succeeded: filtered.length, failed: 0, skipped: 0, errors: [] },
      raw: filtered.map((s) => ({ id: s.id, name: s.name, department: s.department })),
    };
  },
};
