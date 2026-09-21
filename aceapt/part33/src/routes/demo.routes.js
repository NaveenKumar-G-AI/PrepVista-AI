'use strict';

const express = require('express');
const { seedDemoData, DEMO_STUDENT_ID } = require('../seed/demoData');
const opportunityService = require('../services/opportunityService');
const { buildAIProvider } = require('../ai/aiProvider');

const router = express.Router();
const aiProvider = buildAIProvider();

// POST /api/demo/seed - creates the demo student + opportunity (spec section 89 story)
router.post('/seed', async (req, res, next) => {
  try {
    const seeded = await seedDemoData({ aiProvider });
    res.status(201).json(seeded);
  } catch (err) { next(err); }
});

// POST /api/demo/run - seeds AND runs analyze + brief + action plan in one call, for a quick look
router.post('/run', async (req, res, next) => {
  try {
    const seeded = await seedDemoData({ aiProvider });
    const { opportunity } = seeded;
    const analyzed = await opportunityService.analyzeOpportunityForStudent(opportunity.id, DEMO_STUDENT_ID, { aiProvider });
    const brief = opportunityService.buildOpportunityBrief(opportunity.id, DEMO_STUDENT_ID);
    const plan = await opportunityService.planActionForStudent(opportunity.id, DEMO_STUDENT_ID);
    res.json({
      studentId: DEMO_STUDENT_ID, opportunity, brief, gaps: analyzed.analysis.gaps, plan,
    });
  } catch (err) { next(err); }
});

module.exports = router;
