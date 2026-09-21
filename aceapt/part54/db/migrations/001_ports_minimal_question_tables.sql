-- PORT (see /TRUTH_TABLE.md): the real Question/QuestionVersion tables live in
-- the actual ACEAPT content system, which was not reachable this session. This
-- is a minimal, honestly-scoped stand-in with just enough columns for Feature
-- 54's own tables to have something real to foreign-key against and for RLS
-- tenant-isolation to be demonstrable end-to-end.

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL, -- NULL = global question (spec §152)
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_consistency CHECK ((is_global AND tenant_id IS NULL) OR (NOT is_global AND tenant_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS question_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUSPENDED', 'RETIRED')),
  immutable_since_assessment_use BOOLEAN NOT NULL DEFAULT false,
  snapshot_json JSONB NOT NULL, -- the full QuestionVersionSnapshot, for reproducibility (spec §111)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_question_versions_question_id ON question_versions(question_id);
CREATE INDEX IF NOT EXISTS idx_question_versions_content_hash ON question_versions(content_hash);
CREATE INDEX IF NOT EXISTS idx_questions_tenant_id ON questions(tenant_id);
