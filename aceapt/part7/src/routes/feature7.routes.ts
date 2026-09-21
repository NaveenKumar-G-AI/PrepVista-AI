import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ActionRepo, GoalRepo, StudentRepo } from '../db/repositories';
import { NextBestActionService, ActionPlanService } from '../services/actionOrchestration';
import { ActionExecutionService, InterventionEffectivenessService } from '../services/actionExecution';
import { ReadinessGapService, ProgressStoryService } from '../services/readinessAndProgress';
import { MilestoneService, GoalService } from '../services/goalsAndMilestones';
import { RegressionDetectionService, ProblemDetectionService, PriorityEngine } from '../services/problemAndPriority';
import { Feature6Client } from '../services/integrations/Feature6Client';
import { GoalType } from '../types';

export const router = Router();

// §30/§32 note: everything below is scoped to a single student, reached by
// the student themself or by Feature 7's own orchestration — there is no
// cross-student or recruiter-facing surface here, by design (§32 STUDENT ↔
// TPO BOUNDARY: "Recruiters are not part of Feature 7").

// ---- §8 STUDENT ACTION CENTER ----------------------------------------------
router.get(
  '/students/:id/summary',
  asyncHandler(async (req, res) => {
    const student = StudentRepo.getById(req.params.id);
    const readiness = ReadinessGapService.currentReadiness(req.params.id);
    const goal = GoalService.active(req.params.id)[0];
    res.json({ id: req.params.id, name: student?.name ?? 'Student', readiness, goal: goal ?? null });
  })
);

router.get(
  '/students/:id/next-best-action',
  asyncHandler(async (req, res) => {
    const action = await NextBestActionService.recommend(req.params.id);
    if (!action) return res.json({ action: null, message: 'No outstanding priorities right now — evidence looks stable.' });
    res.json({ action });
  })
);

router.get(
  '/students/:id/priorities',
  asyncHandler(async (req, res) => {
    res.json(await NextBestActionService.board(req.params.id));
  })
);

// ---- §9 / §10 time-aware daily plan ----------------------------------------
router.get(
  '/students/:id/action-plan',
  asyncHandler(async (req, res) => {
    const minutes = parseInt((req.query.minutes as string) || '30', 10);
    const plan = await ActionPlanService.buildPlan(req.params.id, minutes);
    res.json({ minutes_available: minutes, plan });
  })
);

// ---- §24 action lifecycle ---------------------------------------------------
router.post(
  '/actions/:id/start',
  asyncHandler(async (req, res) => {
    const action = await ActionExecutionService.start(req.params.id);
    res.json({ action });
  })
);

router.post(
  '/actions/:id/skip',
  asyncHandler(async (req, res) => {
    const action = ActionExecutionService.skip(req.params.id, req.body?.reason);
    res.json({ action });
  })
);

router.post(
  '/actions/:id/complete',
  asyncHandler(async (req, res) => {
    const { before_metrics, after_metrics } = req.body || {};
    const outcome = await ActionExecutionService.complete(req.params.id, before_metrics || {}, after_metrics || {});
    res.json({ outcome });
  })
);

router.get(
  '/students/:id/actions',
  asyncHandler(async (req, res) => {
    res.json({ actions: ActionRepo.find((a) => a.student_id === req.params.id) });
  })
);

// ---- §20 / §21 readiness gap ------------------------------------------------
router.get(
  '/students/:id/readiness-gap',
  asyncHandler(async (req, res) => {
    const evidence = await Feature6Client.getLatestEvidence(req.params.id);
    const signals = PriorityEngine.score(ProblemDetectionService.detect(evidence));
    const activeGoal = GoalRepo.findOne(
      (g) => g.student_id === req.params.id && g.status === 'ACTIVE' && g.goal_type === GoalType.REACH_READINESS_THRESHOLD
    );
    res.json(ReadinessGapService.compute(req.params.id, signals, activeGoal?.target ?? 80));
  })
);

// ---- §22 milestones ----------------------------------------------------------
router.get(
  '/students/:id/milestones',
  asyncHandler(async (req, res) => {
    res.json({ milestones: MilestoneService.list(req.params.id) });
  })
);

// ---- §27 / §28 progress story + before/after --------------------------------
router.get(
  '/students/:id/progress-story',
  asyncHandler(async (req, res) => {
    res.json({ story: ProgressStoryService.story(req.params.id) });
  })
);

router.get(
  '/students/:id/before-after',
  asyncHandler(async (req, res) => {
    res.json(ProgressStoryService.beforeAfter(req.params.id));
  })
);

// ---- §19 goals ----------------------------------------------------------------
router.get(
  '/students/:id/goals',
  asyncHandler(async (req, res) => {
    res.json({ goals: GoalService.list(req.params.id) });
  })
);

router.post(
  '/students/:id/goals',
  asyncHandler(async (req, res) => {
    const { goal_type, target, deadline } = req.body || {};
    res.json({ goal: GoalService.setGoal(req.params.id, goal_type, target, deadline) });
  })
);

// ---- §17 regression -------------------------------------------------------
router.get(
  '/students/:id/regressions',
  asyncHandler(async (req, res) => {
    res.json({ regressions: await RegressionDetectionService.detect(req.params.id) });
  })
);

// ---- §12 intervention effectiveness ----------------------------------------
router.get(
  '/students/:id/intervention-effectiveness',
  asyncHandler(async (req, res) => {
    res.json({ effectiveness: InterventionEffectivenessService.summaryFor(req.params.id) });
  })
);
