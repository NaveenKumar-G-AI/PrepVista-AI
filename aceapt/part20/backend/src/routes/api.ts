import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import * as sessionService from "./sessionService.js";
import { ApiError } from "./sessionService.js";

export const apiRouter = Router();

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, `Invalid request: ${result.error.issues.map((i) => i.message).join("; ")}`);
  }
  return result.data;
}

apiRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, service: "aceapt-feature20-simulation-engine" });
  })
);

const startSessionSchema = z.object({ studentId: z.string().uuid().optional() });
apiRouter.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const body = validate(startSessionSchema, req.body ?? {});
    const result = await sessionService.startMainSession(body.studentId);
    res.status(201).json(result);
  })
);

apiRouter.get(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    const result = await sessionService.getSessionState(req.params.id);
    res.json(result);
  })
);

const navigateSchema = z.object({
  fromQuestionId: z.string().uuid().nullable(),
  fromIndex: z.number().int().nullable(),
  toQuestionId: z.string().uuid(),
  toIndex: z.number().int().nonnegative(),
  elapsedMs: z.number().nonnegative(),
});
apiRouter.post(
  "/sessions/:id/navigate",
  asyncHandler(async (req, res) => {
    const body = validate(navigateSchema, req.body);
    await sessionService.navigate(req.params.id, body);
    res.json({ ok: true });
  })
);

const answerSchema = z.object({ questionId: z.string().uuid(), selectedIndex: z.number().int().min(0).max(3) });
apiRouter.post(
  "/sessions/:id/answer",
  asyncHandler(async (req, res) => {
    const body = validate(answerSchema, req.body);
    await sessionService.answer(req.params.id, body.questionId, body.selectedIndex);
    res.json({ ok: true });
  })
);

const clearSchema = z.object({ questionId: z.string().uuid() });
apiRouter.post(
  "/sessions/:id/clear",
  asyncHandler(async (req, res) => {
    const body = validate(clearSchema, req.body);
    await sessionService.clear(req.params.id, body.questionId);
    res.json({ ok: true });
  })
);

const markSchema = z.object({ questionId: z.string().uuid(), marked: z.boolean() });
apiRouter.post(
  "/sessions/:id/mark",
  asyncHandler(async (req, res) => {
    const body = validate(markSchema, req.body);
    await sessionService.mark(req.params.id, body.questionId, body.marked);
    res.json({ ok: true });
  })
);

const submitSchema = z.object({
  finalQuestionId: z.string().uuid().nullable(),
  finalElapsedMs: z.number().nonnegative(),
});
apiRouter.post(
  "/sessions/:id/submit",
  asyncHandler(async (req, res) => {
    const body = validate(submitSchema, req.body);
    const result = await sessionService.submitSession(req.params.id, body);
    res.json(result);
  })
);

apiRouter.get(
  "/sessions/:id/report",
  asyncHandler(async (req, res) => {
    const result = await sessionService.getReport(req.params.id);
    res.json(result);
  })
);

const coachSchema = z.object({ promptKey: z.enum(["analyze", "time", "skip", "drop"]) });
apiRouter.post(
  "/sessions/:id/coach",
  asyncHandler(async (req, res) => {
    const body = validate(coachSchema, req.body);
    const result = await sessionService.coach(req.params.id, body.promptKey);
    res.json(result);
  })
);

apiRouter.post(
  "/sessions/:id/drill",
  asyncHandler(async (req, res) => {
    const result = await sessionService.startDrillSession(req.params.id);
    res.status(201).json(result);
  })
);

apiRouter.get(
  "/sessions/:id/improvement",
  asyncHandler(async (req, res) => {
    const result = await sessionService.getImprovement(req.params.id);
    res.json(result);
  })
);

apiRouter.get(
  "/mock-history",
  asyncHandler(async (req, res) => {
    const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    const result = await sessionService.listMockHistory(studentId);
    res.json({ history: result });
  })
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
apiRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});
