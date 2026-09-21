'use strict';

const express = require('express');
const store = require('../db/memoryStore');
const opportunityService = require('../services/opportunityService');
const outcomeService = require('../services/outcomeService');
const { detectPatterns } = require('../engines/outcomeLearning');

const router = express.Router();

// GET /api/students/:id/opportunities - "My Opportunities" priority queue (spec sections 26-27)
router.get('/:id/opportunities', (req, res) => {
  res.json(opportunityService.priorityQueueForStudent(req.params.id));
});

// GET /api/students/:id/opportunity-history - Opportunity Journey (spec section 48)
router.get('/:id/opportunity-history', (req, res) => {
  res.json(outcomeService.getJourney(req.params.id));
});

// GET /api/students/:id/patterns - recurring bottleneck / strength detection (spec sections 44-51)
router.get('/:id/patterns', (req, res) => {
  res.json(detectPatterns(store.listOutcomesByStudent(req.params.id)));
});

router.get('/:id', (req, res) => {
  const student = store.getStudent(req.params.id);
  if (!student) return res.status(404).json({ error: 'STUDENT_NOT_FOUND' });
  res.json({ student, capabilities: store.listStudentCapabilities(req.params.id) });
});

module.exports = router;
