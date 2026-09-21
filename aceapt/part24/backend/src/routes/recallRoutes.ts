import { Router, Request, Response } from 'express';
import { RecallService } from '../services/recallService';

/** Express's route-param typing allows string[] (for repeated-param
 * patterns we never use here). Every :param in this file is a single
 * plain segment, so this just narrows it back to string. */
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

export function buildRecallRoutes(service: RecallService): Router {
  const router = Router();

  const wrap = (fn: (req: Request, res: Response) => Promise<void> | void) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: (err as Error).message });
    }
  };

  router.get('/skills', wrap((_req, res) => {
    res.json(service.listSkills());
  }));

  router.get('/memory-profile/:studentId', wrap((req, res) => {
    res.json(service.getMemoryProfile(param(req, 'studentId')));
  }));

  router.get('/retention-state/:studentId/:skillId', wrap((req, res) => {
    res.json(service.getRetentionState(param(req, 'studentId'), param(req, 'skillId')));
  }));

  router.get('/retention-history/:studentId/:skillId', wrap((req, res) => {
    res.json(service.getRetentionHistory(param(req, 'studentId'), param(req, 'skillId')));
  }));

  router.get('/retention-transitions/:studentId/:skillId', wrap((req, res) => {
    res.json(service.getRetentionHistory(param(req, 'studentId'), param(req, 'skillId')).transitions);
  }));

  router.get('/memory-priorities/:studentId', wrap((req, res) => {
    res.json(service.getMemoryPriorities(param(req, 'studentId')));
  }));

  router.get('/recovery-recommendation/:studentId/:skillId', wrap(async (req, res) => {
    res.json(await service.getRecoveryRecommendation(param(req, 'studentId'), param(req, 'skillId')));
  }));

  router.get('/explanation/:studentId/:skillId', wrap(async (req, res) => {
    res.json(await service.getExplanation(param(req, 'studentId'), param(req, 'skillId')));
  }));

  router.get('/pathfinder-signals/:studentId', wrap((req, res) => {
    res.json(service.getPathfinderSignal(param(req, 'studentId')));
  }));

  router.get('/proof-evidence/:studentId/:skillId', wrap((req, res) => {
    res.json(service.getProofEvidence(param(req, 'studentId'), param(req, 'skillId')));
  }));

  // --- Mutating endpoints: the client can only ever submit answers/evidence,
  // never a retention state, risk score, or readiness value directly. ---

  router.post('/recall-result', wrap((req, res) => {
    const { studentId, skillId, source, difficulty, questionType, performance, timeTakenSeconds, context, simulatedDaysAgo } = req.body;
    res.json(service.recordRawEvidence({ studentId, skillId, source, difficulty, questionType, performance, timeTakenSeconds, context, simulatedDaysAgo }));
  }));

  router.post('/recovery-result', wrap((req, res) => {
    const { studentId, sessionId, answers } = req.body;
    res.json(service.submitRecoveryResult({ studentId, sessionId, answers }));
  }));

  router.post('/delayed-verification', wrap((req, res) => {
    const { studentId, sessionId, answers, simulatedDaysLater } = req.body;
    res.json(service.submitDelayedVerification({ studentId, sessionId, answers, simulatedDaysLater }));
  }));

  return router;
}
