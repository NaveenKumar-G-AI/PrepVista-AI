-- 0001_correctness_assessments.sql
-- Core table for the Code Correctness Analysis Engine.
--
-- Design notes:
--  * `raw` stores the full serialized CorrectnessAssessment (jsonb) for
--    full-fidelity retrieval by the API layer, while the individual
--    columns exist for indexing, filtering, and cheap list/history queries
--    without deserializing the blob.
--  * UNIQUE(submission_id, submission_version) is the idempotency
--    guarantee: re-analyzing the same immutable submission version can
--    only ever upsert the same row, never create a duplicate.
--  * user_id is populated from the AUTHENTICATED SESSION on the server
--    that performs the analysis (see src/security/authorization.ts) —
--    never trusted from client input.

CREATE TABLE IF NOT EXISTS correctness_assessments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  submission_id        text NOT NULL,
  submission_version   text NOT NULL,
  problem_id           text NOT NULL,
  user_id              uuid NOT NULL,
  language             text NOT NULL,

  status               text NOT NULL,
  confidence           text NOT NULL,
  error_category       text NOT NULL,

  pass_rate            double precision,
  total_available      integer NOT NULL DEFAULT 0,
  passed               integer NOT NULL DEFAULT 0,
  failed               integer NOT NULL DEFAULT 0,
  skipped              integer NOT NULL DEFAULT 0,
  summary              text NOT NULL,

  ai_available         boolean NOT NULL DEFAULT false,
  ai_degradation_reason text NOT NULL DEFAULT 'DISABLED',
  ai_provider          text,
  ai_model             text,
  ai_latency_ms         integer,
  ai_disagreed          boolean NOT NULL DEFAULT false,

  delta                jsonb,
  raw                  jsonb NOT NULL,

  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT correctness_assessments_status_check
    CHECK (status IN ('UNKNOWN','LIKELY_CORRECT','PARTIALLY_VALIDATED','LIKELY_INCORRECT','DEFINITIVELY_INCORRECT','ACCEPTED')),
  CONSTRAINT correctness_assessments_confidence_check
    CHECK (confidence IN ('LOW','MEDIUM','HIGH')),

  -- Idempotency: analyzing the same submission version twice upserts the
  -- same row (see ON CONFLICT usage in supabaseRepository.ts).
  CONSTRAINT correctness_assessments_submission_version_unique
    UNIQUE (submission_id, submission_version)
);

CREATE INDEX IF NOT EXISTS idx_correctness_assessments_user
  ON correctness_assessments (user_id);

CREATE INDEX IF NOT EXISTS idx_correctness_assessments_history
  ON correctness_assessments (problem_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_correctness_assessments_submission
  ON correctness_assessments (submission_id);
