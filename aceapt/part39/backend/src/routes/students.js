const express = require('express');
const db = require('../db');
const { fromJSON, toJSON } = require('../utils');
const { requireStudent } = require('../middleware/auth');

const router = express.Router();
router.use(requireStudent);

router.get('/me', (req, res) => {
  const student = req.student;
  const evidence = db.prepare('SELECT * FROM evidence WHERE student_id = ? ORDER BY skill').all(student.id);
  const projects = db.prepare('SELECT * FROM projects WHERE student_id = ? ORDER BY recency_date DESC').all(student.id)
    .map((p) => ({ ...p, skills_json: fromJSON(p.skills_json, []) }));
  const positioning = db.prepare('SELECT * FROM positioning_profiles WHERE student_id = ? AND is_active = 1 ORDER BY created_at DESC').get(student.id);
  const resumes = db.prepare('SELECT * FROM resumes WHERE student_id = ? ORDER BY is_master DESC').all(student.id)
    .map((r) => ({ ...r, emphasis_tags_json: fromJSON(r.emphasis_tags_json, []) }));

  res.json({
    student: { ...student, constraints_json: fromJSON(student.constraints_json, {}) },
    evidence,
    projects,
    positioning: positioning ? { ...positioning, differentiators_json: fromJSON(positioning.differentiators_json, []) } : null,
    resumes,
  });
});

router.patch('/me', (req, res) => {
  const { target_role, career_direction, education_level, constraints } = req.body;
  const setClauses = [];
  const params = { id: req.student.id };
  if (target_role !== undefined) { setClauses.push('target_role = @target_role'); params.target_role = target_role; }
  if (career_direction !== undefined) { setClauses.push('career_direction = @career_direction'); params.career_direction = career_direction; }
  if (education_level !== undefined) { setClauses.push('education_level = @education_level'); params.education_level = education_level; }
  if (constraints !== undefined) { setClauses.push('constraints_json = @constraints_json'); params.constraints_json = toJSON(constraints); }
  if (setClauses.length === 0) return res.status(400).json({ error: 'No updatable fields provided.' });

  db.prepare(`UPDATE students SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
  res.json(db.prepare('SELECT * FROM students WHERE id = ?').get(req.student.id));
});

module.exports = router;
