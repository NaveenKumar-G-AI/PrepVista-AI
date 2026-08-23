import { describe, expect, it } from "vitest";
import { db } from "../src/db/client";
import { skillMeasurement, interventionAssignment } from "../src/db/schema";
import { newId } from "../src/lib/id";
import { eq } from "drizzle-orm";
import { createIntervention, assignIntervention, buildAssignmentReason, detectOverdueAssignments, transitionAssignmentStatus } from "../src/services/interventionService";
import { calculateReadiness } from "../src/services/readinessService";
import { makeInstitution, makeSeason, makeSkill, makeStudent, makeUserAccount } from "./helpers/factories";
import { ConflictError, InvalidTransitionError } from "../src/lib/errors";

async function setup() {
  const inst = await makeInstitution();
  const seasonRow = await makeSeason(inst.id);
  const tpo = await makeUserAccount(inst.id, "TPO_HEAD");
  const stu = await makeStudent(inst.id, seasonRow.id);
  const intv = await createIntervention({
    institutionId: inst.id,
    seasonId: seasonRow.id,
    name: "Communication Coaching",
    type: "COACHING",
    objective: "Improve verbal communication",
    priority: "HIGH",
    createdBy: tpo.id,
  });
  return { inst, seasonRow, tpo, stu, intv };
}

describe("interventionService", () => {
  it("builds the assignment reason from real skill-gap evidence, not a generic placeholder", async () => {
    const { inst, seasonRow, stu } = await setup();
    const commSkill = await makeSkill(inst.id, "Speaking", "communication");
    await db.insert(skillMeasurement).values({ id: newId("sm"), studentId: stu.id, skillId: commSkill.id, score: 45, evidenceType: "ASSESSMENT" });
    await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id });

    const built = await buildAssignmentReason(stu.id);
    expect(built.reason).toContain("communication");
    expect(built.reason).toContain("45");
    expect(built.evidence.category).toBe("communication");
  });

  it("blocks a duplicate ACTIVE assignment of the same intervention to the same student", async () => {
    const { inst, tpo, stu, intv } = await setup();
    await assignIntervention({ interventionId: intv.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id, priority: "HIGH" });
    await expect(assignIntervention({ interventionId: intv.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id, priority: "HIGH" })).rejects.toThrow(ConflictError);
  });

  it("allows re-assignment once the prior assignment is no longer active (e.g. CANCELLED)", async () => {
    const { inst, tpo, stu, intv } = await setup();
    const first = await assignIntervention({ interventionId: intv.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id, priority: "HIGH" });
    await transitionAssignmentStatus(first.id, "CANCELLED", inst.id, tpo.id);
    await expect(assignIntervention({ interventionId: intv.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id, priority: "HIGH" })).resolves.toBeTruthy();
  });

  it("flips ACTIVE assignments with a passed due date to OVERDUE", async () => {
    const { inst, tpo, stu, intv } = await setup();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const assignment = await assignIntervention({ interventionId: intv.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id, priority: "HIGH", dueDate: past });

    const result = await detectOverdueAssignments(inst.id);
    expect(result.flippedIds).toContain(assignment.id);

    const [row] = await db.select().from(interventionAssignment).where(eq(interventionAssignment.id, assignment.id));
    expect(row.status).toBe("OVERDUE");
  });

  it("rejects invalid assignment status transitions (e.g. straight from ASSIGNED to COMPLETED)", async () => {
    const { inst, tpo, stu, intv } = await setup();
    const assignment = await assignIntervention({ interventionId: intv.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id, priority: "MEDIUM" });
    await expect(transitionAssignmentStatus(assignment.id, "COMPLETED", inst.id, tpo.id)).rejects.toThrow(InvalidTransitionError);
  });
});
