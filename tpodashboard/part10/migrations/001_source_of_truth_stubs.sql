-- =====================================================================
-- STAND-IN TABLES FOR PARTS 1-9
-- =====================================================================
-- Part 10 must never own placement facts. These five tables exist ONLY
-- so this repo is runnable and testable in isolation.
--
-- ON INTEGRATION: delete this file and repoint the repositories in
-- src/repositories/sourceRepositories.ts at your real students /
-- applications / interviews / offers / joining tables or services.
-- Nothing in src/services reads these tables directly — everything
-- goes through the repository interfaces, so that repoint is the
-- only change required.
-- =====================================================================

CREATE TABLE students (
  id                 TEXT PRIMARY KEY,
  institution_id     TEXT NOT NULL,
  season             TEXT NOT NULL,
  name               TEXT NOT NULL,
  department         TEXT NOT NULL,
  program            TEXT NOT NULL,
  seeking_placement  INTEGER NOT NULL DEFAULT 0,
  eligible           INTEGER NOT NULL DEFAULT 0,
  readiness_score    REAL,
  risk_level         TEXT,   -- ready | almost_ready | developing | high_risk | insufficient_data
  created_at         TEXT NOT NULL
);

CREATE TABLE applications (
  id                 TEXT PRIMARY KEY,
  institution_id     TEXT NOT NULL,
  season             TEXT NOT NULL,
  student_id         TEXT NOT NULL REFERENCES students(id),
  drive_id           TEXT NOT NULL,
  company            TEXT NOT NULL,
  role               TEXT NOT NULL,
  status             TEXT NOT NULL, -- applied | withdrawn | shortlisted | interviewed | selected | offered | rejected
  applied_at         TEXT NOT NULL
);

CREATE TABLE interviews (
  id                 TEXT PRIMARY KEY,
  institution_id     TEXT NOT NULL,
  application_id     TEXT NOT NULL REFERENCES applications(id),
  scheduled_at       TEXT,
  attended           INTEGER,
  result             TEXT,   -- pending | selected | rejected
  completed_at       TEXT
);

CREATE TABLE offers (
  id                 TEXT PRIMARY KEY,
  institution_id     TEXT NOT NULL,
  season             TEXT NOT NULL,
  application_id     TEXT NOT NULL REFERENCES applications(id),
  student_id         TEXT NOT NULL REFERENCES students(id),
  company            TEXT NOT NULL,
  role               TEXT NOT NULL,
  ctc_fixed          REAL NOT NULL,
  ctc_variable       REAL NOT NULL DEFAULT 0,
  status             TEXT NOT NULL, -- received | verified | published | accepted | declined | expired
  verified           INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL
);

CREATE TABLE joining (
  id                 TEXT PRIMARY KEY,
  institution_id     TEXT NOT NULL,
  offer_id           TEXT NOT NULL REFERENCES offers(id),
  student_id         TEXT NOT NULL REFERENCES students(id),
  status             TEXT NOT NULL, -- confirmed | joined | delayed | did_not_join
  verified           INTEGER NOT NULL DEFAULT 0,
  joined_at          TEXT
);

CREATE INDEX idx_students_inst_season ON students(institution_id, season);
CREATE INDEX idx_applications_student ON applications(student_id);
CREATE INDEX idx_applications_inst_season ON applications(institution_id, season);
CREATE INDEX idx_offers_student ON offers(student_id);
CREATE INDEX idx_offers_inst_season ON offers(institution_id, season);
CREATE INDEX idx_joining_offer ON joining(offer_id);
