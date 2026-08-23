import { describe, expect, it } from "vitest";
import { db } from "../src/db/client";
import { skillMeasurement } from "../src/db/schema";
import { newId } from "../src/lib/id";
import { createProgram, enroll, transitionEnrollmentStatus } from "../src/services/trainingService";
import { calculateReadiness } from "../src/services/readinessService";
import { getTrainingEffectiveness } from "../src/services/effectivenessService";
import { makeInstitution, makeSeason, makeSkill, makeStudent, makeTaxonomyTerm, makeUserAccount } from "./helpers/factories";
import { THRESHOLDS } from "../src/config/thresholds";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runOneStudentThroughTraining(inst: any, seasonRow: any, program: any, tpo: any, techSkill: any, preScore: number, postScore: number) {
  const stu = await makeStudent(inst.id, seasonRow.id);
  await db.insert(skillMeasurement).values({ id: newId("sm"), studentId: stu.id, skillId: techSkill.id, score: preScore, evidenceType: "ASSESSMENT" });
  await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id }); // "pre" snapshot
  await wait(5);

  const enrollment = await enroll({ trainingProgramId: program.id, studentId: stu.id, institutionId: inst.id, assignedBy: tpo.id });
  await wait(5);
  await transitionEnrollmentStatus(enrollment.id, "ENROLLED", inst.id, tpo.id);
  await transitionEnrollmentStatus(enrollment.id, "IN_PROGRESS", inst.id, tpo.id);
  await transitionEnrollmentStatus(enrollment.id, "COMPLETED", inst.id, tpo.id);
  await wait(5);

  await db.insert(skillMeasurement).values({ id: newId("sm"), studentId: stu.id, skillId: techSkill.id, score: postScore, evidenceType: "ASSESSMENT" });
  await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id }); // "post" snapshot
  return stu;
}

async function setup() {
  const inst = await makeInstitution();
  const seasonRow = await makeSeason(inst.id);
  const cat = await makeTaxonomyTerm(inst.id, "TRAINING_CATEGORY", "TECHNICAL_INTERVIEW");
  const tpo = await makeUserAccount(inst.id, "TPO_HEAD");
  const techSkill = await makeSkill(inst.id, "DSA", "technical");
  const program = await createProgram({ institutionId: inst.id, seasonId: seasonRow.id, name: "Bootcamp", categoryId: cat.id, createdBy: tpo.id });
  return { inst, seasonRow, tpo, techSkill, program };
}

describe("effectivenessService", () => {
  it("withholds readiness-impact numbers when fewer than the minimum sample size of completers have before/after data", async () => {
    const { inst, seasonRow, tpo, techSkill, program } = await setup();
    // Fewer than THRESHOLDS.MIN_SAMPLE_FOR_EFFECTIVENESS completers.
    for (let i = 0; i < THRESHOLDS.MIN_SAMPLE_FOR_EFFECTIVENESS - 2; i++) {
      await runOneStudentThroughTraining(inst, seasonRow, program, tpo, techSkill, 50, 60);
    }

    const result = await getTrainingEffectiveness(program.id);
    expect(result.readinessImpact.insufficientData).toBe(true);
  });

  it("reports median observed readiness change once enough completers have before/after data", async () => {
    const { inst, seasonRow, tpo, techSkill, program } = await setup();
    const pairs: Array<[number, number]> = [
      [50, 65],
      [55, 70],
      [45, 60],
      [60, 75],
      [40, 55],
    ];
    expect(pairs.length).toBeGreaterThanOrEqual(THRESHOLDS.MIN_SAMPLE_FOR_EFFECTIVENESS);

    for (const [pre, post] of pairs) {
      await runOneStudentThroughTraining(inst, seasonRow, program, tpo, techSkill, pre, post);
    }

    const result = await getTrainingEffectiveness(program.id);
    expect(result.assigned).toBe(pairs.length);
    expect(result.completed).toBe(pairs.length);
    expect(result.completionRate).toBe(100);
    expect(result.readinessImpact.insufficientData).toBe(false);
    if (!result.readinessImpact.insufficientData) {
      expect(result.readinessImpact.medianPreReadiness).toBe(50); // median of [40,45,50,55,60]
      expect(result.readinessImpact.medianPostReadiness).toBe(65); // median of [55,60,65,70,75]
      expect(result.readinessImpact.medianObservedChange).toBe(15);
    }
  });
});
