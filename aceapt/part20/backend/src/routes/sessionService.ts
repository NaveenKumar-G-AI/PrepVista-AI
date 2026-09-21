import {
  getOrCreateDemoStudent,
  getBlueprintBySlug,
  getBlueprintById,
  getBlueprintQuestions,
  getQuestionsBySlugs,
  getQuestionsByConceptExcluding,
  getQuestionsForConcept,
  createBlueprint,
  createSessionWithBlueprint,
  getSession,
  getSessionQuestionsOrdered,
  getSessionResponses,
  getSessionEvents,
  navigateTo,
  recordAnswer,
  clearAnswer,
  setMarkedForReview,
  flushFinalTime,
  setSessionStatus,
  storeEvidence,
  getEvidence,
  updateNarrative,
  appendMockHistory,
  getMockHistory,
  toEngineQuestions,
  toEngineResponses,
  markingFromBlueprint,
  withTransaction,
  type QuestionRow,
} from "../db/repository.js";
import { computeAnalytics, type SessionEvidence } from "../engine/analytics.js";
import { chooseDrill } from "../engine/drillSelector.js";
import { assertTransition, type SessionStatus } from "../engine/stateMachine.js";
import { generateNarrative, answerCoachQuestion } from "../ai/anthropicAdapter.js";
import { MAIN_BLUEPRINT_SLUG, DRILL } from "../domain/constants.js";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toClientQuestion(row: QuestionRow & { sequence_index: number }) {
  // Exam-realism / security: no concept, difficulty, correct answer, or
  // explanation goes to the client while a session is in progress (spec
  // §4, §28, §59).
  return { id: row.id, sequenceIndex: row.sequence_index, prompt: row.prompt, options: row.options };
}

export async function startMainSession(studentIdInput?: string) {
  const studentId = studentIdInput || (await getOrCreateDemoStudent());
  const blueprint = await getBlueprintBySlug(MAIN_BLUEPRINT_SLUG);
  if (!blueprint) {
    throw new ApiError(500, "Main blueprint not seeded — run `npm run seed` first.");
  }
  const questionRows = await getBlueprintQuestions(blueprint.id);
  const questionIds = questionRows.map((r) => r.id);
  const sessionId = await createSessionWithBlueprint(studentId, blueprint.id, questionIds, null);
  const session = await getSession(sessionId);

  return {
    session: {
      id: session!.id,
      status: session!.status,
      startedAt: session!.started_at,
      durationSec: blueprint.duration_sec,
    },
    questions: questionRows.map(toClientQuestion),
  };
}

export async function getSessionState(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) throw new ApiError(404, "Session not found.");
  const blueprint = await getBlueprintById(session.blueprint_id);
  if (!blueprint) throw new ApiError(500, "Session references a missing blueprint.");
  const questionRows = await getSessionQuestionsOrdered(sessionId);
  const responseRows = await getSessionResponses(sessionId);

  const responsesByQuestion = new Map(responseRows.map((r) => [r.question_id, r]));

  return {
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.started_at,
      durationSec: blueprint.duration_sec,
    },
    questions: questionRows.map(toClientQuestion),
    responses: questionRows.map((q) => {
      const r = responsesByQuestion.get(q.id);
      return {
        questionId: q.id,
        status: r?.status ?? "unvisited",
        selectedIndex: r?.selected_index ?? null,
        markedForReview: r?.marked_for_review ?? false,
      };
    }),
  };
}

async function assertInProgress(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) throw new ApiError(404, "Session not found.");
  if (session.status !== "IN_PROGRESS") {
    throw new ApiError(409, `Session is not accepting responses (status: ${session.status}).`);
  }
  return session;
}

export async function navigate(
  sessionId: string,
  params: { fromQuestionId: string | null; fromIndex: number | null; toQuestionId: string; toIndex: number; elapsedMs: number }
) {
  await assertInProgress(sessionId);
  await navigateTo(sessionId, params);
}

export async function answer(sessionId: string, questionId: string, selectedIndex: number) {
  await assertInProgress(sessionId);
  await recordAnswer(sessionId, questionId, selectedIndex);
}

export async function clear(sessionId: string, questionId: string) {
  await assertInProgress(sessionId);
  await clearAnswer(sessionId, questionId);
}

export async function mark(sessionId: string, questionId: string, marked: boolean) {
  await assertInProgress(sessionId);
  await setMarkedForReview(sessionId, questionId, marked);
}

/**
 * Finalizes a session. The elapsed-time budget is computed from the
 * server-recorded `started_at` timestamp, never from a client-supplied
 * total — a client cannot claim more or less time than the wall clock
 * actually allowed (spec §55, §59). The server also decides SUBMITTED vs
 * TIME_EXPIRED itself rather than trusting whatever reason the client sends.
 */
export async function submitSession(
  sessionId: string,
  params: { finalQuestionId: string | null; finalElapsedMs: number }
) {
  const session = await assertInProgress(sessionId);
  const blueprint = await getBlueprintById(session.blueprint_id);
  if (!blueprint) throw new ApiError(500, "Session references a missing blueprint.");

  await flushFinalTime(sessionId, params.finalQuestionId, params.finalElapsedMs);

  const startedMs = new Date(session.started_at).getTime();
  const rawUsedSec = Math.round((Date.now() - startedMs) / 1000);
  const usedSec = Math.max(0, Math.min(rawUsedSec, blueprint.duration_sec));
  const expired = rawUsedSec >= blueprint.duration_sec;

  const submittedStatus: SessionStatus = expired ? "TIME_EXPIRED" : "SUBMITTED";
  assertTransition(session.status as SessionStatus, submittedStatus);
  await setSessionStatus(sessionId, submittedStatus, { usedSec });

  assertTransition(submittedStatus, "PROCESSING");
  await setSessionStatus(sessionId, "PROCESSING");

  const questionRows = await getSessionQuestionsOrdered(sessionId);
  const responseRows = await getSessionResponses(sessionId);
  const eventRows = await getSessionEvents(sessionId);

  const evidence = computeAnalytics(
    toEngineQuestions(questionRows),
    toEngineResponses(responseRows),
    eventRows,
    usedSec,
    markingFromBlueprint(blueprint)
  );

  assertTransition("PROCESSING", "ANALYZED");
  await setSessionStatus(sessionId, "ANALYZED");
  await storeEvidence(sessionId, evidence, null, null);

  if (blueprint.kind === "main") {
    await appendMockHistory({
      studentId: session.student_id,
      sessionId,
      score: evidence.score,
      maxScore: evidence.maxScore,
      accuracyPct: evidence.accuracyPct,
      selectionQuality: evidence.selectionQuality,
    });
  }

  return { evidence, expired };
}

export async function getReport(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) throw new ApiError(404, "Session not found.");
  if (session.status !== "ANALYZED" && session.status !== "COMPLETED") {
    throw new ApiError(409, `Report not ready yet (status: ${session.status}).`);
  }
  const cached = await getEvidence(sessionId);
  if (!cached) throw new ApiError(500, "Session is analyzed but evidence is missing.");
  const evidence = cached.evidence as SessionEvidence;

  let narrative = cached.narrative as string | null;
  let narrativeSource = cached.narrative_source as string | null;
  if (!narrative) {
    const result = await generateNarrative(evidence);
    narrative = result.text;
    narrativeSource = result.source;
    await updateNarrative(sessionId, narrative, narrativeSource);
  }

  const questionRows = await getSessionQuestionsOrdered(sessionId);
  const responseRows = await getSessionResponses(sessionId);
  const responsesByQuestion = new Map(responseRows.map((r) => [r.question_id, r]));

  const questionReview = questionRows.map((q) => ({
    sequenceIndex: q.sequence_index,
    prompt: q.prompt,
    options: q.options,
    concept: q.concept,
    difficulty: q.difficulty,
    correctIndex: q.correct_index,
    explanation: q.explanation,
    yourIndex: responsesByQuestion.get(q.id)?.selected_index ?? null,
  }));

  return {
    session: { id: session.id, status: session.status },
    evidence,
    narrative: { text: narrative, source: narrativeSource },
    questionReview,
  };
}

export async function coach(sessionId: string, promptKey: string) {
  const cached = await getEvidence(sessionId);
  if (!cached) throw new ApiError(409, "Report not ready yet — submit the session first.");
  const evidence = cached.evidence as SessionEvidence;
  const result = await answerCoachQuestion(promptKey, evidence);
  return result;
}

export async function startDrillSession(parentSessionId: string) {
  const parentSession = await getSession(parentSessionId);
  if (!parentSession) throw new ApiError(404, "Parent session not found.");
  const cached = await getEvidence(parentSessionId);
  if (!cached) throw new ApiError(409, "Parent session has no evidence yet — submit it first.");
  const evidence = cached.evidence as SessionEvidence;

  const choice = chooseDrill(evidence);

  let questionRows: QuestionRow[];
  if (choice.type === "selection") {
    questionRows = await getQuestionsBySlugs([
      "drill-pct-original-number",
      "drill-tw-leak",
      "drill-avg-removed-number",
      "drill-alg-substitution",
    ]);
  } else {
    const primary = await getQuestionsForConcept(choice.concept!, 1);
    const rest = await getQuestionsByConceptExcluding(
      choice.concept!,
      primary.map((p) => p.slug),
      DRILL.questionCount - primary.length
    );
    questionRows = [...primary, ...rest];
  }

  if (questionRows.length === 0) {
    throw new ApiError(500, "No drill questions available for the chosen focus.");
  }

  const blueprintId = await withTransaction(async (client) => {
    const id = await createBlueprint(client, {
      slug: `drill-${parentSessionId}-${Date.now()}`,
      name: choice.label,
      kind: "drill",
      questionCount: questionRows.length,
      durationSec: DRILL.durationSec,
      marking: { correct: 1, wrong: 0, skip: 0 }, // low-stakes practice: no penalty for a wrong guess
    });
    for (let i = 0; i < questionRows.length; i++) {
      await client.query(
        `INSERT INTO blueprint_questions (blueprint_id, question_id, sequence_index) VALUES ($1,$2,$3)`,
        [id, questionRows[i].id, i]
      );
    }
    return id;
  });

  const sessionId = await createSessionWithBlueprint(
    parentSession.student_id,
    blueprintId,
    questionRows.map((q) => q.id),
    parentSessionId
  );
  const session = await getSession(sessionId);

  return {
    drillChoice: choice,
    session: {
      id: session!.id,
      status: session!.status,
      startedAt: session!.started_at,
      durationSec: DRILL.durationSec,
    },
    questions: questionRows.map((q, i) => toClientQuestion({ ...q, sequence_index: i })),
  };
}

export async function getImprovement(drillSessionId: string) {
  const drillSession = await getSession(drillSessionId);
  if (!drillSession) throw new ApiError(404, "Drill session not found.");
  if (!drillSession.parent_session_id) throw new ApiError(400, "Session is not a drill (no parent session).");

  const drillCached = await getEvidence(drillSessionId);
  const parentCached = await getEvidence(drillSession.parent_session_id);
  if (!drillCached || !parentCached) {
    throw new ApiError(409, "Both the drill and the original session must be submitted first.");
  }
  const drillBlueprint = await getBlueprintById(drillSession.blueprint_id);

  return {
    drillLabel: drillBlueprint?.name ?? "Targeted Drill",
    drillEvidence: drillCached.evidence as SessionEvidence,
    mainEvidence: parentCached.evidence as SessionEvidence,
  };
}

export async function listMockHistory(studentId?: string) {
  const id = studentId || (await getOrCreateDemoStudent());
  const rows = await getMockHistory(id);
  return rows.map((r) => ({
    sessionId: r.session_id,
    score: Number(r.score),
    maxScore: Number(r.max_score),
    accuracyPct: r.accuracy,
    selectionQuality: r.selection_quality,
    completedAt: r.completed_at,
  }));
}
