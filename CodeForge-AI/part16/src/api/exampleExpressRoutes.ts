/**
 * ILLUSTRATIVE ONLY — adapt to CodeForge's actual router/framework/auth
 * middleware. The point being demonstrated is the shape: identity comes
 * from server-verified session state (req.user, set by *your existing*
 * auth middleware), NEVER from req.params/req.body/req.query — see spec
 * SECURITY: "Never trust client-provided user_id...".
 *
 * Written against a minimal structural subset of Express's Request/
 * Response shape (rather than importing the real `express` package) so
 * this file adds no dependency to the engine — swap these three type
 * aliases for real `express` (or Next.js Route Handler / Fastify) types
 * in your actual app; the handler bodies below don't change either way.
 */
interface Request {
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  user: { id: string };
}
interface Response {
  status(code: number): Response;
  json(body: unknown): void;
}
type NextFunction = (err?: unknown) => void;
interface Router {
  post(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): void;
  get(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): void;
}

import {
  requestAnalysis,
  getCorrectnessAssessment,
  getCorrectnessHistory,
  getRequirementCoverage,
  compareSubmissionCorrectness,
  RateLimitedError,
  NotFoundError,
  type HandlerDeps,
} from "./handlers.js";
import { AuthorizationError } from "../security/authorization.js";

function handleErrors(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AuthorizationError) return res.status(403).json({ error: "forbidden" });
      if (err instanceof NotFoundError) return res.status(404).json({ error: "not_found" });
      if (err instanceof RateLimitedError) return res.status(429).json({ error: "rate_limited" });
      next(err);
    }
  };
}

export function registerCorrectnessRoutes(router: Router, deps: HandlerDeps): void {
  // POST /api/submissions/:submissionId/correctness/analyze
  router.post(
    "/api/submissions/:submissionId/correctness/analyze",
    handleErrors(async (req, res) => {
      const assessment = await requestAnalysis(deps, req.user.id, req.params.submissionId as string);
      res.json(assessment);
    })
  );

  // GET /api/submissions/:submissionId/correctness?version=v1
  router.get(
    "/api/submissions/:submissionId/correctness",
    handleErrors(async (req, res) => {
      const version = String(req.query.version ?? "");
      const assessment = await getCorrectnessAssessment(deps, req.user.id, req.params.submissionId as string, version);
      res.json(assessment);
    })
  );

  // GET /api/problems/:problemId/correctness/history
  router.get(
    "/api/problems/:problemId/correctness/history",
    handleErrors(async (req, res) => {
      const history = await getCorrectnessHistory(deps, req.user.id, req.params.problemId as string);
      res.json(history);
    })
  );

  // GET /api/submissions/:submissionId/correctness/requirements?version=v1
  router.get(
    "/api/submissions/:submissionId/correctness/requirements",
    handleErrors(async (req, res) => {
      const version = String(req.query.version ?? "");
      const coverage = await getRequirementCoverage(deps, req.user.id, req.params.submissionId as string, version);
      res.json(coverage);
    })
  );

  // GET /api/problems/:problemId/correctness/compare?a=sub1:v1&b=sub1:v2
  router.get(
    "/api/problems/:problemId/correctness/compare",
    handleErrors(async (req, res) => {
      const [aSub, aVer] = String(req.query.a ?? "").split(":");
      const [bSub, bVer] = String(req.query.b ?? "").split(":");
      const result = await compareSubmissionCorrectness(deps, req.user.id, aSub!, aVer!, bSub!, bVer!);
      res.json(result);
    })
  );
}
