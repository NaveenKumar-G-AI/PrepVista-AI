'use strict';

const { newId } = require('../lib/ids');

/**
 * In-memory reference implementation of the Feature 33 repository.
 *
 * This is the "default adapter" - it's what makes `npm start` and `npm test`
 * work with zero external setup. To run against a real database, write a
 * second module that exports the exact same function names (see schema.sql
 * for the matching Postgres tables) and swap the require() in the
 * services/* files. Nothing in engines/ or services/ talks to storage
 * directly, so the swap is contained to this file's call sites.
 */
const db = {
  students: new Map(),
  targets: new Map(),
  studentCapabilities: new Map(), // key: `${studentId}::${capabilityId}`
  opportunities: new Map(),
  requirements: new Map(), // key: opportunityId -> array
  analyses: new Map(), // key: `${opportunityId}::${studentId}`
  actionPlans: new Map(), // key: `${opportunityId}::${studentId}`
  applications: new Map(), // key: `${opportunityId}::${studentId}`
  outcomes: new Map(), // key: studentId -> array
};

// --- Students / Targets / Capabilities (minimal stand-ins - see seed/capabilities.js) ---
function upsertStudent(student) {
  const merged = { ...(db.students.get(student.id) || {}), ...student };
  db.students.set(merged.id, merged);
  return merged;
}
function getStudent(id) { return db.students.get(id) || null; }

function upsertTarget(target) { db.targets.set(target.id, target); return target; }
function getTarget(id) { return db.targets.get(id) || null; }

function setStudentCapability(studentId, capabilityId, data) {
  const record = { studentId, capabilityId, ...data };
  db.studentCapabilities.set(`${studentId}::${capabilityId}`, record);
  return record;
}
function listStudentCapabilities(studentId) {
  return [...db.studentCapabilities.values()].filter((c) => c.studentId === studentId);
}

// --- Opportunities ---
function createOpportunity(data) {
  const id = data.id || newId('opp');
  const record = { id, status: 'ACTIVE', createdAt: new Date().toISOString(), ...data };
  db.opportunities.set(id, record);
  return record;
}
function getOpportunity(id) { return db.opportunities.get(id) || null; }
function listOpportunities(filter = {}) {
  let all = [...db.opportunities.values()];
  if (filter.status) all = all.filter((o) => o.status === filter.status);
  return all.sort((a, b) => new Date(b.observedAt || b.createdAt) - new Date(a.observedAt || a.createdAt));
}
function updateOpportunity(id, patch) {
  const existing = getOpportunity(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  db.opportunities.set(id, updated);
  return updated;
}

// --- Requirements ---
function saveRequirements(opportunityId, requirements) {
  const withIds = requirements.map((r) => ({ ...r, id: r.id || newId('req') }));
  db.requirements.set(opportunityId, withIds);
  return withIds;
}
function getRequirements(opportunityId) { return db.requirements.get(opportunityId) || []; }

// --- Analysis (cached per opportunity+student - spec section 78 performance) ---
function saveAnalysis(opportunityId, studentId, analysis) {
  const record = { ...analysis, opportunityId, studentId, computedAt: new Date().toISOString() };
  db.analyses.set(`${opportunityId}::${studentId}`, record);
  return record;
}
function getAnalysis(opportunityId, studentId) { return db.analyses.get(`${opportunityId}::${studentId}`) || null; }
function listAnalysesForStudent(studentId) { return [...db.analyses.values()].filter((a) => a.studentId === studentId); }

// --- Action plans ---
function saveActionPlan(opportunityId, studentId, plan) {
  const record = { ...plan, id: newId('plan'), opportunityId, studentId, generatedAt: new Date().toISOString() };
  db.actionPlans.set(`${opportunityId}::${studentId}`, record);
  return record;
}
function getActionPlan(opportunityId, studentId) { return db.actionPlans.get(`${opportunityId}::${studentId}`) || null; }
function updateActionPlanItem(opportunityId, studentId, itemOrder, patch) {
  const plan = getActionPlan(opportunityId, studentId);
  if (!plan) return null;
  plan.items = plan.items.map((item) => (item.order === itemOrder ? { ...item, ...patch } : item));
  db.actionPlans.set(`${opportunityId}::${studentId}`, plan);
  return plan;
}

// --- Applications ---
function upsertApplication(opportunityId, studentId, patch) {
  const key = `${opportunityId}::${studentId}`;
  const existing = db.applications.get(key) || { opportunityId, studentId, status: 'DISCOVERED', history: [], createdAt: new Date().toISOString() };
  const updated = {
    ...existing,
    ...patch,
    history: [...existing.history, { status: patch.status || existing.status, at: new Date().toISOString() }],
    lastUpdated: new Date().toISOString(),
  };
  db.applications.set(key, updated);
  return updated;
}
function getApplication(opportunityId, studentId) { return db.applications.get(`${opportunityId}::${studentId}`) || null; }
function listApplicationsByStudent(studentId) { return [...db.applications.values()].filter((a) => a.studentId === studentId); }

// --- Outcomes ---
function addOutcome(studentId, outcome) {
  const record = { id: newId('outcome'), studentId, recordedAt: new Date().toISOString(), ...outcome };
  const list = db.outcomes.get(studentId) || [];
  list.push(record);
  db.outcomes.set(studentId, list);
  return record;
}
function listOutcomesByStudent(studentId) { return db.outcomes.get(studentId) || []; }

module.exports = {
  upsertStudent, getStudent, upsertTarget, getTarget,
  setStudentCapability, listStudentCapabilities,
  createOpportunity, getOpportunity, listOpportunities, updateOpportunity,
  saveRequirements, getRequirements,
  saveAnalysis, getAnalysis, listAnalysesForStudent,
  saveActionPlan, getActionPlan, updateActionPlanItem,
  upsertApplication, getApplication, listApplicationsByStudent,
  addOutcome, listOutcomesByStudent,
  _debugDump: () => db,
};
