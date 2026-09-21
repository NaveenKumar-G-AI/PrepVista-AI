-- 0002_correctness_findings.sql
-- Normalized findings (static-analysis findings, AI findings, and failure
-- clusters) linked back to their parent assessment. user_id is
-- intentionally DENORMALIZED here (duplicated from the parent assessment)
-- so that RLS policies on this table are a simple column comparison
-- rather than a correlated subquery/join on every row — a standard,
-- deliberate trade-off for RLS performance at read time.

CREATE TABLE IF NOT EXISTS correctness_findings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL REFERENCES correctness_assessments(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,

  kind               text NOT NULL CHECK (kind IN ('static', 'ai_finding', 'cluster')),
  rule_or_claim      text NOT NULL,
  severity_or_confidence text,
  message            text NOT NULL,
  evidence_ids       text[] NOT NULL DEFAULT '{}',
  source_range       jsonb,

  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correctness_findings_assessment
  ON correctness_findings (assessment_id);

CREATE INDEX IF NOT EXISTS idx_correctness_findings_user
  ON correctness_findings (user_id);
