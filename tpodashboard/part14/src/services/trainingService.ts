import type { ActionResultDetail } from "../types/action.types.js";

interface Enrollment {
  studentId: string;
  trainingName: string;
}

/** Stands in for Part 7's TrainingService/InterventionService. */
class TrainingService {
  public callLog: string[] = [];
  private enrollments: Enrollment[] = [
    // Pre-seed two students as already enrolled, to demonstrate the
    // "already enrolled -> skipped" partial-outcome path (spec section 31).
    { studentId: "stu-002", trainingName: "Technical Interview Bootcamp" },
    { studentId: "stu-010", trainingName: "Technical Interview Bootcamp" },
  ];
  private executedKeys = new Set<string>();

  async assignBulk(
    studentIds: string[],
    trainingName: string,
    idempotencyKey: string
  ): Promise<ActionResultDetail> {
    this.callLog.push(idempotencyKey);
    if (this.executedKeys.has(idempotencyKey)) {
      return { requested: studentIds.length, succeeded: studentIds.length, failed: 0, skipped: studentIds.length, errors: [] };
    }
    this.executedKeys.add(idempotencyKey);

    const errors: ActionResultDetail["errors"] = [];
    let succeeded = 0;
    let skipped = 0;
    for (const studentId of studentIds) {
      const already = this.enrollments.some((e) => e.studentId === studentId && e.trainingName === trainingName);
      if (already) {
        skipped++;
        continue;
      }
      this.enrollments.push({ studentId, trainingName });
      succeeded++;
    }
    return { requested: studentIds.length, succeeded, failed: errors.length, skipped, errors };
  }

  enrollmentsFor(trainingName: string): string[] {
    return this.enrollments.filter((e) => e.trainingName === trainingName).map((e) => e.studentId);
  }
}

export const trainingService = new TrainingService();
