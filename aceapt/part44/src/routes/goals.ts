import { Router } from "express";
import { withStudentContext } from "../db/pool.js";
import { GoalService } from "../services/goalService.js";
import { AiExtractionService } from "../services/aiExtractionService.js";
import { ExplanationService } from "../services/explanationService.js";
import { milestoneRepository } from "../repositories/milestoneRepository.js";
import { historyRepository } from "../repositories/historyRepository.js";
import { snapshotRepository } from "../repositories/snapshotRepository.js";
import { buildLearningHandoff, buildPlannerHandoff, buildReadinessHandoff } from "../services/handoffService.js";
import type { AnalyticsSink } from "../analytics/events.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { createGoalSchema, extractGoalSchema, updateGoalSchema } from "./validation.js";
import { NotFoundError } from "../services/goalService.js";

export function buildGoalsRouter(
  goalService: GoalService,
  aiExtraction: AiExtractionService,
  explanation: ExplanationService,
  analytics: AnalyticsSink
): Router {
  const router = Router();

  // Section 13-15: draft extraction, never persisted, always confirmed.
  router.post(
    "/goals/extract",
    asyncRoute(async (req, res) => {
      const body = extractGoalSchema.parse(req.body);
      const draft = await aiExtraction.extract(body.text);
      res.json(draft);
    })
  );

  router.post(
    "/goals",
    asyncRoute(async (req, res) => {
      const input = createGoalSchema.parse(req.body);
      const view = await withStudentContext(req.studentId!, (client) =>
        goalService.createGoal(client, req.studentId!, input)
      );
      res.status(201).json(view);
    })
  );

  router.get(
    "/goals",
    asyncRoute(async (req, res) => {
      const statusParam = req.query.status;
      const statuses = statusParam
        ? (Array.isArray(statusParam) ? statusParam : [statusParam]).map(String)
        : undefined;
      const goals = await withStudentContext(req.studentId!, (client) =>
        goalService.listGoals(client, statuses as any)
      );
      res.json({ goals });
    })
  );

  router.get(
    "/goals/:id",
    asyncRoute(async (req, res) => {
      const view = await withStudentContext(req.studentId!, (client) => goalService.getGoal(client, req.params.id!));
      if (!view) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      analytics.track("goal_viewed", req.studentId!, { goalId: req.params.id });
      res.json(view);
    })
  );

  router.patch(
    "/goals/:id",
    asyncRoute(async (req, res) => {
      const patch = updateGoalSchema.parse(req.body);
      const goalId = req.params.id!;

      const targetFieldsChanged = Boolean(
        patch.explicitTargetCapability || patch.explicitTargetAccuracy !== undefined || patch.explicitTargetSpeedBand
      );

      await withStudentContext(req.studentId!, async (client) => {
        const existing = await goalService.getGoal(client, goalId);
        if (!existing) throw new NotFoundError("goal not found");

        if (patch.title !== undefined) await client.query("UPDATE goals SET title = $1 WHERE id = $2", [patch.title, goalId]);
        if (patch.description !== undefined)
          await client.query("UPDATE goals SET description = $1 WHERE id = $2", [patch.description, goalId]);
        if (patch.availableTime !== undefined)
          await client.query("UPDATE goals SET available_time = $1::jsonb WHERE id = $2", [
            JSON.stringify(patch.availableTime),
            goalId,
          ]);
        if (targetFieldsChanged) {
          const merged = { ...existing.goal.targetCapability, ...(patch.explicitTargetCapability ?? {}) };
          await client.query(
            `UPDATE goals SET target_capability = $1::jsonb,
              target_accuracy = COALESCE($2, target_accuracy),
              target_speed_band = COALESCE($3, target_speed_band)
             WHERE id = $4`,
            [JSON.stringify(merged), patch.explicitTargetAccuracy ?? null, patch.explicitTargetSpeedBand ?? null, goalId]
          );
          await historyRepository.record(client, goalId, "TARGET_CHANGED", { patch });
        }
        await historyRepository.record(client, goalId, "UPDATED", { fields: Object.keys(patch) });
      });

      analytics.track("goal_updated", req.studentId!, { goalId });

      // Only a target change needs the full engine recompute - a title
      // edit doesn't change the gap/priority/health.
      const updated = await withStudentContext(req.studentId!, (client) =>
        targetFieldsChanged ? goalService.recalculate(client, goalId) : goalService.getGoal(client, goalId)
      );
      res.json(updated);
    })
  );

  router.post(
    "/goals/:id/recalculate",
    asyncRoute(async (req, res) => {
      analytics.track("goal_action_started", req.studentId!, { goalId: req.params.id, action: "recalculate" });
      const view = await withStudentContext(req.studentId!, (client) =>
        goalService.recalculate(client, req.params.id!)
      );
      res.json(view);
    })
  );

  router.post(
    "/goals/:id/pause",
    asyncRoute(async (req, res) => {
      const goal = await withStudentContext(req.studentId!, (client) => goalService.pause(client, req.params.id!));
      res.json({ goal });
    })
  );

  router.post(
    "/goals/:id/resume",
    asyncRoute(async (req, res) => {
      const view = await withStudentContext(req.studentId!, (client) => goalService.resume(client, req.params.id!));
      res.json(view);
    })
  );

  router.post(
    "/goals/:id/complete",
    asyncRoute(async (req, res) => {
      const result = await withStudentContext(req.studentId!, (client) =>
        goalService.markStudentComplete(client, req.params.id!)
      );
      res.json(result);
    })
  );

  router.get(
    "/goals/:id/progress",
    asyncRoute(async (req, res) => {
      analytics.track("goal_progress_viewed", req.studentId!, { goalId: req.params.id });
      const view = await withStudentContext(req.studentId!, (client) => goalService.getGoal(client, req.params.id!));
      if (!view) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ progress: view.goal.progress, gap: view.goal.gapSnapshot });
    })
  );

  router.get(
    "/goals/:id/health",
    asyncRoute(async (req, res) => {
      const view = await withStudentContext(req.studentId!, (client) => goalService.getGoal(client, req.params.id!));
      if (!view) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ health: view.goal.health, reason: view.goal.healthReason, feasibility: view.goal.feasibility, confidence: view.goal.confidence });
    })
  );

  router.get(
    "/goals/:id/milestones",
    asyncRoute(async (req, res) => {
      const milestones = await withStudentContext(req.studentId!, (client) =>
        milestoneRepository.listForGoal(client, req.params.id!)
      );
      res.json({ milestones });
    })
  );

  router.get(
    "/goals/:id/history",
    asyncRoute(async (req, res) => {
      analytics.track("goal_history_viewed", req.studentId!, { goalId: req.params.id });
      const events = await withStudentContext(req.studentId!, (client) =>
        historyRepository.listForGoal(client, req.params.id!)
      );
      res.json({ events });
    })
  );

  router.get(
    "/goals/:id/snapshots",
    asyncRoute(async (req, res) => {
      const snapshots = await withStudentContext(req.studentId!, (client) =>
        snapshotRepository.listForGoal(client, req.params.id!)
      );
      res.json({ snapshots });
    })
  );

  // Section 36: goal explanations. Deterministic reason always ships;
  // AI only polishes the wording when available (Section 49-50).
  router.get(
    "/goals/:id/explanation",
    asyncRoute(async (req, res) => {
      const view = await withStudentContext(req.studentId!, (client) => goalService.getGoal(client, req.params.id!));
      if (!view) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const topReasonRaw = (view.goal.prioritySnapshot as any[])[0]?.reason ?? view.goal.healthReason ?? "Not enough data yet.";
      const result = await explanation.explain(topReasonRaw);
      res.json({ explanation: result.text, source: result.source, deterministicReason: topReasonRaw });
    })
  );

  router.get(
    "/goals/:id/handoff/learning",
    asyncRoute(async (req, res) => {
      const view = await withStudentContext(req.studentId!, (client) => goalService.getGoal(client, req.params.id!));
      if (!view) return void res.status(404).json({ error: "not_found" });
      const priority = { ranked: view.goal.prioritySnapshot as any[], top: (view.goal.prioritySnapshot as any[])[0]?.target ?? null, timeUrgency: 0 };
      const reason = priority.ranked[0]?.reason ?? "";
      res.json(buildLearningHandoff(view.goal, priority as any, reason));
    })
  );

  router.get(
    "/goals/:id/handoff/planner",
    asyncRoute(async (req, res) => {
      const view = await withStudentContext(req.studentId!, (client) => goalService.getGoal(client, req.params.id!));
      if (!view) return void res.status(404).json({ error: "not_found" });
      const priority = { ranked: view.goal.prioritySnapshot as any[], top: (view.goal.prioritySnapshot as any[])[0]?.target ?? null, timeUrgency: 0 };
      res.json(buildPlannerHandoff(view.goal, priority as any, view.milestones));
    })
  );

  router.get(
    "/goals/:id/handoff/readiness",
    asyncRoute(async (req, res) => {
      const view = await withStudentContext(req.studentId!, (client) => goalService.getGoal(client, req.params.id!));
      if (!view) return void res.status(404).json({ error: "not_found" });
      const snapshots = await withStudentContext(req.studentId!, (client) => snapshotRepository.listForGoal(client, req.params.id!));
      const trend = deriveTrend(snapshots.map((s) => s.progress));
      res.json(buildReadinessHandoff(view.goal, trend));
    })
  );

  return router;
}

function deriveTrend(progressHistory: number[]): "IMPROVING" | "FLAT" | "DECLINING" | "UNKNOWN" {
  if (progressHistory.length < 2) return "UNKNOWN";
  const delta = progressHistory[progressHistory.length - 1]! - progressHistory[progressHistory.length - 2]!;
  if (delta > 2) return "IMPROVING";
  if (delta < -2) return "DECLINING";
  return "FLAT";
}
