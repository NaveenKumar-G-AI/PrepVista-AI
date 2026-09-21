import { Router } from 'express';
import { asyncRoute } from '../middleware.js';
import { getStudent, listSignals, addSignal, listDecisions, addDecision, upsertStudent } from '../db/store.js';
import { getTarget, listTargets } from '../data/careerTargets.js';
import { computeCapabilityTrend, computeOverallTrajectory, TREND, CONFIDENCE } from '../engine/trend.js';
import {
  computeCapabilityGaps,
  findLimitingFactor,
  detectActivityProgressMismatch,
  recommendIntervention,
  computeReadinessDistance,
  computeMomentum,
} from '../engine/recommend.js';
import {
  computeScenarioA_ContinuePath,
  computeScenarioB_FocusBottleneck,
  computeScenarioC_ChangeTarget,
  generatePlan,
} from '../engine/scenarios.js';
import { explainTopic } from '../services/aiNarrative.js';

export const router = Router();

function groupByCapability(signals) {
  const out = {};
  for (const s of signals) (out[s.capability] ||= []).push(s);
  return out;
}

/**
 * Shared aggregation used by every endpoint below: loads the student's
 * active target, evidence, and decisions, and computes the full
 * deterministic picture once. Kept in one place so every endpoint reasons
 * about exactly the same numbers (brief section 44 - single source of truth
 * for state, computed by code, not by an AI call).
 */
function buildCareerState(studentId) {
  const student = getStudent(studentId);
  if (!student) return null;
  const target = getTarget(student.activeTargetId);
  if (!target) return null;

  const signals = listSignals(studentId);
  const decisions = listDecisions(studentId);
  const byCapability = groupByCapability(signals);

  const gaps = computeCapabilityGaps(target, byCapability);
  const capabilityTrends = target.capabilities.map((req) => ({
    capability: req.capability,
    label: req.label,
    weight: req.weight,
    trend: computeCapabilityTrend(byCapability[req.capability] || [], req.targetLevel),
  }));
  const trendsByCapability = Object.fromEntries(capabilityTrends.map((c) => [c.capability, c.trend]));

  const overall = computeOverallTrajectory(capabilityTrends);
  const limitingFactor = findLimitingFactor(gaps, trendsByCapability);
  const mismatches = detectActivityProgressMismatch(byCapability, trendsByCapability);
  const readinessDistance = computeReadinessDistance(gaps);

  const cut21 = new Date();
  cut21.setDate(cut21.getDate() - 21);
  const recentSignalCount = signals.filter((s) => new Date(s.occurredAt) >= cut21).length;
  const recentCompletions = decisions.filter((d) => d.type === 'intervention_completed' && new Date(d.occurredAt) >= cut21).length;
  const momentum = computeMomentum({ recentSignalCount, capabilityTrends, recentCompletions });

  const overallLevel = gaps.length
    ? Math.round((gaps.reduce((a, g) => a + Math.min(g.currentLevel, g.targetLevel) / g.targetLevel, 0) / gaps.length) * 100)
    : 0;
  const currentStateLabel =
    signals.length === 0 ? 'NO_EVIDENCE' : overallLevel >= 85 ? 'READY' : overallLevel >= 60 ? 'DEVELOPING' : 'EMERGING';

  return {
    student,
    target,
    signals,
    decisions,
    byCapability,
    gaps,
    capabilityTrends,
    trendsByCapability,
    overall,
    limitingFactor,
    mismatches,
    readinessDistance,
    momentum,
    currentStateLabel,
    hasAnyEvidence: signals.length > 0,
  };
}

router.get(
  '/state',
  asyncRoute(async (req, res) => {
    const cs = buildCareerState(req.studentId);
    if (!cs) return res.status(404).json({ error: 'Student not found.' });

    const recentSignals = cs.signals.slice(-5).reverse();
    const whatChanged = recentSignals.map((s) => {
      const cap = cs.target.capabilities.find((c) => c.capability === s.capability);
      const label = cap ? cap.label : s.capability.replaceAll('_', ' ');
      const priorSameCapability = (cs.byCapability[s.capability] || [])
        .filter((x) => new Date(x.occurredAt) < new Date(s.occurredAt))
        .slice(-1)[0];
      const delta = priorSameCapability ? s.score - priorSameCapability.score : null;
      return { capability: s.capability, label, type: s.type, score: s.score, occurredAt: s.occurredAt, delta };
    });

    res.json({
      target: { id: cs.target.id, title: cs.target.title },
      hasAnyEvidence: cs.hasAnyEvidence,
      currentState: cs.currentStateLabel,
      trajectory: cs.overall.trajectory,
      trajectoryConfidence: cs.overall.confidence,
      trajectoryBasis: cs.overall.basis,
      trajectoryExcluded: cs.overall.excludedForInsufficientData || [],
      momentum: cs.momentum,
      readinessDistance: cs.readinessDistance,
      activityProgressMismatches: cs.mismatches,
      whatChanged,
      capabilities: cs.gaps.map((g) => ({
        ...g,
        trend: cs.trendsByCapability[g.capability]?.trend ?? TREND.INSUFFICIENT_DATA,
        confidence: cs.trendsByCapability[g.capability]?.confidence ?? CONFIDENCE.INSUFFICIENT_DATA,
      })),
    });
  })
);

router.get(
  '/limiting-factor',
  asyncRoute(async (req, res) => {
    const cs = buildCareerState(req.studentId);
    if (!cs) return res.status(404).json({ error: 'Student not found.' });
    res.json({ limitingFactor: cs.limitingFactor, mismatches: cs.mismatches });
  })
);

router.get(
  '/recommendation',
  asyncRoute(async (req, res) => {
    const cs = buildCareerState(req.studentId);
    if (!cs) return res.status(404).json({ error: 'Student not found.' });

    const completedIds = new Set(
      cs.decisions.filter((d) => d.type === 'intervention_completed').map((d) => d.payload?.interventionDecisionId)
    );
    const inProgress = [...cs.decisions].reverse().find((d) => d.type === 'intervention_started' && !completedIds.has(d.id));

    if (inProgress) return res.json({ recommendation: null, inProgress });

    const recommendation = recommendIntervention(cs.limitingFactor, cs.decisions);
    res.json({ recommendation, inProgress: null });
  })
);

router.get(
  '/plan',
  asyncRoute(async (req, res) => {
    const cs = buildCareerState(req.studentId);
    if (!cs) return res.status(404).json({ error: 'Student not found.' });
    if (!cs.hasAnyEvidence) return res.json({ insufficientEvidence: true });
    res.json(generatePlan(cs.target, cs.gaps, cs.limitingFactor));
  })
);

router.get(
  '/scenarios',
  asyncRoute(async (req, res) => {
    const cs = buildCareerState(req.studentId);
    if (!cs) return res.status(404).json({ error: 'Student not found.' });
    if (!cs.hasAnyEvidence) return res.json({ insufficientEvidence: true });

    const limitingTrendInfo = cs.limitingFactor ? cs.trendsByCapability[cs.limitingFactor.capability] : null;
    const otherTargets = listTargets().filter((t) => t.id !== cs.target.id);
    const altTargetId = req.query.altTarget || otherTargets[0]?.id;

    const scenarioA = computeScenarioA_ContinuePath(cs.limitingFactor, limitingTrendInfo);
    const scenarioB = computeScenarioB_FocusBottleneck(cs.limitingFactor, limitingTrendInfo);
    const scenarioC = altTargetId ? computeScenarioC_ChangeTarget(cs.target.id, altTargetId, cs.byCapability) : null;

    res.json({
      scenarios: [scenarioA, scenarioB, scenarioC].filter(Boolean),
      availableTargets: otherTargets,
      disclaimer: 'These are planning scenarios based on current evidence, not predictions or guarantees of any outcome.',
    });
  })
);

router.get(
  '/timeline',
  asyncRoute(async (req, res) => {
    const cs = buildCareerState(req.studentId);
    if (!cs) return res.status(404).json({ error: 'Student not found.' });
    const events = [
      ...cs.signals.map((s) => ({
        kind: 'evidence',
        occurredAt: s.occurredAt,
        capability: s.capability,
        label: cs.target.capabilities.find((c) => c.capability === s.capability)?.label ?? s.capability,
        type: s.type,
        score: s.score,
      })),
      ...cs.decisions.map((d) => ({ kind: 'decision', occurredAt: d.occurredAt, type: d.type, payload: d.payload })),
    ].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
    res.json({ events });
  })
);

router.get(
  '/targets',
  asyncRoute(async (req, res) => {
    res.json({ targets: listTargets() });
  })
);

router.post(
  '/target',
  asyncRoute(async (req, res) => {
    const { targetId } = req.body || {};
    const target = getTarget(targetId);
    if (!target) return res.status(400).json({ error: 'Unknown target.' });
    const student = getStudent(req.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    addDecision({
      studentId: req.studentId,
      type: 'target_changed',
      payload: { from: student.activeTargetId, to: targetId },
      occurredAt: new Date().toISOString(),
    });
    upsertStudent({ ...student, activeTargetId: targetId });
    res.json({ ok: true, activeTargetId: targetId });
  })
);

router.post(
  '/interventions',
  asyncRoute(async (req, res) => {
    const cs = buildCareerState(req.studentId);
    if (!cs) return res.status(404).json({ error: 'Student not found.' });

    const completedIds = new Set(
      cs.decisions.filter((d) => d.type === 'intervention_completed').map((d) => d.payload?.interventionDecisionId)
    );
    const alreadyInProgress = [...cs.decisions].reverse().find((d) => d.type === 'intervention_started' && !completedIds.has(d.id));
    if (alreadyInProgress) {
      return res.status(409).json({ error: 'An intervention is already in progress.', inProgress: alreadyInProgress });
    }

    const recommendation = recommendIntervention(cs.limitingFactor, cs.decisions);
    if (!recommendation) return res.status(400).json({ error: 'No recommendation currently available.' });

    const decision = addDecision({
      studentId: req.studentId,
      type: 'intervention_started',
      payload: { capability: recommendation.capability, title: recommendation.title },
      occurredAt: new Date().toISOString(),
    });
    res.json({ intervention: decision });
  })
);

router.post(
  '/interventions/:id/complete',
  asyncRoute(async (req, res) => {
    const { id: interventionDecisionId } = req.params;
    const { resultScore } = req.body || {};
    const decisions = listDecisions(req.studentId);
    const started = decisions.find((d) => d.id === interventionDecisionId && d.type === 'intervention_started');
    if (!started) return res.status(404).json({ error: 'Intervention not found.' });
    if (typeof resultScore !== 'number' || resultScore < 0 || resultScore > 100) {
      return res.status(400).json({ error: 'resultScore must be a number between 0 and 100.' });
    }

    const signal = addSignal({
      studentId: req.studentId,
      capability: started.payload.capability,
      type: 'practice',
      score: resultScore,
      occurredAt: new Date().toISOString(),
      note: `Result of: ${started.payload.title}`,
    });
    addDecision({
      studentId: req.studentId,
      type: 'intervention_completed',
      payload: { interventionDecisionId, capability: started.payload.capability, resultScore },
      occurredAt: new Date().toISOString(),
    });

    const cs = buildCareerState(req.studentId);
    res.json({ signal, updatedState: { trajectory: cs.overall.trajectory, currentState: cs.currentStateLabel } });
  })
);

router.get(
  '/explain',
  asyncRoute(async (req, res) => {
    const cs = buildCareerState(req.studentId);
    if (!cs) return res.status(404).json({ error: 'Student not found.' });
    const topic = req.query.topic || 'trajectory';
    const text = await explainTopic(topic, cs);
    res.json({ topic, text });
  })
);
