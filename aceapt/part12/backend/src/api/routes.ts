import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { repository } from '../data/inMemoryStore';
import { detectLearningProblems } from '../engine/problemDetection';
import { decideAllInterventions } from '../engine/decision';
import { startExecution, completeExecution, abandonExecution } from '../engine/execution';
import { computeImmediateOutcome, applyRetentionCheck, applyTransferCheck } from '../engine/outcome';
import { recordAttempt, recordRetentionCheck } from '../engine/profile';
import { refineExplanation } from '../engine/explanation';
import { isColdStart } from '../engine/coldStart';
import { eventBus } from '../events/eventBus';
import { feature7Stub, feature10Stub } from '../integrations/stubs';

export const router = Router();

// --- prototype-only auth guard ----------------------------------------------
// The bearer token IS the student id. This exists so the demo can show
// "students can't read each other's data" (Section 67) without building a
// real identity system. Replace with real auth (session/JWT/OAuth tied to
// the actual PrepVista user store) before this touches real student data.
function requireOwnStudent(req: Request, res: Response, next: NextFunction) {
  const token = (req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  if (token !== req.params.studentId) {
    return res.status(403).json({ error: "Cannot access another student's data" });
  }
  next();
}
router.use('/students/:studentId', requireOwnStudent);

// GET /students/:id/next-intervention -----------------------------------------
router.get('/students/:studentId/next-intervention', async (req, res) => {
  const state = repository.getStudentState(req.params.studentId);
  if (!state) return res.status(404).json({ error: 'Student not found' });

  const problems = detectLearningProblems(state);
  const profile = repository.getProfile(state.studentId);
  const decisions = decideAllInterventions(problems, state, profile);

  if (decisions.length === 0) {
    return res.json({ decision: null, message: 'No intervention-worthy problem detected from current evidence.' });
  }

  const top = decisions[0];
  repository.saveDecision(top);
  eventBus.emit('INTERVENTION_CREATED', state.studentId, { decisionId: top.id, problem: top.problem.category });
  eventBus.emit('INTERVENTION_SELECTED', state.studentId, { decisionId: top.id, type: top.selected.type });

  const explanation = await refineExplanation(top);

  res.json({
    decision: top,
    explanation,
    coldStart: isColdStart(state),
    alternativeDecisions: decisions.slice(1)
  });
});

// POST /students/:id/interventions/:decisionId/start --------------------------
router.post('/students/:studentId/interventions/:decisionId/start', (req, res) => {
  const decision = repository.getDecision(req.params.decisionId);
  if (!decision || decision.studentId !== req.params.studentId) {
    return res.status(404).json({ error: 'Decision not found' });
  }
  const execution = startExecution(decision);
  repository.saveExecution(execution);
  eventBus.emit('INTERVENTION_STARTED', decision.studentId, { executionId: execution.id, type: execution.type });
  res.json({ execution });
});

// POST /students/:id/interventions/:executionId/complete ----------------------
const completeSchema = z.object({
  accuracyPct: z.number().min(0).max(100),
  questionsCompleted: z.number().int().min(0),
  avgTimePerQuestionSec: z.number().min(0).optional(),
  hintsUsed: z.number().int().min(0).optional(),
  retries: z.number().int().min(0).optional()
});

router.post('/students/:studentId/interventions/:executionId/complete', (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const execution = repository.getExecution(req.params.executionId);
  if (!execution || execution.studentId !== req.params.studentId) {
    return res.status(404).json({ error: 'Execution not found' });
  }
  const decision = repository.getDecision(execution.decisionId);

  const completed = completeExecution(execution, parsed.data);
  repository.saveExecution(completed);
  eventBus.emit('INTERVENTION_COMPLETED', execution.studentId, { executionId: execution.id });

  // Traceable to the same evidence that triggered the decision, not a
  // freshly-recomputed topic average (see engine/outcome.ts docstring).
  const before = decision?.problem.baselineAccuracyPct ?? null;
  const outcome = computeImmediateOutcome(completed, before);
  repository.saveOutcome(outcome);
  eventBus.emit('INTERVENTION_OUTCOME_UPDATED', execution.studentId, { interventionId: outcome.interventionId });

  const priorProfile = repository.getProfile(execution.studentId);
  const priorEntry = priorProfile?.entries.find(e => e.type === execution.type) ?? null;

  const history = repository.listOutcomesForStudentAndType(execution.studentId, execution.type);
  const profile = recordAttempt(priorProfile, execution.studentId, execution.type, outcome, history);
  repository.saveProfile(profile);
  eventBus.emit('INTERVENTION_PROFILE_UPDATED', execution.studentId, { type: execution.type });

  repository.appendInterventionHistory(execution.studentId, {
    interventionId: execution.id,
    type: execution.type,
    topic: decision?.problem.topic ?? 'unknown',
    completedAt: completed.completedAt,
    effectiveness: outcome.immediateEffectiveness
  });

  const refreshedState = repository.getStudentState(execution.studentId)!;
  const readiness = feature10Stub.recalculateReadiness(refreshedState);
  if (readiness !== 'unavailable') repository.updateReadiness(execution.studentId, readiness);
  feature7Stub.notifyInterventionOutcome(execution.studentId, `${execution.type} -> ${outcome.immediateEffectiveness}`);

  const thisDeltaPct =
    outcome.beforeAccuracyPct !== undefined && outcome.immediateAccuracyPct !== undefined
      ? Math.round((outcome.immediateAccuracyPct - outcome.beforeAccuracyPct) * 10) / 10
      : null;
  const comparison =
    priorEntry && priorEntry.avgImmediateDeltaPct !== null && thisDeltaPct !== null
      ? {
          previousAvgImmediateDeltaPct: priorEntry.avgImmediateDeltaPct,
          thisAttemptDeltaPct: thisDeltaPct,
          betterThanAverage: thisDeltaPct > priorEntry.avgImmediateDeltaPct
        }
      : null;

  res.json({ execution: completed, outcome, profile, readiness, comparison });
});

// POST /students/:id/interventions/:executionId/abandon ------------------------
router.post('/students/:studentId/interventions/:executionId/abandon', (req, res) => {
  const execution = repository.getExecution(req.params.executionId);
  if (!execution || execution.studentId !== req.params.studentId) {
    return res.status(404).json({ error: 'Execution not found' });
  }
  const abandoned = abandonExecution(execution);
  repository.saveExecution(abandoned);
  eventBus.emit('INTERVENTION_ABANDONED', execution.studentId, { executionId: execution.id });
  res.json({ execution: abandoned });
});

// POST /students/:id/interventions/:executionId/retention-check ---------------
const retentionSchema = z.object({ accuracyPct: z.number().min(0).max(100), daysAfter: z.number().min(0) });

router.post('/students/:studentId/interventions/:executionId/retention-check', (req, res) => {
  const parsed = retentionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const execution = repository.getExecution(req.params.executionId);
  const outcome = execution ? repository.getOutcome(execution.id) : null;
  if (!execution || !outcome || execution.studentId !== req.params.studentId) {
    return res.status(404).json({ error: 'Execution or outcome not found' });
  }

  eventBus.emit('RETENTION_CHECK_STARTED', execution.studentId, { executionId: execution.id });
  const updated = applyRetentionCheck(outcome, {
    topic: execution.contract.topic,
    daysAfter: parsed.data.daysAfter,
    accuracyPct: parsed.data.accuracyPct,
    measuredAt: new Date().toISOString()
  });
  repository.saveOutcome(updated);

  // Enriches the existing profile entry's retention average — does NOT
  // count as another attempt (see engine/profile.ts).
  const priorProfile = repository.getProfile(execution.studentId);
  const profile = recordRetentionCheck(priorProfile, execution.studentId, execution.type, updated);
  repository.saveProfile(profile);

  eventBus.emit('RETENTION_CHECK_COMPLETED', execution.studentId, { executionId: execution.id });
  res.json({ outcome: updated, profile });
});

// POST /students/:id/interventions/:executionId/transfer-check ----------------
const transferSchema = z.object({
  familiarAccuracyPct: z.number().min(0).max(100),
  novelAccuracyPct: z.number().min(0).max(100)
});

router.post('/students/:studentId/interventions/:executionId/transfer-check', (req, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const execution = repository.getExecution(req.params.executionId);
  const outcome = execution ? repository.getOutcome(execution.id) : null;
  if (!execution || !outcome || execution.studentId !== req.params.studentId) {
    return res.status(404).json({ error: 'Execution or outcome not found' });
  }

  eventBus.emit('TRANSFER_CHECK_STARTED', execution.studentId, { executionId: execution.id });
  const updated = applyTransferCheck(outcome, {
    topic: execution.contract.topic,
    familiarAccuracyPct: parsed.data.familiarAccuracyPct,
    novelAccuracyPct: parsed.data.novelAccuracyPct,
    measuredAt: new Date().toISOString()
  });
  repository.saveOutcome(updated);
  eventBus.emit('TRANSFER_CHECK_COMPLETED', execution.studentId, { executionId: execution.id });
  res.json({ outcome: updated });
});

// GET /students/:id/intervention-history ---------------------------------------
router.get('/students/:studentId/intervention-history', (req, res) => {
  const executions = repository.listExecutionsForStudent(req.params.studentId);
  const history = executions.map(e => ({ execution: e, outcome: repository.getOutcome(e.id) }));
  res.json({ history });
});

// GET /students/:id/intervention-profile ---------------------------------------
router.get('/students/:studentId/intervention-profile', (req, res) => {
  res.json({ profile: repository.getProfile(req.params.studentId) });
});

// GET /students/:id/state — debugging/admin visibility only (Section 64),
// not intended to be called from the student-facing UI.
router.get('/students/:studentId/state', (req, res) => {
  res.json({ state: repository.getStudentState(req.params.studentId) });
});

// GET /students/:id/events — debugging/admin visibility only (Section 64).
router.get('/students/:studentId/events', (req, res) => {
  res.json({ events: eventBus.history(req.params.studentId) });
});
