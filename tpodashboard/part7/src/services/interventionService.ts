import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import { intervention, interventionAssignment, INTERVENTION_ASSIGNMENT_TRANSITIONS, student } from "../db/schema";
import { newId } from "../lib/id";
import { eventBus } from "../lib/eventBus";
import { recordAudit } from "../lib/audit";
import { ConflictError, InvalidTransitionError, NotFoundError } from "../lib/errors";
import { getSkillGaps, largestGap } from "./skillGapService";
import { getLatestSnapshot } from "./readinessService";

const ACTIVE_STATUSES = ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS"] as const satisfies readonly (typeof interventionAssignment.$inferInsert)["status"][];

export async function createIntervention(input: {
  institutionId: string;
  seasonId: string;
  name: string;
  type: string;
  objective: string;
  targetSkillId?: string;
  priority: string;
  createdBy: string;
}) {
  const [row] = await db
    .insert(intervention)
    .values({
      id: newId("intv"),
      institutionId: input.institutionId,
      seasonId: input.seasonId,
      name: input.name,
      type: input.type as typeof intervention.$inferInsert.type,
      objective: input.objective,
      targetSkillId: input.targetSkillId,
      priority: input.priority as typeof intervention.$inferInsert.priority,
      createdBy: input.createdBy,
    })
    .returning();
  await eventBus.publish({ type: "INTERVENTION_CREATED", institutionId: input.institutionId, payload: { interventionId: row.id, name: row.name } });
  return row;
}

/** Builds the "why was this student selected" text from real evidence
 *  (spec §38) — never a generic placeholder. */
export async function buildAssignmentReason(studentId: string, focusCategory?: string) {
  const gapResult = await getSkillGaps(studentId);
  const snapshot = await getLatestSnapshot(studentId);
  const gap = focusCategory ? gapResult.gaps.find((g) => g.category === focusCategory) : largestGap(gapResult.gaps);

  if (!gap) {
    return {
      reason: snapshot?.overallScore != null ? `Overall readiness is ${snapshot.overallScore}; no single category is significantly below target.` : "Selected manually — not enough assessment data yet to compute a specific gap.",
      evidence: snapshot ? { overallScore: snapshot.overallScore, riskLevel: snapshot.riskLevel } : {},
    };
  }

  return {
    reason: `${gap.category} readiness is ${gap.currentScore}, ${gap.gap} points below the ${gap.target} target (based on ${gap.evidenceCount} data point${gap.evidenceCount === 1 ? "" : "s"}).`,
    evidence: { category: gap.category, currentScore: gap.currentScore, target: gap.target, gap: gap.gap, evidenceCount: gap.evidenceCount, riskLevel: snapshot?.riskLevel ?? "UNKNOWN" },
  };
}

export async function assignIntervention(input: {
  interventionId: string;
  studentId: string;
  institutionId: string;
  assignedBy: string;
  priority: string;
  dueDate?: Date;
  reason?: string;
  evidence?: Record<string, unknown>;
  linkedEnrollmentId?: string;
}) {
  const existingActive = await db
    .select()
    .from(interventionAssignment)
    .where(
      and(
        eq(interventionAssignment.interventionId, input.interventionId),
        eq(interventionAssignment.studentId, input.studentId),
        inArray(interventionAssignment.status, [...ACTIVE_STATUSES])
      )
    );
  if (existingActive.length > 0) {
    throw new ConflictError(`Student ${input.studentId} already has an active assignment for this intervention`);
  }

  const built = input.reason ? { reason: input.reason, evidence: input.evidence ?? {} } : await buildAssignmentReason(input.studentId);

  const [row] = await db
    .insert(interventionAssignment)
    .values({
      id: newId("ia"),
      interventionId: input.interventionId,
      studentId: input.studentId,
      assignedBy: input.assignedBy,
      reason: built.reason,
      evidence: built.evidence,
      priority: input.priority as typeof interventionAssignment.$inferInsert.priority,
      dueDate: input.dueDate,
      linkedEnrollmentId: input.linkedEnrollmentId,
    })
    .returning();

  await eventBus.publish({
    type: "INTERVENTION_ASSIGNED",
    institutionId: input.institutionId,
    studentId: input.studentId,
    payload: { assignmentId: row.id, interventionId: input.interventionId, reason: built.reason },
  });

  return row;
}

/** Skips (rather than fails on) students who already have an active
 *  assignment, and reports both buckets — mirrors trainingService.bulkEnroll. */
export async function bulkAssignIntervention(input: {
  interventionId: string;
  institutionId: string;
  studentIds: string[];
  assignedBy: string;
  priority: string;
  dueDate?: Date;
}) {
  const assigned: string[] = [];
  const skipped: string[] = [];
  for (const studentId of input.studentIds) {
    try {
      await assignIntervention({ ...input, studentId });
      assigned.push(studentId);
    } catch (err) {
      if (err instanceof ConflictError) skipped.push(studentId);
      else throw err;
    }
  }
  return { assignedCount: assigned.length, skippedCount: skipped.length, assigned, skipped };
}

export async function transitionAssignmentStatus(assignmentId: string, toStatus: string, institutionId: string, actorId: string) {
  const [assignment] = await db.select().from(interventionAssignment).where(eq(interventionAssignment.id, assignmentId));
  if (!assignment) throw new NotFoundError("InterventionAssignment", assignmentId);

  const allowed = INTERVENTION_ASSIGNMENT_TRANSITIONS[assignment.status] ?? [];
  if (!allowed.includes(toStatus)) throw new InvalidTransitionError("InterventionAssignment", assignment.status, toStatus);

  const patch: Partial<typeof interventionAssignment.$inferInsert> = { status: toStatus as typeof assignment.status };
  if (toStatus === "ACKNOWLEDGED") patch.acknowledgedAt = new Date();
  if (toStatus === "COMPLETED") patch.completedAt = new Date();

  await db.update(interventionAssignment).set(patch).where(eq(interventionAssignment.id, assignmentId));
  await recordAudit({
    institutionId,
    actorId,
    action: "INTERVENTION_ASSIGNMENT_STATUS_CHANGED",
    entityType: "InterventionAssignment",
    entityId: assignmentId,
    oldValue: { status: assignment.status },
    newValue: { status: toStatus },
  });

  if (toStatus === "IN_PROGRESS") await eventBus.publish({ type: "INTERVENTION_STARTED", institutionId, studentId: assignment.studentId, payload: { assignmentId } });
  if (toStatus === "COMPLETED") await eventBus.publish({ type: "INTERVENTION_COMPLETED", institutionId, studentId: assignment.studentId, payload: { assignmentId } });

  return { ...assignment, ...patch };
}

/** Represents the scheduled job spec §51 calls for — run this on a timer in
 *  the real system. Returns what it changed rather than just a count, so
 *  callers/tests can verify. */
export async function detectOverdueAssignments(institutionId: string) {
  const now = new Date();
  const candidates = await db
    .select()
    .from(interventionAssignment)
    .where(and(inArray(interventionAssignment.status, [...ACTIVE_STATUSES]), lt(interventionAssignment.dueDate, now)));

  const flipped: string[] = [];
  for (const c of candidates) {
    await db.update(interventionAssignment).set({ status: "OVERDUE" }).where(eq(interventionAssignment.id, c.id));
    await eventBus.publish({ type: "INTERVENTION_OVERDUE", institutionId, studentId: c.studentId, payload: { assignmentId: c.id, dueDate: c.dueDate } });
    flipped.push(c.id);
  }
  return { flippedCount: flipped.length, flippedIds: flipped };
}

/** "Students Needing Action" table (spec §39): every student with a
 *  currently-active or overdue assignment, enriched with readiness/risk/gap. */
export async function getInterventionWorkbench(institutionId: string) {
  const assignments = await db
    .select()
    .from(interventionAssignment)
    .innerJoin(intervention, eq(interventionAssignment.interventionId, intervention.id))
    .where(and(eq(intervention.institutionId, institutionId), inArray(interventionAssignment.status, [...ACTIVE_STATUSES, "OVERDUE"])));

  const rows = [];
  for (const a of assignments) {
    const [s] = await db.select().from(student).where(eq(student.id, a.intervention_assignment.studentId));
    const snapshot = await getLatestSnapshot(a.intervention_assignment.studentId);
    const gaps = await getSkillGaps(a.intervention_assignment.studentId);
    rows.push({
      studentId: a.intervention_assignment.studentId,
      studentName: s?.name ?? "Unknown",
      department: s?.department ?? "Unknown",
      readiness: snapshot?.overallScore ?? null,
      risk: snapshot?.riskLevel ?? "UNKNOWN",
      primaryGap: largestGap(gaps.gaps)?.category ?? null,
      interventionName: a.intervention.name,
      status: a.intervention_assignment.status,
      dueDate: a.intervention_assignment.dueDate,
      assignmentId: a.intervention_assignment.id,
    });
  }
  return rows;
}

// ---- Read helper backing the AI tool contracts (spec §60, §88) ------------

export async function getStudentInterventions(studentId: string) {
  const assignments = await db
    .select()
    .from(interventionAssignment)
    .innerJoin(intervention, eq(interventionAssignment.interventionId, intervention.id))
    .where(eq(interventionAssignment.studentId, studentId));
  return assignments.map((a) => ({ assignment: a.intervention_assignment, intervention: a.intervention }));
}
