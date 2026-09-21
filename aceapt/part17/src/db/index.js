const { load, save } = require('./store');

let db = load();

function persist() {
  save(db);
}

// -- Students -----------------------------------------------------------

function getStudent(id) {
  return db.students[id] || null;
}

function getStudentOrCreate(id, name) {
  if (!db.students[id]) {
    db.students[id] = {
      id,
      name: name || id,
      createdAt: Date.now(),
      mode: 'LEARNING', // LEARNING | ASSESSMENT | EXAM | DIAGNOSTIC
      skillStates: {},
      journey: { stage: 'BEGINNER', currentObjectiveSkill: null },
      readiness: { examConditionScore: 0.3, normalPracticeScore: 0.3, samples: 0 },
      activeArc: null,
      pendingDiagnostic: null,
      behaviorSignals: [],
    };
    persist();
  }
  return db.students[id];
}

function upsertStudent(student) {
  db.students[student.id] = student;
  persist();
}

// -- Exposure / anti-repetition -----------------------------------------

function getExposure(studentId, questionId) {
  return (db.exposures[studentId] || {})[questionId] || null;
}

function getExposures(studentId) {
  return db.exposures[studentId] || {};
}

function setExposure(studentId, questionId, exposure) {
  db.exposures[studentId] = db.exposures[studentId] || {};
  db.exposures[studentId][questionId] = exposure;
  persist();
}

// -- Attempts / evidence --------------------------------------------------

function recordAttempt(evidence) {
  db.attempts[evidence.studentId] = db.attempts[evidence.studentId] || [];
  db.attempts[evidence.studentId].push(evidence);
  persist();
}

function listAttempts(studentId) {
  return db.attempts[studentId] || [];
}

// -- Issued questions (server-side answer key, never sent to client) ----

function issueQuestion(studentId, question, servedPurpose) {
  db.sessions[studentId] = db.sessions[studentId] || {};
  db.sessions[studentId][question.id] = { question, servedPurpose, issuedAt: Date.now() };
  persist();
}

function getIssuedQuestion(studentId, questionId) {
  return (db.sessions[studentId] || {})[questionId] || null;
}

// -- Generated questions (cache so a re-validated question can be reused) -

function saveGeneratedQuestion(question) {
  db.generatedQuestions[question.id] = question;
  persist();
}

module.exports = {
  getStudent,
  getStudentOrCreate,
  upsertStudent,
  getExposure,
  getExposures,
  setExposure,
  recordAttempt,
  listAttempts,
  issueQuestion,
  getIssuedQuestion,
  saveGeneratedQuestion,
};
