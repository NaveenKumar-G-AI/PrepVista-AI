-- 0003_requirement_checks.sql
-- Per-requirement coverage rows, one per (assessment, requirement).
-- Same denormalized user_id pattern as correctness_findings, for the same
-- RLS-performance reason.

CREATE TABLE IF NOT EXISTS requirement_checks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id            uuid NOT NULL REFERENCES correctness_assessments(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL,

  requirement_id           text NOT NULL,
  description              text NOT NULL,
  category                 text NOT NULL,
  status                   text NOT NULL CHECK (status IN ('VALIDATED','PARTIALLY_VALIDATED','NOT_VALIDATED','VIOLATED','UNKNOWN')),
  rationale                text NOT NULL,
  supporting_evidence_ids  text[] NOT NULL DEFAULT '{}',

  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT requirement_checks_unique_per_assessment UNIQUE (assessment_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_requirement_checks_assessment
  ON requirement_checks (assessment_id);

CREATE INDEX IF NOT EXISTS idx_requirement_checks_user
  ON requirement_checks (user_id);
