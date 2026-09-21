-- 0001_reused_domain.sql
--
-- These tables are NOT part of Feature 30. They are light stand-ins for
-- ACEAPT systems that already exist in the real product (Section 6, 41):
-- tenants/students, the capability model, the target/ALIGN model, and the
-- evidence ledger that feeds Adapt/Forecast/Proof. PATH is built to read
-- and write against exactly this shape, so when this lands in the real
-- codebase, this file is the part that gets deleted -- everything in
-- 0002_path_core.sql onward is what's new.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE students (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name    text NOT NULL,
  email        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE capabilities (
  code         text PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  category     text NOT NULL
);

CREATE TABLE targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code         text NOT NULL,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, code)
);

CREATE TABLE target_requirements (
  target_id       uuid NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  capability_code text NOT NULL REFERENCES capabilities(code) ON DELETE CASCADE,
  required_level  numeric NOT NULL CHECK (required_level BETWEEN 0 AND 100),
  weight          numeric NOT NULL CHECK (weight BETWEEN 0 AND 1),
  min_evidence    integer NOT NULL DEFAULT 3,
  PRIMARY KEY (target_id, capability_code)
);

CREATE TABLE student_targets (
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_id     uuid NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  slot          text NOT NULL CHECK (slot IN ('PRIMARY', 'SECONDARY', 'STRETCH')),
  deadline_days integer,
  selected_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, target_id)
);

-- One row per (student, capability): the current rolled-up state PATH reads
-- when it needs "where is the student right now". Updated by evidence
-- ingestion (see db/seed.ts and engine/evidenceIngest.ts for the reference
-- rollup logic -- the real system already has this, PATH just consumes it).
CREATE TABLE student_capability_state (
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  capability_code  text NOT NULL REFERENCES capabilities(code) ON DELETE CASCADE,
  level            numeric NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 100),
  accuracy         numeric NOT NULL DEFAULT 0 CHECK (accuracy BETWEEN 0 AND 100),
  speed            numeric NOT NULL DEFAULT 0 CHECK (speed BETWEEN 0 AND 100),
  transfer         numeric NOT NULL DEFAULT 0 CHECK (transfer BETWEEN 0 AND 100),
  consistency      numeric NOT NULL DEFAULT 0 CHECK (consistency BETWEEN 0 AND 100),
  evidence_count   integer NOT NULL DEFAULT 0,
  last_evidence_at timestamptz,
  PRIMARY KEY (student_id, capability_code)
);

CREATE TABLE evidence_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  capability_code  text NOT NULL REFERENCES capabilities(code) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN ('LEARNING', 'PRACTICE', 'PERFORMANCE', 'TRANSFER')),
  source           text NOT NULL,
  result           jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_events_student ON evidence_events (student_id, capability_code, occurred_at DESC);
CREATE INDEX idx_student_capability_state_student ON student_capability_state (student_id);
