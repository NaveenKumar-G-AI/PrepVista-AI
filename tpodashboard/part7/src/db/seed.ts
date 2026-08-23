/**
 * DEV/DEMO SEED ONLY (spec §82: "Development fixtures only in explicit
 * demo/test seeds"). Run with `npm run seed`. Creates a small, clearly-fake
 * institution so you can explore the API with curl — it is never read by
 * application code, only by whoever runs this script by hand.
 */
import "dotenv/config";
import { db } from "./client";
import { taxonomyTerm } from "./schema";
import { makeInstitution, makeSeason, makeStudent, makeSkill, makeTaxonomyTerm, makeUserAccount } from "../../tests/helpers/factories";
import * as training from "../services/trainingService";
import * as assessmentSvc from "../services/assessmentService";

async function main() {
  const inst = await makeInstitution("Demo Institute of Technology");
  const seasonRow = await makeSeason(inst.id, "2026 Placement Season");

  const cse = await Promise.all([
    makeStudent(inst.id, seasonRow.id, { name: "Aditi Rao", department: "CSE" }),
    makeStudent(inst.id, seasonRow.id, { name: "Rohan Mehta", department: "CSE" }),
  ]);
  const it = await makeStudent(inst.id, seasonRow.id, { name: "Priya Nair", department: "IT" });

  const skillTech = await makeSkill(inst.id, "Data Structures", "technical");
  const skillComm = await makeSkill(inst.id, "Verbal Communication", "communication");

  const trainingCat = await makeTaxonomyTerm(inst.id, "TRAINING_CATEGORY", "TECHNICAL_INTERVIEW");
  const assessCat = await makeTaxonomyTerm(inst.id, "ASSESSMENT_CATEGORY", "TECHNICAL");

  const tpoHead = await makeUserAccount(inst.id, "TPO_HEAD", { name: "TPO Head Demo" });
  const student1Login = await makeUserAccount(inst.id, "STUDENT", { name: cse[0].name, linkedStudentId: cse[0].id });

  const program = await training.createProgram({
    institutionId: inst.id,
    seasonId: seasonRow.id,
    name: "Technical Interview Bootcamp",
    categoryId: trainingCat.id,
    targetSkillIds: [skillTech.id],
    createdBy: tpoHead.id,
  });

  const assessment = await assessmentSvc.createAssessment({
    institutionId: inst.id,
    name: "Technical Assessment 01",
    categoryId: assessCat.id,
    skillIds: [skillTech.id],
    createdBy: tpoHead.id,
  });
  const version = await assessmentSvc.createVersion({
    assessmentId: assessment.id,
    durationMins: 30,
    maxScore: 10,
    questions: [{ type: "MCQ", prompt: "What is the time complexity of binary search?", options: ["O(n)", "O(log n)"], correctAnswer: "O(log n)", skillId: skillTech.id, maxScore: 10, order: 1 }],
  });
  await assessmentSvc.publishVersion(version.id, tpoHead.id, inst.id);

  console.log("Seeded demo data:");
  console.log({ institutionId: inst.id, seasonId: seasonRow.id, tpoHeadActorId: tpoHead.id, studentActorId: student1Login.id, studentId: cse[0].id, programId: program.id, assessmentVersionId: version.id });
  console.log("\nTry: curl -H 'x-actor-id: " + tpoHead.id + "' http://localhost:3000/api/tpo/analytics/overview?seasonId=" + seasonRow.id);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
