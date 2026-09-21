import { Router } from "express";
import { SessionEngine } from "../domain/sessionEngine";
import { createSocraticController } from "./controller";
import { authMiddleware, AuthedRequest, rateLimitMiddleware } from "./middleware";

// Conceptual operations from section 86 of the spec, mapped onto REST verbs.
export function buildSocraticRouter(engine: SessionEngine): Router {
  const router = Router();
  const controller = createSocraticController(engine);

  router.use(authMiddleware, rateLimitMiddleware);

  router.post("/sessions", (req, res) => controller.startSession(req as unknown as AuthedRequest, res)); // startSocraticSession
  router.get("/sessions/:id", (req, res) => controller.getSession(req as unknown as AuthedRequest, res)); // getSocraticSession
  router.post("/sessions/:id/respond", (req, res) => controller.respond(req as unknown as AuthedRequest, res)); // respondToSocraticPrompt
  router.post("/sessions/:id/hint", (req, res) => controller.requestHint(req as unknown as AuthedRequest, res)); // requestHint
  router.post("/sessions/:id/explain", (req, res) => controller.requestExplanation(req as unknown as AuthedRequest, res)); // requestExplanation
  router.post("/sessions/:id/simplify", (req, res) => controller.requestSimplify(req as unknown as AuthedRequest, res));
  router.post("/sessions/:id/solve-independently", (req, res) => controller.requestIndependent(req as unknown as AuthedRequest, res));
  router.post("/sessions/new-question", (req, res) => controller.requestNewQuestion(req as unknown as AuthedRequest, res));
  router.post("/sessions/:id/complete", (req, res) => controller.complete(req as unknown as AuthedRequest, res)); // completeSocraticSession

  return router;
}
