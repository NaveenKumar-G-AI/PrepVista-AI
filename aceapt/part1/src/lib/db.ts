/**
 * Database connection + schema bootstrap.
 *
 * Real, file-backed SQLite via better-sqlite3 (synchronous, no ORM). Column names and shape
 * intentionally mirror prisma/schema.prisma so the two stay conceptually interchangeable — see
 * that file for why Prisma isn't the live path in this build.
 *
 * Schema creation is idempotent (`CREATE TABLE IF NOT EXISTS`), so there is no separate
 * "migrate" step to remember: the first request after `npm install` creates prisma/dev.db and
 * every table it needs.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = (() => {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const filePath = url.startsWith("file:") ? url.slice("file:".length) : url;
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
})();

declare global {
  // eslint-disable-next-line no-var
  var __aceaptDb: Database.Database | undefined;
}

function createConnection(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  bootstrapSchema(db);
  return db;
}

function bootstrapSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Student (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS OnboardingContext (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL UNIQUE REFERENCES Student(id) ON DELETE CASCADE,

      preparationGoal TEXT,
      preparationGoalOther TEXT,

      primaryObjective TEXT,
      secondaryObjectives TEXT NOT NULL DEFAULT '[]',

      timelineCategory TEXT,
      targetDate TEXT,
      daysAvailable INTEGER,

      experienceLevel TEXT,

      previousPreparation TEXT,
      previousDifficulties TEXT NOT NULL DEFAULT '[]',

      selfPerceivedQuantitative TEXT,
      selfPerceivedLogical TEXT,
      selfPerceivedVerbal TEXT,
      selfPerceivedTimePressure TEXT,

      dailyAvailability TEXT,
      dailyAvailabilityMinutes INTEGER,
      preferredStudyTime TEXT,

      preferredAssistanceModes TEXT NOT NULL DEFAULT '[]',
      initialDifficultyPreference TEXT,

      primaryPainPoint TEXT,
      secondaryPainPoints TEXT NOT NULL DEFAULT '[]',

      targetScore TEXT,

      onboardingStatus TEXT NOT NULL DEFAULT 'NOT_STARTED',
      onboardingStartedAt TEXT,
      onboardingCompletedAt TEXT,
      lastEditedAt TEXT,
      contextVersion INTEGER NOT NULL DEFAULT 1,

      aiSummary TEXT,
      aiSummarySource TEXT,
      aiSummaryModel TEXT,
      aiSummaryGeneratedAt TEXT,

      -- Future contract (Feature 2 / Diagnostic Engine). Always NULL from this feature.
      measuredQuantitative REAL,
      measuredLogical REAL,
      measuredVerbal REAL,
      measuredTimePressure REAL,
      measuredAt TEXT,
      sourceDiagnosticId TEXT,

      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS OnboardingEvent (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL REFERENCES Student(id) ON DELETE CASCADE,
      eventType TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_event_student ON OnboardingEvent(studentId);
    CREATE INDEX IF NOT EXISTS idx_event_type ON OnboardingEvent(eventType);
  `);
}

/** Singleton connection, reused across hot reloads in dev (Next.js dev server re-evaluates
 *  modules on change; a global guard avoids opening a new file handle every save). */
export function getDb(): Database.Database {
  if (!global.__aceaptDb) {
    global.__aceaptDb = createConnection();
  }
  return global.__aceaptDb;
}
