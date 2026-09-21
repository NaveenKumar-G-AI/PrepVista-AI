-- =============================================================================
-- 001_standalone_core_standins.sql
--
-- IMPORTANT CONTEXT FOR INTEGRATION:
-- No existing ACEAPT repository was available to extend for this build (same
-- situation as Features 8/20/29). Feature 40 depends conceptually on data that
-- Features 33 (Opportunities), 34 (Career Direction), 37 (Evidence), 38
-- (Positioning) and 39 (Opportunity Intelligence) already own in the real
-- product. Rather than inventing parallel "Feature 40 versions" of those
-- systems (forbidden by the spec's REUSE BEFORE CREATE rule), this migration
-- creates the SMALLEST possible stand-in shape of that data, clearly isolated
-- in its own section, so Feature 40 can be built, seeded, and tested end to
-- end. When wiring into the real ACEAPT repo:
--   1. DROP this migration (do not run it).
--   2. Point src/integrations/feature34/37/38/39.adapter.ts at the real
--      tables/services instead of the queries currently in
--      src/db/standins.ts.
--   3. Everything from migration 002 onward is genuinely new Feature 40
--      surface area and should be run as-is (adjust FK types only if the
--      real `students`/`roles`/`skills` primary keys are not UUID).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---- Students (stand-in for the real student profile system) --------------
CREATE TABLE students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Roles ------------------------------------------------------------------
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  category    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Skills -------------------------------------------------------------
CREATE TABLE skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Feature 34 stand-in: career direction ---------------------------------
CREATE TABLE career_directions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_role_id  UUID NOT NULL REFERENCES roles(id),
  priority        INT NOT NULL DEFAULT 1,          -- 1 = primary target
  status          TEXT NOT NULL DEFAULT 'ACTIVE'    -- ACTIVE | EXPLORATORY | ARCHIVED
                  CHECK (status IN ('ACTIVE','EXPLORATORY','ARCHIVED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_career_directions_student ON career_directions(student_id);

-- ---- Feature 37 stand-in: validated evidence -------------------------------
CREATE TABLE evidence_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill_id      UUID NOT NULL REFERENCES skills(id),
  evidence_type TEXT NOT NULL                        -- PROJECT | ASSESSMENT | CERTIFICATION | PRACTICE
                CHECK (evidence_type IN ('PROJECT','ASSESSMENT','CERTIFICATION','PRACTICE')),
  strength      NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (strength >= 0 AND strength <= 1),
  verified      BOOLEAN NOT NULL DEFAULT false,
  title         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_evidence_student_skill ON evidence_items(student_id, skill_id);

-- ---- Feature 38 stand-in: positioning --------------------------------------
CREATE TABLE positioning_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  headline         TEXT,
  differentiators  JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_positioning_student ON positioning_snapshots(student_id);

-- ---- Feature 33/39 stand-in: opportunities + applications ------------------
CREATE TABLE opportunities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id           UUID NOT NULL REFERENCES roles(id),
  company_name      TEXT,
  required_skills   JSONB NOT NULL DEFAULT '[]',    -- array of skill slugs
  posted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_opportunities_role ON opportunities(role_id);

-- ---- Feature 35 stand-in: outcomes -----------------------------------------
CREATE TABLE applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  opportunity_id   UUID NOT NULL REFERENCES opportunities(id),
  status           TEXT NOT NULL DEFAULT 'APPLIED',
  outcome          TEXT,                             -- e.g. RESPONSE | INTERVIEW | OFFER | REJECTED, NULL = no signal yet
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_applications_student ON applications(student_id);
