const router = require('express').Router();
const db = require('../db');

// This route intentionally returns the FULL internal student record,
// including misconception tags and arc state. It backs the "System
// Intelligence" panel, which the frontend clearly labels as a judge/demo
// view — Section 34 governs what's shown to the student in the ordinary
// question flow, not this endpoint.
router.get('/:id/state', (req, res) => {
  const student = db.getStudent(req.params.id);
  if (!student) return res.status(404).json({ error: 'not_found' });
  res.json({ student, attempts: db.listAttempts(req.params.id) });
});

router.post('/:id/mode', (req, res) => {
  const student = db.getStudent(req.params.id);
  if (!student) return res.status(404).json({ error: 'not_found' });
  const validModes = ['LEARNING', 'ASSESSMENT', 'EXAM', 'DIAGNOSTIC'];
  const mode = req.body?.mode;
  if (!validModes.includes(mode)) return res.status(400).json({ error: `mode must be one of ${validModes.join(', ')}` });
  student.mode = mode;
  db.upsertStudent(student);
  res.json({ student });
});

module.exports = router;
