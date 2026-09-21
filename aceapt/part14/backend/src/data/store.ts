/**
 * Prototype persistence layer.
 *
 * Section 41 says "first inspect existing models... do not create duplicate
 * entities if equivalent structures already exist." There is no existing
 * repository in this environment (no codebase was uploaded — see
 * README.md "A note on scope"), so this file defines a minimal, swappable
 * repository interface plus an in-memory + JSON-file-backed implementation
 * of it. A real integration would replace `JsonFileStore` with a Postgres/
 * Prisma-backed implementation of the same `Store` interface — nothing in
 * engine/*.ts or api/*.ts should need to change.
 *
 * Deliberately NOT using a native-binary DB (e.g. better-sqlite3) here to
 * keep the prototype dependency-free and avoid native build steps.
 */

import fs from 'fs';
import path from 'path';
import {
  AttemptEvent,
  MasteryCheck,
  MasterySnapshot,
  MasteryTransition,
  Question,
  Skill,
  Student,
} from '../domain/types';

export interface Store {
  skills: Map<string, Skill>;
  questions: Map<string, Question>;
  students: Map<string, Student>;
  attempts: AttemptEvent[];
  masteryChecks: Map<string, MasteryCheck>;
  transitions: MasteryTransition[];
  snapshots: MasterySnapshot[];
}

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function emptyStore(): Store {
  return {
    skills: new Map(),
    questions: new Map(),
    students: new Map(),
    attempts: [],
    masteryChecks: new Map(),
    transitions: [],
    snapshots: [],
  };
}

function serialize(store: Store) {
  return JSON.stringify(
    {
      skills: Array.from(store.skills.values()),
      questions: Array.from(store.questions.values()),
      students: Array.from(store.students.values()),
      attempts: store.attempts,
      masteryChecks: Array.from(store.masteryChecks.values()),
      transitions: store.transitions,
      snapshots: store.snapshots,
    },
    null,
    2
  );
}

function deserialize(raw: string): Store {
  const parsed = JSON.parse(raw);
  const store = emptyStore();
  for (const s of parsed.skills ?? []) store.skills.set(s.id, s);
  for (const q of parsed.questions ?? []) store.questions.set(q.id, q);
  for (const st of parsed.students ?? []) store.students.set(st.id, st);
  store.attempts = parsed.attempts ?? [];
  for (const mc of parsed.masteryChecks ?? []) store.masteryChecks.set(mc.id, mc);
  store.transitions = parsed.transitions ?? [];
  store.snapshots = parsed.snapshots ?? [];
  return store;
}

/**
 * Loads the store into memory once, keeps it there for the process
 * lifetime, and flushes to disk after every mutation. Fine for a prototype
 * with a single demo student; a real deployment swaps this for a proper
 * database and drops the in-memory cache.
 */
class JsonFileStore {
  private store: Store;

  constructor() {
    if (fs.existsSync(DB_FILE)) {
      this.store = deserialize(fs.readFileSync(DB_FILE, 'utf-8'));
    } else {
      this.store = emptyStore();
    }
  }

  get(): Store {
    return this.store;
  }

  replace(store: Store) {
    this.store = store;
    this.flush();
  }

  flush() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, serialize(this.store));
  }
}

export const db = new JsonFileStore();
