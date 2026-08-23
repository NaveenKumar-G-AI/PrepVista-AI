import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { trainingEnrollment, trainingSession, trainingAttendance } from "../db/schema";
import { recommendIntervention } from "./recommendationService";
import { getSkillGaps } from "./skillGapService";
import { getStudentInterventions } from "./interventionService";

const ACTIVE = new Set(["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "OVERDUE"]);

/**
 * "My Placement Improvement Plan" (spec §40). Progress is only ever shown
 * when an assignment is explicitly linked to a real training enrollment
 * (`linkedEnrollmentId`) — otherwise the UI should just omit the progress
 * bar rather than invent one (spec §72: "Everything shown must be based on
 * actual data").
 */
export async function getActionPlan(studentId: string, institutionId: string) {
  const [recommendation, gaps, allAssignments] = await Promise.all([
    recommendIntervention(studentId, institutionId),
    getSkillGaps(studentId),
    getStudentInterventions(studentId),
  ]);

  const active = allAssignments.filter((a) => ACTIVE.has(a.assignment.status));

  const withProgress = await Promise.all(
    active.map(async (a) => {
      let progress: { sessionsAttended: number; sessionsHeld: number } | null = null;
      if (a.assignment.linkedEnrollmentId) {
        const [enrollment] = await db.select().from(trainingEnrollment).where(eq(trainingEnrollment.id, a.assignment.linkedEnrollmentId));
        if (enrollment) {
          const sessions = await db.select().from(trainingSession).where(eq(trainingSession.trainingProgramId, enrollment.trainingProgramId));
          const attendance = sessions.length
            ? await db
                .select()
                .from(trainingAttendance)
                .where(and(eq(trainingAttendance.studentId, studentId), inArray(trainingAttendance.sessionId, sessions.map((s) => s.id))))
            : [];
          const attended = attendance.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
          progress = { sessionsAttended: attended, sessionsHeld: sessions.length };
        }
      }
      return { assignment: a.assignment, intervention: a.intervention, progress };
    })
  );

  return { recommendation, skillGaps: gaps, activeAssignments: withProgress };
}
