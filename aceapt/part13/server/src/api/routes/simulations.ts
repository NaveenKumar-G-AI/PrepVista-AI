import { Router } from "express";
import { z } from "zod";
import * as repo from "../../db/repository.js";
import { EVENT_TYPES, PRACTICE_MODES } from "../../domain/types.js";
import { explainPostmortem } from "../../ai/explanationService.js";
import { buildSimulationPostmortem } from "../../engines/postmortemEngine.js";
import { recomputeReadiness } from "../../engines/readinessService.js";
import * as simulationService from "../../simulation/simulationService.js";
import { asyncHandler } from "../asyncHandler.js";

export const simulationsRouter = Router();

const startSchema = z.object({
  profileId: z.string().uuid(),
  practiceMode: z.enum(PRACTICE_MODES),
});

simulationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = startSchema.parse(req.body);
    const studentId = req.auth!.studentId;
    const result = await simulationService.startSimulation(studentId, body.profileId, body.practiceMode);
    res.status(201).json(result);
  })
);

simulationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    const simulations = await repo.listSimulationsForStudent(studentId);
    res.json({
      simulations: simulations.map((s) => ({
        id: s.id,
        profileId: s.profileId,
        practiceMode: s.practiceMode,
        status: s.status,
        startedAt: s.startedAt,
        submittedAt: s.submittedAt,
        totalScore: s.totalScore,
        maxScore: s.maxScore,
        accuracy: s.accuracy,
        questionCount: s.attempts.length,
        createdAt: s.createdAt,
      })),
    });
  })
);

simulationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    const simulationId = req.params.id as string;
    const record = await repo.getSimulationRecord(studentId, simulationId);
    if (!record) {
      res.status(404).json({ error: "Simulation not found" });
      return;
    }

    if (record.status === "submitted") {
      const withAnswers = await repo.getQuestionsWithAnswerKey(record.attempts.map((a) => a.questionId));
      const byId = new Map(withAnswers.map((q) => [q.id, q]));
      res.json({
        simulation: record,
        questions: record.attempts
          .sort((a, b) => a.sequencePosition - b.sequencePosition)
          .map((a) => ({ ...byId.get(a.questionId), attempt: a })),
      });
      return;
    }

    const ordered = await repo.getSimulationQuestions(studentId, simulationId);
    const delivery = await repo.getQuestionsForDelivery(ordered.map((o) => o.questionId));
    const byId = new Map(delivery.map((d) => [d.id, d]));
    res.json({
      simulation: record,
      questions: ordered.map((o) => ({
        questionId: o.questionId,
        section: o.section,
        sequenceOrder: o.sequenceOrder,
        expectedTimeSeconds: o.expectedTimeSeconds,
        prompt: byId.get(o.questionId)?.prompt ?? "",
        options: byId.get(o.questionId)?.options ?? [],
      })),
    });
  })
);

const eventSchema = z.object({
  questionId: z.string().uuid().nullable(),
  eventType: z.enum(EVENT_TYPES),
  eventTimestamp: z.string(),
  payload: z
    .object({
      selectedOptionId: z.string().optional(),
      timeSpentDeltaSeconds: z.number().min(0).max(3600).optional(),
      section: z.string().optional(),
    })
    .default({}),
});
const eventsSchema = z.object({ events: z.array(eventSchema).min(1).max(200) });

simulationsRouter.post(
  "/:id/events",
  asyncHandler(async (req, res) => {
    const body = eventsSchema.parse(req.body);
    const studentId = req.auth!.studentId;
    await simulationService.recordEvents(studentId, req.params.id as string, body.events);
    res.status(202).json({ recorded: body.events.length });
  })
);

simulationsRouter.post(
  "/:id/submit",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    const simulationId = req.params.id as string;
    const postmortem = await simulationService.submitSimulation(studentId, simulationId);
    const explanation = await explainPostmortem(postmortem);
    const readiness = await recomputeReadiness(studentId);
    res.json({ postmortem, explanation, readiness });
  })
);

simulationsRouter.get(
  "/:id/postmortem",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    const record = await repo.getSimulationRecord(studentId, req.params.id as string);
    if (!record) {
      res.status(404).json({ error: "Simulation not found" });
      return;
    }
    if (record.status !== "submitted") {
      res.status(409).json({ error: "Simulation has not been submitted yet" });
      return;
    }
    const postmortem = buildSimulationPostmortem(record);
    const explanation = await explainPostmortem(postmortem);
    res.json({ postmortem, explanation });
  })
);
