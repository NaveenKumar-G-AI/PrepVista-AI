-- ACEAPT Feature 54 — Question Validation Engine — core schema (spec §154-158).

CREATE TABLE IF NOT EXISTS validator_definitions (
  name TEXT PRIMARY KEY, -- e.g. "MATH_VALIDATOR" — matches Validator.name in code
  category TEXT NOT NULL,
  current_version TEXT NOT NULL,
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question_validation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  tenant_id UUID NULL, -- denormalized from questions for RLS (spec §152) without an extra join
  version_number INT NOT NULL,
  content_hash TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('FAST', 'STANDARD', 'DEEP', 'ASSESSMENT', 'RUNTIME', 'REVALIDATION')),
  profile TEXT NOT NULL,
  overall_status TEXT NOT NULL CHECK (overall_status IN ('VALID', 'VALID_WITH_WARNINGS', 'REVIEW_REQUIRED', 'INVALID', 'VALIDATION_ERROR', 'STALE')),
  highest_severity TEXT NOT NULL CHECK (highest_severity IN ('NONE', 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  blocking_codes TEXT[] NOT NULL DEFAULT '{}',
  eligibility_practice BOOLEAN NOT NULL,
  eligibility_timed BOOLEAN NOT NULL,
  eligibility_assessment BOOLEAN NOT NULL,
  validator_version_set JSONB NOT NULL,
  requested_by_role TEXT NOT NULL,
  requested_by_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qvr_question_id ON question_validation_runs(question_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_qvr_tenant_id ON question_validation_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qvr_content_hash ON question_validation_runs(content_hash);

CREATE TABLE IF NOT EXISTS question_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_run_id UUID NOT NULL REFERENCES question_validation_runs(id) ON DELETE CASCADE,
  tenant_id UUID NULL, -- denormalized for RLS, same value as the parent run
  validator_name TEXT NOT NULL,
  category TEXT NOT NULL,
  validator_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NOT_RUN', 'RUNNING', 'PASS', 'PASS_WITH_WARNING', 'FAIL', 'ERROR', 'SKIPPED', 'NOT_APPLICABLE', 'STALE')),
  severity TEXT NOT NULL CHECK (severity IN ('NONE', 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}',
  duration_ms INT NOT NULL,
  validated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qvres_run_id ON question_validation_results(validation_run_id);
CREATE INDEX IF NOT EXISTS idx_qvres_tenant_id ON question_validation_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qvres_code ON question_validation_results(code) WHERE status IN ('FAIL', 'ERROR');

CREATE TABLE IF NOT EXISTS validation_dependencies (
  validator_name TEXT NOT NULL REFERENCES validator_definitions(name),
  depends_on_validator TEXT NOT NULL REFERENCES validator_definitions(name),
  dependency_condition TEXT NOT NULL DEFAULT 'MUST_PASS_OR_WARN',
  PRIMARY KEY (validator_name, depends_on_validator)
);

CREATE TABLE IF NOT EXISTS validation_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  tenant_id UUID NULL,
  issue_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('NONE', 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'WONT_FIX')),
  evidence JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_question_version ON validation_issues(question_version_id);
CREATE INDEX IF NOT EXISTS idx_issues_tenant_id ON validation_issues(tenant_id);

CREATE TABLE IF NOT EXISTS validation_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  question_id UUID NULL REFERENCES questions(id) ON DELETE SET NULL,
  validation_run_id UUID NULL REFERENCES question_validation_runs(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g. "REVALIDATE_REQUESTED", "QUESTION_SUSPENDED"
  reason TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_id ON validation_audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_question_id ON validation_audit_events(question_id);
