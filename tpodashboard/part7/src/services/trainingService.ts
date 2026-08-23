import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import {
  trainingProgram,
  TRAINING_PROGRAM_TRANSITIONS,
  trainingCohort,
  trainingCohortMember,
  trainingSession,
  trainingEnrollment,
  ENROLLMENT_TRANSITIONS,
  trainingAttendance,
  student,
} from "../db/schema";
import { newId } from "../lib/id";
import { eventBus } from "../lib/eventBus";
import { recordAudit } from "../lib/audit";
import { ConflictError, InvalidTransitionError, NotFoundError, ValidationError } from "../lib/errors";
import { THRESHOLDS } from "../config/thresholds";
import { getLatestSnapshot } from "./readinessService";

// ---- Programs --------------------------------------------------------------

export async function createProgram(input: {
  institutionId: string;
  seasonId: string;
  name: string;
  description?: string;
  categoryId: string;
  targetSkillIds?: string[];
  trainerUserId?: string;
  capacity?: number;
  startDate?: Date;
  endDate?: Date;
  createdBy: string;
}) {
  const [row] = await db
    .insert(trainingProgram)
    .values({ id: newId("prog"), ...input, targetSkillIds: input.targetSkillIds ?? [] })
    .returning();
  await eventBus.publish({
    type: "TRAINING_PROGRAM_CREATED",
    institutionId: input.institutionId,
    payload: { programId: row.id, name: row.name },
  });
  return row;
}

export async function transitionProgramStatus(programId: string, toStatus: string, actorId: string, institutionId: string) {
  const [program] = await db.select().from(trainingProgram).where(eq(trainingProgram.id, programId));
  if (!program) throw new NotFoundError("TrainingProgram", programId);

  const allowed = TRAINING_PROGRAM_TRANSITIONS[program.status] ?? [];
  if (!allowed.includes(toStatus)) throw new InvalidTransitionError("TrainingProgram", program.status, toStatus);

  await db.update(trainingProgram).set({ status: toStatus as typeof program.status, updatedAt: new Date() }).where(eq(trainingProgram.id, programId));
  await recordAudit({
    institutionId,
    actorId,
    action: "TRAINING_PROGRAM_STATUS_CHANGED",
    entityType: "TrainingProgram",
    entityId: programId,
    oldValue: { status: program.status },
    newValue: { status: toStatus },
  });

  if (toStatus === "IN_PROGRESS") {
    await eventBus.publish({ type: "TRAINING_PROGRAM_STARTED", institutionId, payload: { programId } });
  }
  if (toStatus === "COMPLETED") {
    await eventBus.publish({ type: "TRAINING_PROGRAM_COMPLETED", institutionId, payload: { programId } });
  }
  return { ...program, status: toStatus };
}

// ---- Cohorts + student selection (spec §12, §17, §49) ---------------------

export type StudentSelector =
  | { kind: "STUDENT_IDS"; studentIds: string[] }
  | { kind: "DEPARTMENT"; department: string }
  | { kind: "COHORT"; cohortId: string }
  | { kind: "READINESS_SEGMENT"; category: string; belowScore: number };

export async function createCohort(input: {
  institutionId: string;
  seasonId: string;
  name: string;
  ruleType: string;
  rule?: Record<string, unknown> | null;
  createdBy: string;
  staticStudentIds?: string[];
}) {
  const [cohort] = await db
    .insert(trainingCohort)
    .values({
      id: newId("cohort"),
      institutionId: input.institutionId,
      seasonId: input.seasonId,
      name: input.name,
      ruleType: input.ruleType as typeof trainingCohort.$inferInsert.ruleType,
      rule: input.rule ?? null,
      createdBy: input.createdBy,
    })
    .returning();

  if (input.ruleType === "STATIC" && input.staticStudentIds?.length) {
    await db.insert(trainingCohortMember).values(
      input.staticStudentIds.map((studentId) => ({
        id: newId("cm"),
        cohortId: cohort.id,
        studentId,
        addedBy: input.createdBy,
      }))
    );
  }

  return cohort;
}

export async function resolveCohortMembers(cohortId: string): Promise<string[]> {
  const [cohort] = await db.select().from(trainingCohort).where(eq(trainingCohort.id, cohortId));
  if (!cohort) throw new NotFoundError("TrainingCohort", cohortId);

  if (cohort.ruleType === "STATIC" || cohort.ruleType === "CUSTOM") {
    const members = await db.select().from(trainingCohortMember).where(eq(trainingCohortMember.cohortId, cohortId));
    return members.map((m) => m.studentId);
  }

  const rule = (cohort.rule ?? {}) as Record<string, unknown>;
  if (cohort.ruleType === "DEPARTMENT") {
    return resolveSelector(cohort.institutionId, cohort.seasonId, { kind: "DEPARTMENT", department: String(rule.department) });
  }
  if (cohort.ruleType === "READINESS_SEGMENT" || cohort.ruleType === "SKILL_GAP") {
    return resolveSelector(cohort.institutionId, cohort.seasonId, {
      kind: "READINESS_SEGMENT",
      category: String(rule.category),
      belowScore: Number(rule.belowScore),
    });
  }
  return [];
}

/** Shared selector used by both training bulk-assignment and intervention
 *  bulk-assignment (spec §17, §49, §94 demo: "Technical Interview Readiness < 55"). */
export async function resolveSelector(institutionId: string, seasonId: string, selector: StudentSelector): Promise<string[]> {
  switch (selector.kind) {
    case "STUDENT_IDS":
      return selector.studentIds;
    case "DEPARTMENT": {
      const rows = await db
        .select({ id: student.id })
        .from(student)
        .where(and(eq(student.institutionId, institutionId), eq(student.seasonId, seasonId), eq(student.department, selector.department)));
      return rows.map((r) => r.id);
    }
    case "COHORT":
      return resolveCohortMembers(selector.cohortId);
    case "READINESS_SEGMENT": {
      const rows = await db
        .select({ id: student.id })
        .from(student)
        .where(and(eq(student.institutionId, institutionId), eq(student.seasonId, seasonId)));
      const matched: string[] = [];
      for (const r of rows) {
        const snap = await getLatestSnapshot(r.id);
        const cat = (snap?.categoryScores as Record<string, { score: number } | null> | undefined)?.[selector.category];
        if (cat && cat.score < selector.belowScore) matched.push(r.id);
      }
      return matched;
    }
  }
}

/** "Selected: 84 students / CSE: 39 / IT: 21 / ECE: 24" (spec §49) — always
 *  call this and show the preview before committing a bulk action. */
export async function previewSelection(institutionId: string, seasonId: string, selector: StudentSelector) {
  const studentIds = await resolveSelector(institutionId, seasonId, selector);
  if (studentIds.length === 0) return { total: 0, byDepartment: {}, studentIds: [] };

  const rows = await db.select({ id: student.id, department: student.department }).from(student).where(inArray(student.id, studentIds));
  const byDepartment: Record<string, number> = {};
  for (const r of rows) byDepartment[r.department] = (byDepartment[r.department] ?? 0) + 1;

  return { total: rows.length, byDepartment, studentIds: rows.map((r) => r.id) };
}

// ---- Sessions (spec §13) ---------------------------------------------------

export async function createSession(input: {
  trainingProgramId: string;
  institutionId: string;
  title: string;
  scheduledAt: Date;
  durationMinutes: number;
  location?: string;
  mode: string;
  trainerUserId?: string;
  capacity?: number;
}) {
  const [row] = await db
    .insert(trainingSession)
    .values({
      id: newId("sess"),
      trainingProgramId: input.trainingProgramId,
      title: input.title,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      location: input.location,
      mode: input.mode as typeof trainingSession.$inferInsert.mode,
      trainerUserId: input.trainerUserId,
      capacity: input.capacity,
    })
    .returning();
  await eventBus.publish({ type: "TRAINING_SESSION_CREATED", institutionId: input.institutionId, payload: { sessionId: row.id, trainingProgramId: input.trainingProgramId } });
  return row;
}

// ---- Enrollment (spec §16, §17) --------------------------------------------

export async function enroll(input: {
  trainingProgramId: string;
  studentId: string;
  institutionId: string;
  assignedBy: string;
  assignmentReason?: string;
  sourceCohortId?: string;
}) {
  const [existing] = await db
    .select()
    .from(trainingEnrollment)
    .where(and(eq(trainingEnrollment.trainingProgramId, input.trainingProgramId), eq(trainingEnrollment.studentId, input.studentId)));
  if (existing) throw new ConflictError(`Student ${input.studentId} is already enrolled in program ${input.trainingProgramId} (status: ${existing.status})`);

  const [row] = await db
    .insert(trainingEnrollment)
    .values({
      id: newId("enr"),
      trainingProgramId: input.trainingProgramId,
      studentId: input.studentId,
      assignedBy: input.assignedBy,
      assignmentReason: input.assignmentReason,
      sourceCohortId: input.sourceCohortId,
    })
    .returning();

  await eventBus.publish({
    type: "TRAINING_ENROLLMENT_CREATED",
    institutionId: input.institutionId,
    studentId: input.studentId,
    payload: { enrollmentId: row.id, trainingProgramId: input.trainingProgramId, reason: input.assignmentReason ?? null },
  });

  return row;
}

/** Enrolls every resolved student, skipping (not failing on) students
 *  already enrolled, and reports both counts back — never silently drops
 *  a requested student without saying why. */
export async function bulkEnroll(input: {
  trainingProgramId: string;
  institutionId: string;
  studentIds: string[];
  assignedBy: string;
  assignmentReason?: string;
  sourceCohortId?: string;
}) {
  const enrolled: string[] = [];
  const alreadyEnrolled: string[] = [];
  for (const studentId of input.studentIds) {
    try {
      await enroll({ ...input, studentId });
      enrolled.push(studentId);
    } catch (err) {
      if (err instanceof ConflictError) alreadyEnrolled.push(studentId);
      else throw err;
    }
  }
  return { enrolledCount: enrolled.length, alreadyEnrolledCount: alreadyEnrolled.length, enrolled, alreadyEnrolled };
}

export async function transitionEnrollmentStatus(enrollmentId: string, toStatus: string, institutionId: string, actorId: string) {
  const [enrollment] = await db.select().from(trainingEnrollment).where(eq(trainingEnrollment.id, enrollmentId));
  if (!enrollment) throw new NotFoundError("TrainingEnrollment", enrollmentId);

  const allowed = ENROLLMENT_TRANSITIONS[enrollment.status] ?? [];
  if (!allowed.includes(toStatus)) throw new InvalidTransitionError("TrainingEnrollment", enrollment.status, toStatus);

  const completedAt = toStatus === "COMPLETED" ? new Date() : enrollment.completedAt;
  await db
    .update(trainingEnrollment)
    .set({ status: toStatus as typeof enrollment.status, completedAt })
    .where(eq(trainingEnrollment.id, enrollmentId));

  if (toStatus === "COMPLETED") {
    await eventBus.publish({
      type: "TRAINING_COMPLETED",
      institutionId,
      studentId: enrollment.studentId,
      payload: { enrollmentId, trainingProgramId: enrollment.trainingProgramId },
    });
  }
  return { ...enrollment, status: toStatus, completedAt };
}

// ---- Attendance (spec §14, §15) --------------------------------------------

/** Caller MUST already be authorized (spec §14: never self-marked) — that
 *  check belongs in the API middleware (see src/lib/permissions.ts
 *  RECORD_ATTENDANCE), which excludes the STUDENT role entirely. */
export async function recordAttendance(input: { sessionId: string; studentId: string; status: string; recordedBy: string; institutionId: string }) {
  const [existing] = await db
    .select()
    .from(trainingAttendance)
    .where(and(eq(trainingAttendance.sessionId, input.sessionId), eq(trainingAttendance.studentId, input.studentId)));

  let row;
  if (existing) {
    [row] = await db
      .update(trainingAttendance)
      .set({ status: input.status as typeof trainingAttendance.$inferInsert.status, recordedAt: new Date(), recordedBy: input.recordedBy })
      .where(eq(trainingAttendance.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(trainingAttendance)
      .values({
        id: newId("att-rec"),
        sessionId: input.sessionId,
        studentId: input.studentId,
        status: input.status as typeof trainingAttendance.$inferInsert.status,
        recordedBy: input.recordedBy,
      })
      .returning();
  }

  await eventBus.publish({
    type: "TRAINING_ATTENDANCE_RECORDED",
    institutionId: input.institutionId,
    studentId: input.studentId,
    payload: { sessionId: input.sessionId, status: input.status },
  });
  return row;
}

/** "17 assigned students have attended less than 60% of the program"
 *  (spec §15). Requires at least 2 sessions to have occurred before flagging
 *  at-risk, so day-one 0/1 attendance doesn't trip the alert. */
export async function getAttendanceSummary(trainingProgramId: string) {
  const sessions = await db.select().from(trainingSession).where(eq(trainingSession.trainingProgramId, trainingProgramId));
  const sessionIds = sessions.map((s) => s.id);
  const enrollments = await db.select().from(trainingEnrollment).where(eq(trainingEnrollment.trainingProgramId, trainingProgramId));

  const attendance = sessionIds.length ? await db.select().from(trainingAttendance).where(inArray(trainingAttendance.sessionId, sessionIds)) : [];

  const perStudent = enrollments.map((e) => {
    const rows = attendance.filter((a) => a.studentId === e.studentId);
    const excused = rows.filter((a) => a.status === "EXCUSED").length;
    const attended = rows.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
    const countableSessions = sessions.length - excused;
    const attendancePct = countableSessions > 0 ? Math.round((attended / countableSessions) * 1000) / 10 : null;
    const atRisk = sessions.length >= 2 && attendancePct !== null && attendancePct < THRESHOLDS.ATTENDANCE_AT_RISK_PCT;
    return { studentId: e.studentId, sessionsHeld: sessions.length, attended, excused, attendancePct, atRisk };
  });

  return {
    trainingProgramId,
    sessionsHeld: sessions.length,
    students: perStudent,
    atRiskCount: perStudent.filter((p) => p.atRisk).length,
  };
}

export async function getProgramDetail(trainingProgramId: string) {
  const [program] = await db.select().from(trainingProgram).where(eq(trainingProgram.id, trainingProgramId));
  if (!program) throw new NotFoundError("TrainingProgram", trainingProgramId);

  const enrollments = await db.select().from(trainingEnrollment).where(eq(trainingEnrollment.trainingProgramId, trainingProgramId));
  const counts = { assigned: 0, enrolled: 0, inProgress: 0, completed: 0, dropped: 0, inactive: 0 };
  for (const e of enrollments) {
    if (e.status === "ASSIGNED") counts.assigned++;
    if (e.status === "ENROLLED") counts.enrolled++;
    if (e.status === "IN_PROGRESS") counts.inProgress++;
    if (e.status === "COMPLETED") counts.completed++;
    if (e.status === "DROPPED") counts.dropped++;
    if (e.status === "INACTIVE") counts.inactive++;
  }
  const attendance = await getAttendanceSummary(trainingProgramId);

  return {
    program,
    enrollmentCounts: counts,
    totalEnrolled: enrollments.length,
    completionRate: enrollments.length > 0 ? Math.round((counts.completed / enrollments.length) * 1000) / 10 : null,
    attendance,
  };
}

// ---- Read helpers backing the AI tool contracts (spec §60, §88) -----------

export async function getStudentTraining(studentId: string) {
  const enrollments = await db.select().from(trainingEnrollment).where(eq(trainingEnrollment.studentId, studentId));
  const programs = enrollments.length
    ? await db.select().from(trainingProgram).where(inArray(trainingProgram.id, enrollments.map((e) => e.trainingProgramId)))
    : [];
  const programById = new Map(programs.map((p) => [p.id, p]));
  return enrollments.map((e) => ({ enrollment: e, program: programById.get(e.trainingProgramId) ?? null }));
}

/** Program has ended but the student's enrollment never reached COMPLETED/DROPPED. */
export async function getOverdueTraining(institutionId: string) {
  const now = new Date();
  const endedPrograms = await db
    .select()
    .from(trainingProgram)
    .where(and(eq(trainingProgram.institutionId, institutionId), lt(trainingProgram.endDate, now)));
  if (endedPrograms.length === 0) return [];

  const enrollments = await db
    .select()
    .from(trainingEnrollment)
    .where(
      and(
        inArray(trainingEnrollment.trainingProgramId, endedPrograms.map((p) => p.id)),
        inArray(trainingEnrollment.status, ["ASSIGNED", "ENROLLED", "IN_PROGRESS"])
      )
    );
  const programById = new Map(endedPrograms.map((p) => [p.id, p]));
  return enrollments.map((e) => ({ enrollment: e, program: programById.get(e.trainingProgramId)! }));
}
