import type { Difficulty, PracticeMode } from "../domain/types.js";
import * as repo from "../db/repository.js";
import type { RawEventInput } from "../db/repository.js";
import { generateBlueprint } from "./blueprintGenerator.js";
import { reconcileAttempts } from "./eventProcessor.js";
import { scoreSimulation } from "./scoringEngine.js";
import { buildSimulationPostmortem, type SimulationPostmortem } from "../engines/postmortemEngine.js";

export interface DeliverableQuestion {
  questionId: string;
  section: string;
  sequenceOrder: number;
  expectedTimeSeconds: number;
  prompt: string;
  options: { id: string; text: string }[];
}

export interface StartSimulationResult {
  simulationId: string;
  durationMinutes: number;
  blueprintIssues: string[];
  questions: DeliverableQuestion[];
}

export async function startSimulation(
  studentId: string,
  profileId: string,
  practiceMode: PracticeMode
): Promise<StartSimulationResult> {
  const profile = await repo.getAssessmentProfile(profileId);
  if (!profile) throw new Error(`Assessment profile ${profileId} not found or inactive`);

  const topicIds = [...new Set(profile.sections.flatMap((s) => s.topicIds))];
  const pool = await repo.getQuestionPool(topicIds);

  const history = await repo.listSimulationsForStudent(studentId);
  const previouslySeen = new Set(
    history.filter((s) => s.status === "submitted").flatMap((s) => s.attempts.map((a) => a.questionId))
  );

  const blueprint = generateBlueprint(profile, pool, previouslySeen);
  if (blueprint.selectedQuestionIds.length === 0) {
    throw new Error(
      "Could not assemble any questions for this profile — the question pool is empty for its configured topics. " +
        "Seed more questions or adjust the profile's sections."
    );
  }

  const blueprintId = await repo.createBlueprint({
    profileId,
    composition: blueprint.composition,
    validation: blueprint.validation,
  });

  const compositionForCreate = blueprint.composition.map((slot, i) => ({
    questionId: blueprint.selectedQuestionIds[i]!,
    section: slot.section,
    expectedTimeSeconds: slot.expectedTimeSeconds,
    weight: slot.weight,
  }));

  const simulationId = await repo.createSimulation({
    studentId,
    profileId,
    blueprintId,
    practiceMode,
    durationMinutes: profile.durationMinutes,
    composition: compositionForCreate,
  });

  const orderedMeta = await repo.getSimulationQuestions(studentId, simulationId);
  const delivery = await repo.getQuestionsForDelivery(orderedMeta.map((m) => m.questionId));
  const deliveryById = new Map(delivery.map((d) => [d.id, d]));

  const questions: DeliverableQuestion[] = orderedMeta.map((m) => {
    const d = deliveryById.get(m.questionId);
    return {
      questionId: m.questionId,
      section: m.section,
      sequenceOrder: m.sequenceOrder,
      expectedTimeSeconds: m.expectedTimeSeconds,
      prompt: d?.prompt ?? "",
      options: d?.options ?? [],
    };
  });

  return { simulationId, durationMinutes: profile.durationMinutes, blueprintIssues: blueprint.validation.issues, questions };
}

export async function recordEvents(
  studentId: string,
  simulationId: string,
  events: RawEventInput[],
  startedAtOverride?: Date
): Promise<void> {
  const startEvent = events.find((e) => e.eventType === "ASSESSMENT_STARTED");
  if (startEvent) {
    await repo.markSimulationStarted(studentId, simulationId, startedAtOverride ?? new Date(startEvent.eventTimestamp));
  }
  await repo.recordEvents(studentId, simulationId, events);
  if (events.some((e) => e.eventType === "ASSESSMENT_ABANDONED")) {
    await repo.markSimulationAbandoned(studentId, simulationId);
  }
}

export async function submitSimulation(
  studentId: string,
  simulationId: string,
  submittedAtOverride?: Date
): Promise<SimulationPostmortem> {
  const meta = await repo.getSimulationMeta(studentId, simulationId);
  if (!meta) throw new Error(`Simulation ${simulationId} not found`);
  const profile = await repo.getAssessmentProfile(meta.profileId);
  if (!profile) throw new Error(`Assessment profile ${meta.profileId} not found`);

  const simQuestions = await repo.getSimulationQuestions(studentId, simulationId);
  const events = await repo.getEventsForSimulation(studentId, simulationId);
  const answerKey = await repo.getAnswerKey(simQuestions.map((q) => q.questionId));
  const questionMeta = await repo.getQuestionMeta(simQuestions.map((q) => q.questionId));

  const reconciled = reconcileAttempts(
    events.map((e) => ({
      questionId: e.questionId,
      eventType: e.eventType as any,
      eventTimestamp: e.eventTimestamp,
      payload: e.payload,
    })),
    simQuestions.map((q) => ({ questionId: q.questionId, correctOptionId: answerKey.get(q.questionId) ?? "" }))
  );

  const bySeq = new Map(simQuestions.map((q) => [q.questionId, q]));
  const attempts = reconciled.map((r) => {
    const sq = bySeq.get(r.questionId);
    const qm = questionMeta.get(r.questionId);
    return {
      ...r,
      topicId: qm?.topicId ?? "",
      difficulty: (qm?.difficulty ?? "medium") as Difficulty,
      section: sq?.section ?? "",
      sequencePosition: sq?.sequenceOrder ?? 0,
    };
  });

  const weightByQuestion = new Map(simQuestions.map((q) => [q.questionId, q.weight]));
  const scoring = scoreSimulation(
    attempts.map((a) => ({ isCorrect: a.isCorrect, finalStatus: a.finalStatus, weight: weightByQuestion.get(a.questionId) ?? 1 })),
    profile.scoringRules,
    profile.negativeMarking
  );

  await repo.finalizeSimulation({
    studentId,
    simulationId,
    attempts,
    totalScore: scoring.totalScore,
    maxScore: scoring.maxScore,
    accuracy: scoring.accuracy,
    submittedAt: submittedAtOverride,
  });

  const finalRecord = await repo.getSimulationRecord(studentId, simulationId);
  if (!finalRecord) throw new Error("Simulation vanished immediately after being finalized — this should be unreachable");
  return buildSimulationPostmortem(finalRecord);
}
