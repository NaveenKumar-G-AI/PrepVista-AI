import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  assessment,
  assessmentAttempt,
  assessmentQuestion,
  assessmentResult,
  assessmentVersion,
  skillMeasurement,
} from "../db/schema";
import { newId } from "../lib/id";
import { eventBus } from "../lib/eventBus";
import { recordAudit } from "../lib/audit";
import { NotFoundError, ValidationError } from "../lib/errors";
import { THRESHOLDS } from "../config/thresholds";

const AUTO_GRADABLE_TYPES = new Set(["MCQ", "MULTI_SELECT"]);

export async function createAssessment(input: {
  institutionId: string;
  name: string;
  categoryId: string;
  skillIds: string[];
  createdBy: string;
}) {
  const [row] = await db.insert(assessment).values({ id: newId("assess"), ...input }).returning();
  return row;
}

export async function createVersion(input: {
  assessmentId: string;
  durationMins: number;
  maxScore: number;
  passingScore?: number;
  questions: Array<{
    type: string;
    prompt: string;
    options?: unknown;
    correctAnswer?: unknown;
    skillId?: string;
    maxScore: number;
    order: number;
  }>;
}) {
  const existingVersions = await db
    .select({ version: assessmentVersion.version })
    .from(assessmentVersion)
    .where(eq(assessmentVersion.assessmentId, input.assessmentId));
  const nextVersion = existingVersions.length === 0 ? 1 : Math.max(...existingVersions.map((v) => v.version)) + 1;

  const [version] = await db
    .insert(assessmentVersion)
    .values({
      id: newId("aver"),
      assessmentId: input.assessmentId,
      version: nextVersion,
      durationMins: input.durationMins,
      maxScore: input.maxScore,
      passingScore: input.passingScore,
      status: "DRAFT",
    })
    .returning();

  if (input.questions.length > 0) {
    await db.insert(assessmentQuestion).values(
      input.questions.map((q) => ({
        id: newId("aq"),
        assessmentVersionId: version.id,
        type: q.type as (typeof assessmentQuestion.$inferInsert)["type"],
        prompt: q.prompt,
        options: q.options ?? null,
        // Wrapped, not stored bare — see the comment on `unwrapCorrectAnswer` below.
        correctAnswer: q.correctAnswer !== undefined ? { value: q.correctAnswer } : null,
        skillId: q.skillId ?? null,
        maxScore: q.maxScore,
        order: q.order,
      }))
    );
  }

  return version;
}

/**
 * Publishing retires whatever version was previously PUBLISHED, so there is
 * never ambiguity about "the current assessment" while still keeping every
 * prior version — and every attempt tied to it — intact and queryable
 * (spec §20: historical results must stay reproducible).
 */
export async function publishVersion(versionId: string, actorId: string, institutionId: string) {
  const [version] = await db.select().from(assessmentVersion).where(eq(assessmentVersion.id, versionId));
  if (!version) throw new NotFoundError("AssessmentVersion", versionId);
  if (version.status !== "DRAFT") throw new ValidationError(`Only a DRAFT version can be published (current status: ${version.status})`);

  const [sibling] = await db
    .select()
    .from(assessmentVersion)
    .where(and(eq(assessmentVersion.assessmentId, version.assessmentId), eq(assessmentVersion.status, "PUBLISHED")));

  await db.transaction(async (tx) => {
    if (sibling) {
      await tx.update(assessmentVersion).set({ status: "RETIRED" }).where(eq(assessmentVersion.id, sibling.id));
    }
    await tx.update(assessmentVersion).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(assessmentVersion.id, versionId));
  });

  await recordAudit({
    institutionId,
    actorId,
    action: "ASSESSMENT_VERSION_PUBLISHED",
    entityType: "AssessmentVersion",
    entityId: versionId,
    oldValue: { status: "DRAFT" },
    newValue: { status: "PUBLISHED" },
  });

  return { ...version, status: "PUBLISHED" as const };
}

/** Idempotent: an existing IN_PROGRESS attempt is returned instead of
 *  creating a duplicate concurrent attempt (spec §26 duplicate-attempt check). */
export async function startAttempt(input: { assessmentVersionId: string; studentId: string; institutionId: string; source?: string }) {
  const [version] = await db.select().from(assessmentVersion).where(eq(assessmentVersion.id, input.assessmentVersionId));
  if (!version) throw new NotFoundError("AssessmentVersion", input.assessmentVersionId);
  if (version.status !== "PUBLISHED") throw new ValidationError("Cannot start an attempt on a version that is not PUBLISHED");

  const existing = await db
    .select()
    .from(assessmentAttempt)
    .where(and(eq(assessmentAttempt.assessmentVersionId, input.assessmentVersionId), eq(assessmentAttempt.studentId, input.studentId)));

  const inProgress = existing.find((a) => a.status === "IN_PROGRESS");
  if (inProgress) return inProgress;

  const attemptNumber = existing.length + 1;
  const [attempt] = await db
    .insert(assessmentAttempt)
    .values({
      id: newId("att"),
      assessmentVersionId: input.assessmentVersionId,
      studentId: input.studentId,
      attemptNumber,
      status: "IN_PROGRESS",
      source: (input.source as (typeof assessmentAttempt.$inferInsert)["source"]) ?? "WEB",
      startedAt: new Date(),
    })
    .returning();

  await eventBus.publish({
    type: "ASSESSMENT_STARTED",
    institutionId: input.institutionId,
    studentId: input.studentId,
    payload: { assessmentVersionId: input.assessmentVersionId, attemptId: attempt.id, attemptNumber },
  });

  return attempt;
}

/**
 * Auto-grades MCQ/MULTI_SELECT questions immediately. If the assessment
 * contains any question type that needs a human (CODING/TEXT/RATING/
 * PRACTICAL/CUSTOM), the attempt completes but is flagged `needsReview` and
 * no AssessmentResult is written until `finalizeResult` supplies the manual
 * scores — never a fabricated placeholder score in the meantime.
 */
export async function submitAttempt(input: {
  attemptId: string;
  institutionId: string;
  answers: Record<string, unknown>;
}) {
  const [attempt] = await db.select().from(assessmentAttempt).where(eq(assessmentAttempt.id, input.attemptId));
  if (!attempt) throw new NotFoundError("AssessmentAttempt", input.attemptId);
  if (attempt.status !== "IN_PROGRESS") throw new ValidationError(`Attempt is not IN_PROGRESS (status: ${attempt.status})`);

  const questions = await db.select().from(assessmentQuestion).where(eq(assessmentQuestion.assessmentVersionId, attempt.assessmentVersionId));

  const autoScores: Record<string, number> = {};
  let needsManualGrading = false;
  for (const q of questions) {
    if (!AUTO_GRADABLE_TYPES.has(q.type)) {
      needsManualGrading = true;
      continue;
    }
    const given = input.answers[q.id];
    const correct = unwrapCorrectAnswer(q.correctAnswer);
    const isCorrect =
      q.type === "MULTI_SELECT"
        ? Array.isArray(given) && Array.isArray(correct) && sameSet(given as unknown[], correct as unknown[])
        : given === correct;
    autoScores[q.id] = isCorrect ? q.maxScore : 0;
  }

  const completedAt = new Date();
  const startedAt = attempt.startedAt ?? completedAt;
  const seconds = (completedAt.getTime() - startedAt.getTime()) / 1000;
  const suspiciouslyFast = questions.length > 0 && seconds < questions.length * THRESHOLDS.MIN_SECONDS_PER_QUESTION;

  const needsReview = needsManualGrading || suspiciouslyFast;
  const reviewReason = needsManualGrading
    ? "Contains questions requiring manual grading"
    : suspiciouslyFast
      ? "Completed unusually quickly relative to question count — needs review, not an accusation"
      : null;

  await db
    .update(assessmentAttempt)
    .set({ status: "COMPLETED", completedAt, needsReview, reviewReason })
    .where(eq(assessmentAttempt.id, attempt.id));

  await eventBus.publish({
    type: "ASSESSMENT_COMPLETED",
    institutionId: input.institutionId,
    studentId: attempt.studentId,
    payload: { attemptId: attempt.id, needsManualGrading, suspiciouslyFast },
  });

  if (!needsManualGrading) {
    await finalizeResult({
      attemptId: attempt.id,
      institutionId: input.institutionId,
      manualScores: autoScores,
      evaluationSource: "AUTO_GRADED",
    });
  }

  return { attemptId: attempt.id, needsManualGrading, suspiciouslyFast };
}

/** Combines auto + manual per-question scores into the immutable
 *  AssessmentResult and writes SkillMeasurement evidence rows (spec §28). */
export async function finalizeResult(input: {
  attemptId: string;
  institutionId: string;
  manualScores: Record<string, number>;
  evaluationSource: string;
}) {
  const [attempt] = await db.select().from(assessmentAttempt).where(eq(assessmentAttempt.id, input.attemptId));
  if (!attempt) throw new NotFoundError("AssessmentAttempt", input.attemptId);

  const [existingResult] = await db.select().from(assessmentResult).where(eq(assessmentResult.attemptId, attempt.id));
  if (existingResult) throw new ValidationError("This attempt already has a result — results are never overwritten (spec §23)");

  const [version] = await db.select().from(assessmentVersion).where(eq(assessmentVersion.id, attempt.assessmentVersionId));
  if (!version) throw new NotFoundError("AssessmentVersion", attempt.assessmentVersionId);
  const questions = await db.select().from(assessmentQuestion).where(eq(assessmentQuestion.assessmentVersionId, version.id));

  const perQuestionScore: Record<string, number> = { ...input.manualScores };
  // NOTE: this does not re-run grading logic against `correctAnswer` — it
  // only fills in 0 for an auto-gradable question that has no score at all
  // yet (e.g. the student never answered it). The actual MCQ/MULTI_SELECT
  // comparison happens once, in submitAttempt, and its output is what gets
  // passed in here as `manualScores` — despite the name, callers pass
  // whatever scores they already have (auto-graded, human-graded, or both).
  for (const q of questions) {
    if (AUTO_GRADABLE_TYPES.has(q.type) && !(q.id in perQuestionScore)) {
      perQuestionScore[q.id] = 0; // unanswered auto-gradable question
    }
  }

  const totalScore = Object.values(perQuestionScore).reduce((a, b) => a + b, 0);
  if (totalScore > version.maxScore + 0.001) {
    await db.update(assessmentAttempt).set({ status: "INVALIDATED", reviewReason: "Recorded score exceeded assessment max score" }).where(eq(assessmentAttempt.id, attempt.id));
    throw new ValidationError(`Total score ${totalScore} exceeds assessment max score ${version.maxScore} — attempt invalidated, needs manual review`);
  }

  const skillTotals = new Map<string, { score: number; max: number }>();
  for (const q of questions) {
    if (!q.skillId) continue;
    const entry = skillTotals.get(q.skillId) ?? { score: 0, max: 0 };
    entry.score += perQuestionScore[q.id] ?? 0;
    entry.max += q.maxScore;
    skillTotals.set(q.skillId, entry);
  }
  const skillBreakdown: Record<string, number> = {};
  for (const [skillId, { score, max }] of skillTotals) {
    skillBreakdown[skillId] = max > 0 ? Math.round((score / max) * 1000) / 10 : 0;
  }

  const normalizedScore = Math.round((totalScore / version.maxScore) * 1000) / 10;

  const [result] = await db
    .insert(assessmentResult)
    .values({
      id: newId("ares"),
      attemptId: attempt.id,
      totalScore,
      normalizedScore,
      skillBreakdown,
      evaluationSource: input.evaluationSource,
    })
    .returning();

  await db.update(assessmentAttempt).set({ needsReview: false }).where(eq(assessmentAttempt.id, attempt.id));

  if (Object.keys(skillBreakdown).length > 0) {
    await db.insert(skillMeasurement).values(
      Object.entries(skillBreakdown).map(([skillId, score]) => ({
        id: newId("sm"),
        studentId: attempt.studentId,
        skillId,
        score,
        evidenceType: "ASSESSMENT" as const,
        evidenceRefId: attempt.id,
        evidenceRefType: "AssessmentAttempt",
      }))
    );
  }

  await eventBus.publish({
    type: "ASSESSMENT_RESULT_RECORDED",
    institutionId: input.institutionId,
    studentId: attempt.studentId,
    payload: { attemptId: attempt.id, totalScore, normalizedScore },
  });

  return result;
}

/**
 * node-postgres already parses jsonb columns from wire text into JS values
 * (so a stored JSON string like "4" comes back as the JS string "4"), and
 * Drizzle's own jsonb mapper re-parses any string value it receives — so a
 * BARE primitive stored at a jsonb column's top level gets silently
 * re-coerced ("4" -> the number 4, "true" -> boolean true, etc.), which
 * broke exact-match grading. Confirmed directly against this project's
 * Drizzle 0.45.2 / pg 8.23 combination. Storing `{ value: T }` instead of a
 * bare `T` sidesteps it: the top-level jsonb value is always an object, so
 * neither layer's "is this a string?" re-parse check ever fires.
 */
function unwrapCorrectAnswer(stored: unknown): unknown {
  if (stored && typeof stored === "object" && "value" in (stored as Record<string, unknown>)) {
    return (stored as { value: unknown }).value;
  }
  return stored;
}

function sameSet(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

// ---- Read helpers backing the AI tool contracts (spec §60, §88) -----------

/** A student's attempts, each with its result if one has been recorded yet
 *  (spec §57: pending manual grading shows as `result: null`, not a 0). */
export async function getStudentAssessments(studentId: string) {
  const attempts = await db.select().from(assessmentAttempt).where(eq(assessmentAttempt.studentId, studentId));
  const results = attempts.length
    ? await db.select().from(assessmentResult).where(inArray(assessmentResult.attemptId, attempts.map((a) => a.id)))
    : [];
  const resultByAttempt = new Map(results.map((r) => [r.attemptId, r]));
  return attempts.map((a) => ({ attempt: a, result: resultByAttempt.get(a.id) ?? null }));
}

export const getAssessmentResults = getStudentAssessments;
