const express = require('express');
const db = require('../db');
const { id, toJSON } = require('../utils');
const { requireStudent } = require('../middleware/auth');
const { findDueFollowUps } = require('../services/followUpEngine');
const { serializeOpportunitySummary } = require('../services/serializers');

const router = express.Router();
router.use(requireStudent);

function logEvent(studentId, eventType, payload) {
  db.prepare('INSERT INTO events (id, student_id, event_type, payload_json) VALUES (?,?,?,?)').run(id('evt'), studentId, eventType, toJSON(payload || {}));
}

router.get('/', (req, res) => {
  let rows = db.prepare(`SELECT f.* FROM followups f JOIN applications a ON a.id = f.application_id
    WHERE a.student_id = ? ORDER BY f.created_at DESC`).all(req.student.id);
  if (req.query.status) rows = rows.filter((f) => f.status === req.query.status);

  const withContext = rows.map((f) => {
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(f.application_id);
    const opportunity = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(application.opportunity_id);
    return { ...f, opportunity: serializeOpportunitySummary(opportunity), application_stage: application.stage };
  });

  res.json({ followups: withContext });
});

// Scans every open application and inserts any newly-due follow-ups. Safe to
// call repeatedly -- skips applications that already have a pending one.
router.post('/generate', (req, res) => {
  const applications = db.prepare('SELECT * FROM applications WHERE student_id = ?').all(req.student.id);
  const opportunitiesById = new Map(db.prepare('SELECT * FROM opportunities WHERE student_id = ?').all(req.student.id).map((o) => [o.id, o]));
  const existingPending = db.prepare(`SELECT f.* FROM followups f JOIN applications a ON a.id = f.application_id
    WHERE a.student_id = ? AND f.status = 'PENDING'`).all(req.student.id);
  const existingByAppId = new Map(existingPending.map((f) => [f.application_id, f]));

  const due = findDueFollowUps(applications, opportunitiesById, existingByAppId);
  const insert = db.prepare('INSERT INTO followups (id, application_id, due_date, reason, channel, message_draft) VALUES (?,?,?,?,?,?)');
  for (const f of due) {
    insert.run(id('followup'), f.application_id, f.due_date, f.reason, f.channel, f.message_draft);
    logEvent(req.student.id, 'followup_due', { application_id: f.application_id });
  }

  res.json({ created_count: due.length });
});

router.post('/:id/mark-sent', (req, res) => {
  const followup = db.prepare(`SELECT f.* FROM followups f JOIN applications a ON a.id = f.application_id WHERE f.id = ? AND a.student_id = ?`)
    .get(req.params.id, req.student.id);
  if (!followup) return res.status(404).json({ error: 'Not found.' });
  db.prepare("UPDATE followups SET status = 'SENT' WHERE id = ?").run(followup.id);
  logEvent(req.student.id, 'followup_sent', { followup_id: followup.id });
  res.json({ id: followup.id, status: 'SENT' });
});

router.post('/:id/dismiss', (req, res) => {
  const followup = db.prepare(`SELECT f.* FROM followups f JOIN applications a ON a.id = f.application_id WHERE f.id = ? AND a.student_id = ?`)
    .get(req.params.id, req.student.id);
  if (!followup) return res.status(404).json({ error: 'Not found.' });
  db.prepare("UPDATE followups SET status = 'DISMISSED' WHERE id = ?").run(followup.id);
  res.json({ id: followup.id, status: 'DISMISSED' });
});

module.exports = router;
