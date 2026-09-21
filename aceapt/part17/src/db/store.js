const fs = require('fs');
const path = require('path');

// Path is overridable so tests can point at a throwaway file instead of
// the real runtime store.
const DB_PATH = process.env.ACEAPT_DB_PATH || path.join(__dirname, '../../data/db.json');

function defaultDb() {
  return {
    students: {},       // studentId -> student record
    exposures: {},       // studentId -> { questionId -> exposure record }
    attempts: {},         // studentId -> [ evidence, ... ]
    sessions: {},           // studentId -> { questionId -> issued question record }
    generatedQuestions: {},  // questionId -> generated question object
  };
}

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const fresh = defaultDb();
    save(fresh);
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // Guard against a partially-written or older-shaped file.
    return { ...defaultDb(), ...parsed };
  } catch (e) {
    console.warn('[store] db.json unreadable, starting fresh:', e.message);
    const fresh = defaultDb();
    save(fresh);
    return fresh;
  }
}

function save(db) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = { load, save, defaultDb, DB_PATH };
