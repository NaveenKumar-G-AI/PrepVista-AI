const db = require('../db');
const { DEMO_STUDENT_ID } = require('../constants');

// STUB AUTH. Reads x-student-id header, defaults to the seeded demo student
// so the API works out of the box. This is intentionally NOT real
// authentication -- before any real deployment, replace this with actual
// session/JWT auth and remove the default fallback. See README "Security & auth".
function requireStudent(req, res, next) {
  const studentId = req.header('x-student-id') || DEMO_STUDENT_ID;
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(401).json({ error: 'Unknown student. Run `npm run seed` or pass a valid x-student-id header.' });
  }
  req.student = student;
  next();
}

// Ownership check helper -- every route that loads a row by id should also
// verify student_id matches req.student.id before returning or mutating it,
// so one student's data can never be read or edited via another's session.
function assertOwnership(row, req, res) {
  if (!row || row.student_id !== req.student.id) {
    res.status(404).json({ error: 'Not found.' });
    return false;
  }
  return true;
}

module.exports = { requireStudent, assertOwnership };
