import { describe, expect, it } from "vitest";
import {
  createProgram,
  createSession,
  enroll,
  bulkEnroll,
  recordAttendance,
  getAttendanceSummary,
  transitionProgramStatus,
} from "../src/services/trainingService";
import { makeInstitution, makeSeason, makeStudent, makeTaxonomyTerm, makeUserAccount } from "./helpers/factories";
import { ConflictError, InvalidTransitionError } from "../src/lib/errors";

async function setup() {
  const inst = await makeInstitution();
  const seasonRow = await makeSeason(inst.id);
  const cat = await makeTaxonomyTerm(inst.id, "TRAINING_CATEGORY", "TECHNICAL_INTERVIEW");
  const tpo = await makeUserAccount(inst.id, "TPO_HEAD");
  const program = await createProgram({ institutionId: inst.id, seasonId: seasonRow.id, name: "Bootcamp", categoryId: cat.id, createdBy: tpo.id });
  return { inst, seasonRow, tpo, program };
}

describe("trainingService", () => {
  it("prevents duplicate enrollment in the same program", async () => {
    const { inst, seasonRow, tpo, program } = await setup();
    const stu = await makeStudent(inst.id, seasonRow.id);
    await enroll({ trainingProgramId: program.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id });
    await expect(enroll({ trainingProgramId: program.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id })).rejects.toThrow(ConflictError);
  });

  it("bulk enroll skips already-enrolled students and reports both buckets", async () => {
    const { inst, seasonRow, tpo, program } = await setup();
    const s1 = await makeStudent(inst.id, seasonRow.id);
    const s2 = await makeStudent(inst.id, seasonRow.id);
    await enroll({ trainingProgramId: program.id, studentId: s1.id, institutionId: inst.id, assignedBy: tpo.id });

    const result = await bulkEnroll({ trainingProgramId: program.id, institutionId: inst.id, studentIds: [s1.id, s2.id], assignedBy: tpo.id });
    expect(result.enrolledCount).toBe(1);
    expect(result.alreadyEnrolledCount).toBe(1);
    expect(result.enrolled).toEqual([s2.id]);
  });

  it("computes attendance percentage and flags at-risk students only after enough sessions have occurred", async () => {
    const { inst, seasonRow, tpo, program } = await setup();
    const stu = await makeStudent(inst.id, seasonRow.id);
    await enroll({ trainingProgramId: program.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id });

    const s1 = await createSession({ trainingProgramId: program.id, institutionId: inst.id, title: "S1", scheduledAt: new Date(), durationMinutes: 60, mode: "ONLINE" });
    await recordAttendance({ sessionId: s1.id, studentId: stu.id, status: "ABSENT", recordedBy: tpo.id, institutionId: inst.id });

    // Only 1 session so far — should not yet be flagged at-risk even at 0%.
    let summary = await getAttendanceSummary(program.id);
    expect(summary.students[0].atRisk).toBe(false);

    const s2 = await createSession({ trainingProgramId: program.id, institutionId: inst.id, title: "S2", scheduledAt: new Date(), durationMinutes: 60, mode: "ONLINE" });
    await recordAttendance({ sessionId: s2.id, studentId: stu.id, status: "ABSENT", recordedBy: tpo.id, institutionId: inst.id });

    summary = await getAttendanceSummary(program.id);
    expect(summary.students[0].attendancePct).toBe(0);
    expect(summary.students[0].atRisk).toBe(true);
    expect(summary.atRiskCount).toBe(1);
  });

  it("excused sessions don't count against attendance percentage", async () => {
    const { inst, seasonRow, tpo, program } = await setup();
    const stu = await makeStudent(inst.id, seasonRow.id);
    await enroll({ trainingProgramId: program.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id });

    const s1 = await createSession({ trainingProgramId: program.id, institutionId: inst.id, title: "S1", scheduledAt: new Date(), durationMinutes: 60, mode: "ONLINE" });
    const s2 = await createSession({ trainingProgramId: program.id, institutionId: inst.id, title: "S2", scheduledAt: new Date(), durationMinutes: 60, mode: "ONLINE" });
    await recordAttendance({ sessionId: s1.id, studentId: stu.id, status: "PRESENT", recordedBy: tpo.id, institutionId: inst.id });
    await recordAttendance({ sessionId: s2.id, studentId: stu.id, status: "EXCUSED", recordedBy: tpo.id, institutionId: inst.id });

    const summary = await getAttendanceSummary(program.id);
    expect(summary.students[0].attendancePct).toBe(100); // 1 attended / (2 sessions - 1 excused)
  });

  it("rejects invalid training-program status transitions", async () => {
    const { program, tpo, inst } = await setup();
    await expect(transitionProgramStatus(program.id, "COMPLETED", tpo.id, inst.id)).rejects.toThrow(InvalidTransitionError);
  });
});
