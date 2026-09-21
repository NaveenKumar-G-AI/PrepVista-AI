const express = require('express');
const db = require('../db');
const { requireStudent } = require('../middleware/auth');
const {
  computeFunnel, computeWeeklyReview, computeHighValueGaps, computePortfolioBreakdown, computeTodayPriorities,
} = require('../services/insightsService');
const { findDueFollowUps } = require('../services/followUpEngine');
const { serializeOpportunitySummary } = require('../services/serializers');

const router = express.Router();
router.use(requireStudent);

function getData(studentId) {
  const applications = db.prepare('SELECT * FROM applications WHERE student_id = ?').all(studentId);
  const historyRows = db.prepare(`SELECT h.* FROM application_stage_history h
    JOIN applications a ON a.id = h.application_id WHERE a.student_id = ?`).all(studentId);
  const opportunities = db.prepare('SELECT * FROM opportunities WHERE student_id = ?').all(studentId);
  const analyses = opportunities
    .map((o) => db.prepare('SELECT * FROM opportunity_analysis WHERE opportunity_id = ? AND stale = 0 ORDER BY analyzed_at DESC LIMIT 1').get(o.id))
    .filter(Boolean);
  return { applications, historyRows, opportunities, analyses };
}

router.get('/funnel', (req, res) => {
  const { applications, historyRows } = getData(req.student.id);
  res.json(computeFunnel(applications, historyRows));
});

router.get('/weekly', (req, res) => {
  const { applications, historyRows } = getData(req.student.id);
  res.json(computeWeeklyReview({ applications, historyRows }));
});

router.get('/gaps', (req, res) => {
  const { analyses } = getData(req.student.id);
  res.json({ gaps: computeHighValueGaps(analyses) });
});

router.get('/portfolio', (req, res) => {
  const { analyses } = getData(req.student.id);
  res.json(computePortfolioBreakdown(analyses));
});

router.get('/today', (req, res) => {
  const { applications, opportunities, analyses } = getData(req.student.id);
  const opportunitiesById = new Map(opportunities.map((o) => [o.id, o]));

  const existingPending = db.prepare(`SELECT f.* FROM followups f JOIN applications a ON a.id = f.application_id
    WHERE a.student_id = ? AND f.status = 'PENDING'`).all(req.student.id);
  const existingByAppId = new Map(existingPending.map((f) => [f.application_id, f]));

  const dueFollowups = findDueFollowUps(applications, opportunitiesById, existingByAppId).map((f) => {
    const app = applications.find((a) => a.id === f.application_id);
    const opp = opportunitiesById.get(app.opportunity_id);
    return { ...f, role: opp.role, company: opp.company };
  });

  const highPriorityOpportunities = opportunities
    .filter((o) => o.status === 'NEW')
    .map((o) => ({ ...serializeOpportunitySummary(o), _raw_id: o.id }))
    .filter((o) => o.priority_recommendation === 'APPLY_NOW')
    .map((o) => ({ id: o.id, role: o.role, company: o.company }));

  const stuckApplications = applications.filter((a) => a.stage === 'PREPARING').map((a) => {
    const opp = opportunitiesById.get(a.opportunity_id);
    return { id: a.id, role: opp?.role, company: opp?.company };
  });

  const gaps = computeHighValueGaps(analyses);

  res.json({
    items: computeTodayPriorities({ dueFollowups, highPriorityOpportunities, stuckApplications, topGap: gaps[0] || null }),
  });
});

module.exports = router;
