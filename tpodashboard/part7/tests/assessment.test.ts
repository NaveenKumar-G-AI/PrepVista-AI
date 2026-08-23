import { describe, expect, it } from "vitest";
import { db } from "../src/db/client";
import { assessmentAttempt, skillMeasurement } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  createAssessment,
  createVersion,
  publishVersion,
  startAttempt,
  submitAttempt,
  finalizeResult,
} from "../src/services/assessmentService";
import { makeInstitution, makeSkill, makeStudent, makeTaxonomyTerm, makeUserAccount } from "./helpers/factories";
import { ValidationError } from "../src/lib/errors";

async function setup() {
  const inst = await makeInstitution();
  const stu = await makeStudent(inst.id, "season-1");
  const cat = await makeTaxonomyTerm(inst.id, "ASSESSMENT_CATEGORY", "TECHNICAL");
  const tpo = await makeUserAccount(inst.id, "TPO_HEAD");
  const skill = await makeSkill(inst.id, "Arrays", "technical");
  return { inst, stu, cat, tpo, skill };
}

describe("assessmentService", () => {
  it("auto-grades MCQ questions immediately and writes skill measurement evidence", async () => {
    const { inst, stu, cat, tpo, skill } = await setup();
    const assessment = await createAssessment({ institutionId: inst.id, name: "Arrays Quiz", categoryId: cat.id, skillIds: [skill.id], createdBy: tpo.id });
    const version = await createVersion({
      assessmentId: assessment.id,
      durationMins: 10,
      maxScore: 10,
      questions: [
        { type: "MCQ", prompt: "2+2?", correctAnswer: "4", skillId: skill.id, maxScore: 5, order: 1 },
        { type: "MCQ", prompt: "3+3?", correctAnswer: "6", skillId: skill.id, maxScore: 5, order: 2 },
      ],
    });
    await publishVersion(version.id, tpo.id, inst.id);

    const attempt = await startAttempt({ assessmentVersionId: version.id, studentId: stu.id, institutionId: inst.id });
    // fetch question ids directly to build the answers map
    const qs = await db.select().from((await import("../src/db/schema")).assessmentQuestion).where(eq((await import("../src/db/schema")).assessmentQuestion.assessmentVersionId, version.id));
    const answers: Record<string, string> = {};
    for (const q of qs) answers[q.id] = q.prompt === "2+2?" ? "4" : "6"; // both correct

    const submission = await submitAttempt({ attemptId: attempt.id, institutionId: inst.id, answers });
    expect(submission.needsManualGrading).toBe(false);

    const [finalAttempt] = await db.select().from(assessmentAttempt).where(eq(assessmentAttempt.id, attempt.id));
    expect(finalAttempt.status).toBe("COMPLETED");
    expect(finalAttempt.needsReview).toBe(false);

    const measurements = await db.select().from(skillMeasurement).where(eq(skillMeasurement.studentId, stu.id));
    expect(measurements).toHaveLength(1);
    expect(measurements[0].score).toBe(100);
    expect(measurements[0].evidenceType).toBe("ASSESSMENT");
  });

  it("cannot start an attempt on a DRAFT version", async () => {
    const { inst, stu, cat, tpo } = await setup();
    const assessment = await createAssessment({ institutionId: inst.id, name: "Draft Quiz", categoryId: cat.id, skillIds: [], createdBy: tpo.id });
    const version = await createVersion({ assessmentId: assessment.id, durationMins: 10, maxScore: 10, questions: [] });
    await expect(startAttempt({ assessmentVersionId: version.id, studentId: stu.id, institutionId: inst.id })).rejects.toThrow(ValidationError);
  });

  it("publishing a new version retires the previously published one, and old attempts stay tied to their own version", async () => {
    const { inst, stu, cat, tpo } = await setup();
    const assessment = await createAssessment({ institutionId: inst.id, name: "Versioned Quiz", categoryId: cat.id, skillIds: [], createdBy: tpo.id });
    const v1 = await createVersion({ assessmentId: assessment.id, durationMins: 10, maxScore: 10, questions: [{ type: "MCQ", prompt: "Q1", correctAnswer: "A", maxScore: 10, order: 1 }] });
    await publishVersion(v1.id, tpo.id, inst.id);
    const attempt1 = await startAttempt({ assessmentVersionId: v1.id, studentId: stu.id, institutionId: inst.id });

    const v2 = await createVersion({ assessmentId: assessment.id, durationMins: 15, maxScore: 20, questions: [{ type: "MCQ", prompt: "Q1-new", correctAnswer: "B", maxScore: 20, order: 1 }] });
    await publishVersion(v2.id, tpo.id, inst.id);

    const { assessmentVersion } = await import("../src/db/schema");
    const [refreshedV1] = await db.select().from(assessmentVersion).where(eq(assessmentVersion.id, v1.id));
    const [refreshedV2] = await db.select().from(assessmentVersion).where(eq(assessmentVersion.id, v2.id));
    expect(refreshedV1.status).toBe("RETIRED");
    expect(refreshedV2.status).toBe("PUBLISHED");

    const [attempt1Row] = await db.select().from(assessmentAttempt).where(eq(assessmentAttempt.id, attempt1.id));
    expect(attempt1Row.assessmentVersionId).toBe(v1.id); // untouched by v2 publishing
  });

  it("is idempotent: starting a second attempt while one is IN_PROGRESS returns the same attempt", async () => {
    const { inst, stu, cat, tpo } = await setup();
    const assessment = await createAssessment({ institutionId: inst.id, name: "Idempotency Quiz", categoryId: cat.id, skillIds: [], createdBy: tpo.id });
    const version = await createVersion({ assessmentId: assessment.id, durationMins: 10, maxScore: 10, questions: [] });
    await publishVersion(version.id, tpo.id, inst.id);

    const first = await startAttempt({ assessmentVersionId: version.id, studentId: stu.id, institutionId: inst.id });
    const second = await startAttempt({ assessmentVersionId: version.id, studentId: stu.id, institutionId: inst.id });
    expect(second.id).toBe(first.id);
  });

  it("holds results for manually-graded question types until a score is supplied — never a placeholder score", async () => {
    const { inst, stu, cat, tpo, skill } = await setup();
    const assessment = await createAssessment({ institutionId: inst.id, name: "Coding Quiz", categoryId: cat.id, skillIds: [skill.id], createdBy: tpo.id });
    const version = await createVersion({
      assessmentId: assessment.id,
      durationMins: 30,
      maxScore: 10,
      questions: [{ type: "CODING", prompt: "Write a function", skillId: skill.id, maxScore: 10, order: 1 }],
    });
    await publishVersion(version.id, tpo.id, inst.id);
    const attempt = await startAttempt({ assessmentVersionId: version.id, studentId: stu.id, institutionId: inst.id });

    const submission = await submitAttempt({ attemptId: attempt.id, institutionId: inst.id, answers: {} });
    expect(submission.needsManualGrading).toBe(true);

    const { assessmentResult } = await import("../src/db/schema");
    const [resultRow] = await db.select().from(assessmentResult).where(eq(assessmentResult.attemptId, attempt.id));
    expect(resultRow).toBeUndefined(); // no result yet — not a fabricated 0

    const { assessmentQuestion } = await import("../src/db/schema");
    const [question] = await db.select().from(assessmentQuestion).where(eq(assessmentQuestion.assessmentVersionId, version.id));
    const finalized = await finalizeResult({ attemptId: attempt.id, institutionId: inst.id, manualScores: { [question.id]: 8 }, evaluationSource: "TPO_GRADED" });
    expect(finalized.totalScore).toBe(8);
    expect(finalized.normalizedScore).toBe(80);
  });

  it("rejects (and invalidates) a manual score total that exceeds the assessment's max score", async () => {
    const { inst, stu, cat, tpo } = await setup();
    const assessment = await createAssessment({ institutionId: inst.id, name: "Overscore Quiz", categoryId: cat.id, skillIds: [], createdBy: tpo.id });
    const version = await createVersion({ assessmentId: assessment.id, durationMins: 10, maxScore: 10, questions: [{ type: "TEXT", prompt: "Explain X", maxScore: 10, order: 1 }] });
    await publishVersion(version.id, tpo.id, inst.id);
    const attempt = await startAttempt({ assessmentVersionId: version.id, studentId: stu.id, institutionId: inst.id });
    await submitAttempt({ attemptId: attempt.id, institutionId: inst.id, answers: {} });

    const { assessmentQuestion } = await import("../src/db/schema");
    const [question] = await db.select().from(assessmentQuestion).where(eq(assessmentQuestion.assessmentVersionId, version.id));

    await expect(finalizeResult({ attemptId: attempt.id, institutionId: inst.id, manualScores: { [question.id]: 999 }, evaluationSource: "TPO_GRADED" })).rejects.toThrow(ValidationError);

    const [invalidated] = await db.select().from(assessmentAttempt).where(eq(assessmentAttempt.id, attempt.id));
    expect(invalidated.status).toBe("INVALIDATED");
  });
});
