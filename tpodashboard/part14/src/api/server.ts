import express, { type Request, type Response, type NextFunction } from "express";
import { actionEngine } from "../engine/actionEngine.js";
import { ActionError, type ActorContext } from "../types/action.types.js";
import "../index.js"; // ensures the action catalog is registered

/**
 * Minimal HTTP wrapper. Real deployments would replace `resolveActor` with
 * the institution's actual session/auth middleware — this module never
 * accepts role/institutionId/scope from the request body, only from the
 * resolved, authenticated actor (spec section 24).
 */
function resolveActor(req: Request): ActorContext {
  const actor = (req as any).actor as ActorContext | undefined;
  if (!actor) {
    throw new ActionError("UNAUTHENTICATED", "No authenticated session found.");
  }
  return actor;
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export function createActionsApiRouter() {
  const router = express.Router();
  router.use(express.json());

  router.post(
    "/actions",
    asyncHandler(async (req, res) => {
      const ctx = resolveActor(req);
      const { actionType, input } = req.body as { actionType: string; input: unknown };
      const action = await actionEngine.proposeAction(actionType, input, ctx);
      res.json(action);
    })
  );

  router.get(
    "/actions/:id",
    asyncHandler(async (req, res) => {
      const ctx = resolveActor(req);
      res.json(actionEngine.getActionStatus((req.params.id as string), ctx));
    })
  );

  router.post(
    "/actions/:id/preview",
    asyncHandler(async (req, res) => {
      const ctx = resolveActor(req);
      res.json(await actionEngine.previewAction((req.params.id as string), ctx));
    })
  );

  router.post(
    "/actions/:id/confirm",
    asyncHandler(async (req, res) => {
      const ctx = resolveActor(req);
      res.json(await actionEngine.confirmAction((req.params.id as string), ctx));
    })
  );

  router.post(
    "/actions/:id/execute",
    asyncHandler(async (req, res) => {
      const ctx = resolveActor(req);
      res.json(await actionEngine.executeAction((req.params.id as string), ctx));
    })
  );

  router.post(
    "/actions/:id/cancel",
    asyncHandler(async (req, res) => {
      const ctx = resolveActor(req);
      res.json(await actionEngine.cancelAction((req.params.id as string), ctx));
    })
  );

  // Error handler: map ActionError to clean 4xx codes; never leak internals.
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ActionError) {
      const statusByCode: Record<string, number> = {
        NOT_FOUND: 404,
        UNAUTHENTICATED: 401,
        FORBIDDEN: 403,
        PERMISSION_DENIED: 403,
        POLICY_DENIED: 422,
        PRECONDITION_FAILED: 422,
        INVALID_INPUT: 400,
        INVALID_STATE: 409,
        NOT_CONFIRMED: 409,
        NOT_CONFIRMABLE: 409,
        STALE_CONFIRMATION: 409,
        STALE_DATA: 409,
        ILLEGAL_TRANSITION: 409,
      };
      res.status(statusByCode[err.code] ?? 400).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: "INTERNAL", message: "Unexpected error." });
  });

  return router;
}
