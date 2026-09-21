'use strict';

const express = require('express');
const { z } = require('zod');
const store = require('../db/memoryStore');
const opportunityService = require('../services/opportunityService');
const applicationService = require('../services/applicationService');
const outcomeService = require('../services/outcomeService');
const simulationService = require('../integrations/simulationService');
const { buildAIProvider } = require('../ai/aiProvider');

const router = express.Router();
const aiProvider = buildAIProvider();

const ingestSchema = z.object({
  title: z.string().min(1),
  organization: z.string().min(1),
  location: z.string().optional(),
  workMode: z.string().optional(),
  opportunityType: z.string().optional(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  preferredRequirements: z.string().optional(),
  eligibility: z.string().optional(),
  deadline: z.string().optional(),
  applicationMethod: z.string().optional(),
  source: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  targetId: z.string().optional(),
});

// POST /api/opportunities - manual entry / future-API ingestion point (spec section 6)
router.post('/', async (req, res, next) => {
  try {
    const input = ingestSchema.parse(req.body);
    const result = await opportunityService.ingestOpportunity(input, { aiProvider });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.get('/', (req, res) => {
  res.json(store.listOpportunities({ status: req.query.status }));
});

router.get('/:id', (req, res) => {
  const opportunity = store.getOpportunity(req.params.id);
  if (!opportunity) return res.status(404).json({ error: 'OPPORTUNITY_NOT_FOUND' });
  res.json({ opportunity, requirements: store.getRequirements(opportunity.id) });
});

const studentIdSchema = z.object({ studentId: z.string().min(1) });

// POST /api/opportunities/:id/analyze - eligibility + fit + gaps + recommendation (spec sections 9-19)
router.post('/:id/analyze', async (req, res, next) => {
  try {
    const { studentId } = studentIdSchema.parse(req.body);
    const result = await opportunityService.analyzeOpportunityForStudent(req.params.id, studentId, { aiProvider });
    if (result.error) return res.status(404).json(result);
    const brief = opportunityService.buildOpportunityBrief(req.params.id, studentId);
    res.json({ analysis: result.analysis, brief });
  } catch (err) { next(err); }
});

// GET the cached brief (spec section 78 - never recompute on every page load)
router.get('/:id/analysis/:studentId', (req, res) => {
  const brief = opportunityService.buildOpportunityBrief(req.params.id, req.params.studentId);
  if (!brief) return res.status(404).json({ error: 'ANALYSIS_NOT_FOUND', hint: 'POST /analyze first.' });
  res.json(brief);
});

router.post('/:id/action-plan', async (req, res, next) => {
  try {
    const { studentId } = studentIdSchema.parse(req.body);
    const plan = await opportunityService.planActionForStudent(req.params.id, studentId);
    if (!plan) return res.status(404).json({ error: 'ANALYSIS_NOT_FOUND', hint: 'POST /analyze first.' });
    res.json(plan);
  } catch (err) { next(err); }
});

router.post('/:id/action-plan/:studentId/items/:order/complete', (req, res) => {
  const order = parseInt(req.params.order, 10);
  const plan = store.updateActionPlanItem(req.params.id, req.params.studentId, order, { status: 'done' });
  if (!plan) return res.status(404).json({ error: 'ACTION_PLAN_NOT_FOUND' });
  res.json(plan);
});

// POST /api/opportunities/:id/simulate - Feature 31 integration seam (spec sections 37-39)
router.post('/:id/simulate', async (req, res, next) => {
  try {
    const { studentId } = studentIdSchema.parse(req.body);
    if (!simulationService.isAvailable()) {
      return res.status(503).json({
        available: false,
        message: "Opportunity-aligned simulation isn't connected yet in this build (Feature 31 integration seam - see src/integrations/simulationService.js).",
      });
    }
    const requirements = store.getRequirements(req.params.id);
    const result = await simulationService.runOpportunityAlignedSimulation({ studentId, opportunityId: req.params.id, requirements });
    res.json({ available: true, result });
  } catch (err) { next(err); }
});

const applicationSchema = z.object({ studentId: z.string().min(1), status: z.string().min(1) });
router.post('/:id/application', (req, res, next) => {
  try {
    const { studentId, status } = applicationSchema.parse(req.body);
    const result = applicationService.updateApplicationStatus(req.params.id, studentId, status);
    if (result.error) return res.status(409).json(result);
    res.json(result.application);
  } catch (err) { next(err); }
});

router.get('/:id/application/:studentId', (req, res) => {
  res.json(applicationService.getOrInitApplication(req.params.id, req.params.studentId));
});

const outcomeSchema = z.object({
  studentId: z.string().min(1),
  stageReached: z.string().min(1),
  outcome: z.string().min(1),
  skillTag: z.string().optional(),
  feedback: z.string().optional(),
});
router.post('/:id/outcome', async (req, res, next) => {
  try {
    const { studentId, ...rest } = outcomeSchema.parse(req.body);
    const result = await outcomeService.recordOutcome(studentId, { opportunityId: req.params.id, ...rest });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
