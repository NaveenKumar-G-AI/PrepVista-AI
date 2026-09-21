-- ============================================================================
-- ACEAPT Feature 53 — Question Quality Engine — canonical schema (sections 114-120)
-- ============================================================================
--
-- This file defines the PRODUCTION schema. The reference implementation ships
-- with an in-memory repository (src/db/memoryRepository.ts) so the engine and
-- its test suite run with zero external services. To go from "trust engine"
-- to "trust engine backed by a real database": write a new class implementing
-- src/db/repository.ts (QuestionRepository) against these tables with your
-- driver of choice (pg, Prisma, Drizzle, ...) and pass it to createEngine()
-- instead of MemoryRepository — no validator or service code has to change.
--
-- Reuse decisions (see README "Design decisions" for the full list):
--  - Provenance (section 9/73) is inlined onto question_versions rather than a
--    separate join table — every provenance field is 1:1 with a version anyway.
--  - "QuestionFamily" (section 97/114) is included but deliberately thin —
--    SimilarityValidator computes structural signatures on the fly; this table
--    is where you'd persist curated/confirmed families once a content team
--    starts acting on that signal.
-- ============================================================================

CREATE TABLE questions (
  id                  UUID PRIMARY KEY,
  tenant_id           UUID,                          -- NULL when is_global = TRUE
  is_global           BOOLEAN NOT NULL DEFAULT FALSE,
  current_version_id  UUID,
  lifecycle_status    TEXT NOT NULL,                  -- LifecycleStatus enum, section 8
  trust_level         TEXT NOT NULL DEFAULT 'UNVERIFIED',
  health              TEXT NOT NULL DEFAULT 'HEALTHY',
  lifecycle_version   INTEGER NOT NULL DEFAULT 0,      -- optimistic-concurrency counter, section 165
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_versions (
  id                    UUID PRIMARY KEY,
  question_id           UUID NOT NULL REFERENCES questions(id),
  version_number        INTEGER NOT NULL,
  content               TEXT NOT NULL,
  options               JSONB NOT NULL,                -- QuestionOption[]
  answer_key            JSONB NOT NULL,                 -- option id[]
  multi_select          BOOLEAN NOT NULL DEFAULT FALSE,
  solution              JSONB,
  computation           JSONB,                            -- ComputationSpec, when independently verifiable (sections 17-23)
  context               JSONB,                             -- { facts, tableData } for contradiction checks (section 35)
  diagram               JSONB,
  skill_mapping         JSONB,
  difficulty_metadata   JSONB,
  purpose               TEXT,
  min_options           INTEGER,
  non_negative_expected BOOLEAN,

  -- Provenance (section 9/73), inlined — see header note above.
  source                TEXT,
  author_id             UUID,
  generator             TEXT,
  model                 TEXT,
  prompt_version        TEXT,

  changed_fields        JSONB,                            -- vs previous version — revalidation scoping (section 72)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            TEXT,
  UNIQUE (question_id, version_number)
);

CREATE TABLE question_validations (
  id                    UUID PRIMARY KEY,
  question_version_id   UUID NOT NULL REFERENCES question_versions(id),
  validator              TEXT NOT NULL,                    -- e.g. 'AnswerValidator'
  status                  TEXT NOT NULL,                     -- 'PASS' | 'FLAGGED'
  severity                TEXT,                               -- worst IssueSeverity this validator produced, if any
  issue_count             INTEGER NOT NULL DEFAULT 0,
  validated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_issues (
  id                    UUID PRIMARY KEY,
  question_version_id   UUID NOT NULL REFERENCES question_versions(id),
  issue_type             TEXT NOT NULL,                     -- IssueType enum
  severity                TEXT NOT NULL,                      -- IssueSeverity enum
  status                  TEXT NOT NULL DEFAULT 'OPEN',        -- 'OPEN' | 'RESOLVED' | 'WONT_FIX'
  message                 TEXT NOT NULL,
  evidence                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at               TIMESTAMPTZ
);

CREATE TABLE question_reports (
  id            UUID PRIMARY KEY,
  question_id   UUID NOT NULL REFERENCES questions(id),
  version_id    UUID NOT NULL REFERENCES question_versions(id),
  student_hash  TEXT NOT NULL,                            -- pseudonymized — never the raw student id (section 118)
  report_type   TEXT NOT NULL,                              -- ReportType enum
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'OPEN',
  priority      TEXT,                                        -- computed by ReportService.computeReportPriority (section 54)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_reviews (
  id                    UUID PRIMARY KEY,
  question_version_id   UUID NOT NULL REFERENCES question_versions(id),
  reviewer_id            UUID NOT NULL,
  decision                 TEXT NOT NULL,                    -- ReviewDecision enum
  reason                    TEXT,
  override_reason           TEXT,                              -- populated only when overriding an unresolved CRITICAL issue
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_audit_events (
  id            UUID PRIMARY KEY,
  question_id   UUID NOT NULL REFERENCES questions(id),
  action        TEXT NOT NULL,
  actor         TEXT NOT NULL,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_families (
  id                    UUID PRIMARY KEY,
  name                  TEXT NOT NULL,
  skill                 TEXT,
  structural_signature  TEXT,
  member_question_ids   JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_questions_tenant           ON questions(tenant_id);
CREATE INDEX idx_questions_lifecycle_status ON questions(lifecycle_status);
CREATE INDEX idx_versions_question_id       ON question_versions(question_id);
CREATE INDEX idx_validations_version_id     ON question_validations(question_version_id);
CREATE INDEX idx_issues_version_id          ON question_issues(question_version_id);
CREATE INDEX idx_issues_status              ON question_issues(status);
CREATE INDEX idx_reports_question_id        ON question_reports(question_id);
CREATE INDEX idx_reviews_version_id         ON question_reviews(question_version_id);
CREATE INDEX idx_audit_question_id          ON question_audit_events(question_id);
