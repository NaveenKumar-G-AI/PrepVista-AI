-- ACEAPT Feature 51 — Accuracy Training Engine
-- Schema migration. Run as aceapt51_owner (via `npm run db:migrate`).
--
-- Per the spec's "reuse-first" rule (§7, §91): this migration does NOT create
-- Question / Skill / Mistake / Mastery / Performance / Student / Session /
-- Assessment tables — those are owned by the rest of ACEAPT. Only the four
-- new entities Feature 51 actually needs are created, plus a durable outbox
-- for cross-feature signals (§57–59, §84–86) and a small set of underscore-
-- prefixed FIXTURE tables that stand in for the canonical tables so this
-- standalone module is runnable and its test suite is self-contained. Delete
-- the fixture tables and point the foreign-key-shaped columns (student_id,
-- skill_id, question_id) at the real ACEAPT tables when this is integrated.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ═══════════════════════════════════════════════════════════════════════
-- FIXTURE TABLES — stand-ins for canonical ACEAPT tables (not owned by F51)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS _fixture_student (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS _fixture_skill (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name   TEXT NOT NULL,
  domain TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS _fixture_question (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id       UUID NOT NULL REFERENCES _fixture_skill(id),
  difficulty     TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  prompt         TEXT NOT NULL,
  correct_answer JSONB NOT NULL,
  is_valid       BOOLEAN NOT NULL DEFAULT true,
  steps          JSONB NULL -- ordered step list for guided-solving / first-error localization
);

-- ═══════════════════════════════════════════════════════════════════════
-- CORE ENTITIES (§91–93)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS accuracy_training_session (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL,
  training_type    TEXT NOT NULL CHECK (training_type IN (
                      'FOUNDATION_PRECISION','STRATEGY_PRECISION','FORMULA_PRECISION',
                      'CALCULATION_PRECISION','INTERPRETATION_PRECISION','LOGIC_PRECISION',
                      'VERIFICATION_PRECISION','PRESSURE_PRECISION','TRANSFER_PRECISION',
                      'MIXED_PRECISION'
                    )),
  target_skill_id  UUID NULL REFERENCES _fixture_skill(id),
  target_error_type TEXT NULL,
  difficulty       TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  mode             TEXT NOT NULL DEFAULT 'guided' CHECK (mode IN ('guided','independent')),
  status           TEXT NOT NULL DEFAULT 'READY' CHECK (status IN (
                      'READY','ACTIVE','FEEDBACK','RETRY','VERIFICATION',
                      'COMPLETED','PAUSED','ABANDONED'
                    )),
  question_plan    JSONB NULL,      -- ordered list of question_ids planned for this session
  cursor_position  INT NOT NULL DEFAULT 0, -- current index into question_plan (session recovery, §97/§133)
  started_at       TIMESTAMPTZ NULL,
  completed_at     TIMESTAMPTZ NULL,
  outcome          JSONB NULL,      -- populated on completion (§67 training result)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accuracy_training_attempt (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID NOT NULL REFERENCES accuracy_training_session(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL,
  question_id          UUID NOT NULL REFERENCES _fixture_question(id),
  skill_id             UUID NOT NULL REFERENCES _fixture_skill(id),
  sequence_number      INT NOT NULL,
  submitted_answer     JSONB NULL,
  is_correct           BOOLEAN NULL,
  first_error_step     INT NULL,
  step_results         JSONB NULL,        -- [{ "step": 1, "correct": true }, ...] (§23, §122)
  error_type           TEXT NULL,         -- error taxonomy (§9); NULL when correct
  difficulty           TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  is_novel             BOOLEAN NOT NULL DEFAULT false,      -- from Anti-Memorization (F49) signal
  hint_level           TEXT NOT NULL DEFAULT 'independent'  -- from Hint Intelligence (F48) signal
                          CHECK (hint_level IN ('independent','guided','hint_used')),
  response_time_ms     INT NULL,          -- from Speed Training (F50) signal
  expected_time_ms     INT NULL,          -- baseline pace, for pressure classification
  self_corrected       BOOLEAN NOT NULL DEFAULT false,
  question_valid       BOOLEAN NOT NULL DEFAULT true,       -- Question Quality/Validation signal (§129)
  session_position_pct NUMERIC NULL,      -- 0-100, position within the session's evidence window
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence_number)    -- one attempt per slot: blocks double-submit (§96/§134)
);

CREATE INDEX IF NOT EXISTS idx_attempt_student_skill ON accuracy_training_attempt (student_id, skill_id);
CREATE INDEX IF NOT EXISTS idx_attempt_student_created ON accuracy_training_attempt (student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempt_error_type ON accuracy_training_attempt (student_id, error_type) WHERE error_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS accuracy_profile_snapshot (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID NOT NULL,
  scope                TEXT NOT NULL,     -- 'overall' | 'skill' | 'difficulty' | 'timed' | 'novel' | ...
  scope_id             TEXT NULL,         -- e.g. skill_id / difficulty label; NULL for 'overall'
  accuracy             NUMERIC NULL,
  independent_accuracy NUMERIC NULL,
  timed_accuracy       NUMERIC NULL,
  novel_accuracy       NUMERIC NULL,
  sample_size          INT NOT NULL,
  confidence           TEXT NOT NULL CHECK (confidence IN ('insufficient','low','moderate','high')),
  reason               TEXT NULL,         -- e.g. "computed at session completion"
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_student_scope_time
  ON accuracy_profile_snapshot (student_id, scope, scope_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS accuracy_intervention (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL,
  session_id        UUID NULL REFERENCES accuracy_training_session(id) ON DELETE SET NULL,
  error_type        TEXT NOT NULL,
  skill_id          UUID NULL REFERENCES _fixture_skill(id),
  intervention_type TEXT NOT NULL,
  reason            TEXT NOT NULL,
  recurrence_status TEXT NOT NULL CHECK (recurrence_status IN (
                       'isolated','recurring','clustered','resolved','regressed'
                     )),
  evidence          JSONB NOT NULL,  -- counts/streaks/sample sizes behind the decision (auditability, §69)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_student_created
  ON accuracy_intervention (student_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- DURABLE OUTBOX — cross-feature signals (§57–59, §75, §84–86)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS signal_outbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL,
  signal_type   TEXT NOT NULL CHECK (signal_type IN (
                   'PRESSURE_REDUCTION_SIGNAL',     -- → Speed Training (F50), §57
                   'PACE_INCREASE_OK_SIGNAL',        -- → Speed Training (F50), §57/§124
                   'TRANSFER_PRECISION_SIGNAL',      -- → Anti-Memorization (F49), §58
                   'ASSISTANCE_DEPENDENCY_SIGNAL',   -- → Hint Intelligence / Anti-Memorization (F48/F49), §59
                   'MASTERY_EVIDENCE_SIGNAL',        -- → Mastery (F36/37), §82
                   'RETENTION_EVIDENCE_SIGNAL',      -- → Retention (F39/40), §83
                   'READINESS_ACCURACY_SIGNAL',      -- → Readiness, §86
                   'REGRESSION_DETECTED_SIGNAL'      -- → Personal Mistake Bank / Error Pattern Intelligence, §52/§78/§79
                 )),
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DISPATCHED','FAILED')),
  attempts      INT NOT NULL DEFAULT 0,
  last_error    TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON signal_outbox (status, created_at) WHERE status = 'PENDING';

-- ═══════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════
-- App-role queries run inside a transaction that opens with:
--   SET LOCAL app.student_id = '<uuid>';
-- (see src/db/pool.ts → withStudentContext). FORCE ROW LEVEL SECURITY means
-- this applies even to aceapt51_owner if it were ever used at request time
-- (it isn't — see db/00-roles.sql) — belt and suspenders after the owner-
-- bypass gotcha hit on an earlier ACEAPT feature.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accuracy_training_session','accuracy_training_attempt',
    'accuracy_profile_snapshot','accuracy_intervention','signal_outbox'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS app_student_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY app_student_isolation ON %I TO aceapt51_app
         USING (student_id = NULLIF(current_setting(''app.student_id'', true), '''')::uuid)
         WITH CHECK (student_id = NULLIF(current_setting(''app.student_id'', true), '''')::uuid)',
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS service_full_access ON %I', t);
    EXECUTE format(
      'CREATE POLICY service_full_access ON %I TO aceapt51_service USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END
$$;

-- accuracy_training_session doesn't carry error_type/skill_id at the top level
-- for the outbox-style CHECK above, but does need the same isolation — already
-- covered by the loop (student_id column exists on all five tables).

GRANT USAGE ON SCHEMA public TO aceapt51_app, aceapt51_service;
GRANT SELECT, INSERT, UPDATE ON accuracy_training_session, accuracy_training_attempt,
  accuracy_profile_snapshot, accuracy_intervention, signal_outbox TO aceapt51_app, aceapt51_service;
GRANT SELECT ON _fixture_student, _fixture_skill, _fixture_question TO aceapt51_app, aceapt51_service;
GRANT INSERT ON _fixture_student, _fixture_skill, _fixture_question TO aceapt51_service; -- test/seed only

SELECT 'Feature 51 schema ready' AS status;
