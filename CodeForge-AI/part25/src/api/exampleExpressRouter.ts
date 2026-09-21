/**
 * ILLUSTRATIVE ONLY — not imported by anything in this package, and not
 * built/tested (see package.json — Express isn't a dependency here). This
 * shows how the framework-agnostic handlers in handlers.ts would be wired
 * into a real HTTP layer. Swap `req`/`res` for real Express (or Next.js
 * route handler / Fastify / whatever this repository already uses) types
 * once this is copied into the actual server, and replace `authFromReq`
 * with the repository's real auth middleware — this file does not
 * implement authentication itself.
 */

import { EnginePorts } from '../integration/ports';
import * as handlers from './handlers';
import { AuthorizationError } from './handlers';
import { SelectionMode } from '../types';

function authFromReq(req: any): handlers.AuthContext {
  // ASSUMPTION: replace with the repository's real session/JWT parsing.
  if (!req.auth) throw new AuthorizationError('Not authenticated.');
  return req.auth as handlers.AuthContext;
}

export function registerAdaptiveChallengeRoutes(router: any, ports: EnginePorts) {
  router.get('/students/:studentId/next-challenge', async (req: any, res: any) => {
    try {
      const auth = authFromReq(req);
      const mode = (req.query.mode as SelectionMode) || 'PRACTICE';
      const result = await handlers.getNextChallenge(
        req.params.studentId,
        { mode, language: req.query.language, availableTimeMinutes: req.query.minutes ? Number(req.query.minutes) : undefined },
        auth,
        ports
      );
      res.json(result);
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/students/:studentId/selection-explanation', async (req: any, res: any) => {
    try {
      const auth = authFromReq(req);
      res.json(await handlers.getSelectionExplanation(req.params.studentId, auth, ports));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/students/:studentId/adaptive-path', async (req: any, res: any) => {
    try {
      const auth = authFromReq(req);
      res.json(await handlers.getAdaptivePath(req.params.studentId, auth, ports));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post('/students/:studentId/selection', async (req: any, res: any) => {
    try {
      const auth = authFromReq(req);
      res.json(await handlers.recordSelection(req.params.studentId, req.body.challengeId, auth, ports));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post('/students/:studentId/challenge-outcome', async (req: any, res: any) => {
    try {
      const auth = authFromReq(req);
      res.json(await handlers.recordChallengeOutcome(req.params.studentId, req.body.outcome, auth, ports));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/students/:studentId/skill-targets', async (req: any, res: any) => {
    try {
      const auth = authFromReq(req);
      res.json(await handlers.getSkillTargets(req.params.studentId, auth, ports));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/students/:studentId/challenge-recommendations', async (req: any, res: any) => {
    try {
      const auth = authFromReq(req);
      const mode = (req.query.mode as SelectionMode) || 'PRACTICE';
      res.json(await handlers.getChallengeRecommendations(req.params.studentId, { mode }, auth, ports));
    } catch (err) {
      handleError(err, res);
    }
  });
}

function handleError(err: unknown, res: any) {
  if (err instanceof AuthorizationError) {
    res.status(403).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
}
