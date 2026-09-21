import { Router } from "express";
import { completeAction, skipAction, startAction } from "../engine/orchestrator";
import { asyncHandler } from "../middleware/errorHandler";
import { SubmittedAnswer } from "../types";

export const actionRouter = Router();

// POST /api/action/start  { candidateActionId }
actionRouter.post(
  "/start",
  asyncHandler(async (req, res) => {
    const { candidateActionId } = req.body ?? {};
    if (typeof candidateActionId !== "string") {
      res.status(400).json({ error: "candidateActionId is required" });
      return;
    }
    const result = startAction(req.studentId, candidateActionId);
    if (!result) {
      res.status(404).json({ error: "That action is no longer available - the plan may have changed. Fetch /next-action again." });
      return;
    }
    res.json(result);
  })
);

// POST /api/action/complete  { executionId, answers: [{ itemId, selectedIndex, responseTimeSeconds }] }
// Section 55: the client sends only raw answers - correctness and every
// resulting capability update are computed server-side, never trusted from
// the client.
actionRouter.post(
  "/complete",
  asyncHandler(async (req, res) => {
    const { executionId, answers } = req.body ?? {};
    if (typeof executionId !== "string" || !Array.isArray(answers)) {
      res.status(400).json({ error: "executionId and answers[] are required" });
      return;
    }
    const validAnswers: SubmittedAnswer[] = answers.filter(
      (a): a is SubmittedAnswer =>
        a &&
        typeof a.itemId === "string" &&
        typeof a.selectedIndex === "number" &&
        typeof a.responseTimeSeconds === "number"
    );
    const result = await completeAction(req.studentId, executionId, validAnswers);
    if (!result) {
      res.status(404).json({ error: "Unknown or already-completed execution." });
      return;
    }
    res.json(result);
  })
);

// POST /api/action/skip  { candidateActionId }
// Section 32: skipping is recorded as behavior, not failure - it never
// touches mastery/retention/transfer.
actionRouter.post(
  "/skip",
  asyncHandler(async (req, res) => {
    const { candidateActionId } = req.body ?? {};
    if (typeof candidateActionId !== "string") {
      res.status(400).json({ error: "candidateActionId is required" });
      return;
    }
    const result = await skipAction(req.studentId, candidateActionId);
    res.json(result);
  })
);
