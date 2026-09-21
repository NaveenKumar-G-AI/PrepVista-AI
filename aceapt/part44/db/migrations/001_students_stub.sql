-- Stand-in for the real "Students" identity table owned by ACEAPT's
-- existing onboarding/auth system (Feature 1-ish). Feature 44 does not
-- own student identity; in the real codebase this table is dropped and
-- goals.student_id references the real students table instead.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON students TO goal_app;
