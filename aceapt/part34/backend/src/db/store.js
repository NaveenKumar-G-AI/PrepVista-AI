import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', '..', 'data.json');

/*
 * ---------------------------------------------------------------------------
 * PERSISTENCE LAYER (placeholder)
 * ---------------------------------------------------------------------------
 * A deliberately small, dependency-free JSON-file store standing in for
 * ACEAPT's real database. It exists so Feature 34's engine and API have
 * something real to read from and write to today - no data returned by this
 * module is fabricated at request time; it is always what was actually
 * written earlier (seeded or produced by real API calls).
 *
 * Everything outside this file talks to it only through the functions below
 * (getStudent / listSignals / addSignal / etc.), never through the file
 * system directly. That means swapping in a real database later is a change
 * to the *inside* of this file only - engine and route code does not change.
 * See ARCHITECTURE.md, "Reuse before creating".
 * ---------------------------------------------------------------------------
 */

function emptyState() {
  return { students: {}, signals: [], decisions: [] };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return emptyState();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    console.error('[store] data.json was unreadable, starting from empty state:', err.message);
    return emptyState();
  }
}

let state = load();

function persist() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function newId() {
  return crypto.randomUUID();
}

export function getStudent(studentId) {
  return state.students[studentId] || null;
}

export function upsertStudent(student) {
  state.students[student.id] = { ...state.students[student.id], ...student };
  persist();
  return state.students[student.id];
}

export function listSignals(studentId) {
  return state.signals
    .filter((s) => s.studentId === studentId)
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
}

export function addSignal(signal) {
  const record = { id: newId(), ...signal };
  state.signals.push(record);
  persist();
  return record;
}

export function listDecisions(studentId) {
  return state.decisions
    .filter((d) => d.studentId === studentId)
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
}

export function addDecision(decision) {
  const record = { id: newId(), ...decision };
  state.decisions.push(record);
  persist();
  return record;
}

export function replaceAll(nextState) {
  state = nextState;
  persist();
}

export function getRawState() {
  return state;
}
