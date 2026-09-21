import type { Request, Response } from 'express';
import type { GuidedSolvingService } from '../../services/guidedSolvingService.js';
import { startSessionSchema, submitStepSchema, requestGuidanceSchema, reconstructionSchema, feedbackSchema } from '../dto/schemas.js';

/**
 * Deliberately thin: every handler validates/extracts request data, calls
 * exactly one service method with `req.studentId` as the authenticated
 * caller, and serializes the result. All business logic - including
 * ownership enforcement - lives in GuidedSolvingService (Section 94: HTTP
 * auth answers "who are you", the service answers "are you allowed to see
 * this resource").
 */
export function buildGuidedSessionController(service: GuidedSolvingService) {
  return {
    listProblems: async (_req: Request, res: Response) => {
      const problems = await service.listProblems();
      res.json({ problems });
    },

    startSession: async (req: Request, res: Response) => {
      const body = startSessionSchema.parse(req.body);
      const session = await service.startSession({ studentId: req.studentId!, problemId: body.problemId });
      res.status(201).json({ session });
    },

    getSession: async (req: Request, res: Response) => {
      const session = await service.getSession(req.params.sessionId!, req.studentId);
      res.json({ session });
    },

    getCurrentStep: async (req: Request, res: Response) => {
      const step = await service.getCurrentStep(req.params.sessionId!, req.studentId);
      res.json({ step });
    },

    submitStep: async (req: Request, res: Response) => {
      const body = submitStepSchema.parse(req.body);
      const result = await service.submitStep({
        sessionId: req.params.sessionId!,
        stepId: req.params.stepId!,
        rawInput: body.rawInput,
        expectedVersion: body.expectedVersion,
        clientRequestId: body.clientRequestId,
        requestingStudentId: req.studentId,
      });
      res.json(result);
    },

    retryStep: async (req: Request, res: Response) => {
      const step = await service.retryStep(req.params.sessionId!, req.params.stepId!, req.studentId);
      res.json({ step });
    },

    skipStep: async (req: Request, res: Response) => {
      const session = await service.skipStep(req.params.sessionId!, req.params.stepId!, req.studentId);
      res.json({ session });
    },

    requestGuidance: async (req: Request, res: Response) => {
      const body = requestGuidanceSchema.parse(req.body ?? {});
      const guidance = await service.requestGuidance({
        sessionId: req.params.sessionId!,
        stepId: req.params.stepId!,
        studentNote: body.studentNote,
        requestingStudentId: req.studentId,
      });
      res.json({ guidance });
    },

    requestExplanation: async (req: Request, res: Response) => {
      const guidance = await service.requestExplanation(req.params.sessionId!, req.params.stepId!, req.studentId);
      res.json({ guidance });
    },

    showNextStep: async (req: Request, res: Response) => {
      const preview = await service.showNextStep(req.params.sessionId!, req.studentId);
      res.json(preview);
    },

    revealFullSolution: async (req: Request, res: Response) => {
      const solution = await service.revealFullSolution(req.params.sessionId!, req.studentId);
      res.json(solution);
    },

    submitReconstruction: async (req: Request, res: Response) => {
      const body = reconstructionSchema.parse(req.body);
      const result = await service.submitReconstruction(req.params.sessionId!, body.answers, req.studentId);
      res.json(result);
    },

    completeSession: async (req: Request, res: Response) => {
      const outcome = await service.completeSession(req.params.sessionId!, req.studentId);
      res.json({ outcome });
    },

    startVerification: async (req: Request, res: Response) => {
      const session = await service.startVerification(req.params.sessionId!, req.studentId);
      res.status(201).json({ session });
    },

    getSummary: async (req: Request, res: Response) => {
      const summary = await service.getSummary(req.params.sessionId!, req.studentId);
      res.json(summary);
    },

    submitFeedback: async (req: Request, res: Response) => {
      const body = feedbackSchema.parse(req.body);
      await service.submitFeedback(req.params.sessionId!, body.feedback, req.studentId);
      res.status(204).end();
    },

    abandonSession: async (req: Request, res: Response) => {
      await service.abandonSession(req.params.sessionId!, req.studentId);
      res.status(204).end();
    },
  };
}
