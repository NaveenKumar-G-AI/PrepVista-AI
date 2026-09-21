const router = require('express').Router();
const db = require('../db');

// The demo preset seeds a plausible "already been practicing for a while"
// state for the successive-percentage-change skill: concept strong,
// strategy moderate, transfer weak, speed strong — exactly the profile the
// master prompt's Section 52 demonstration walks through.
function applyPercentageDemoPreset(student) {
  const skillId = 'successive-percentage-change';
  student.journey.currentObjectiveSkill = skillId;
  student.skillStates[skillId] = {
    skillId,
    concept: 0.75,
    strategy: 0.45,
    transfer: 0.25,
    speed: 0.7,
    misconceptions: {},
    attempts: ['seed-1', 'seed-2', 'seed-3', 'seed-4'],
    lastSeenAt: Date.now() - 1000 * 60 * 60,
    lastCorrectAt: Date.now() - 1000 * 60 * 60,
    masteredAt: null,
    lastRetentionCheckAt: null,
  };
  student._presetApplied = 'percentage-demo';
}

router.post('/', (req, res) => {
  const { studentId, name, preset } = req.body || {};
  const id = studentId || `student-${Date.now()}`;
  const student = db.getStudentOrCreate(id, name);

  if (preset === 'percentage-demo' && student._presetApplied !== 'percentage-demo') {
    applyPercentageDemoPreset(student);
    db.upsertStudent(student);
  }

  res.json({ student });
});

router.get('/:id', (req, res) => {
  const student = db.getStudent(req.params.id);
  if (!student) return res.status(404).json({ error: 'not_found' });
  res.json({ student });
});

module.exports = router;
