-- =============================================================================
-- Migration 016: Interview Type Expansion
-- =============================================================================
-- Purpose:
--   Extends interview_sessions to support role-based and HR-round interview
--   modes in addition to the default resume-based flow.
--
--   Adds three columns:
--     interview_type  — categorizes the session's question strategy
--     target_role     — the specific job role the candidate is preparing for
--     target_company  — optional company context for company-specific prep
--
-- Safety:
--   All changes use ADD COLUMN IF NOT EXISTS — fully idempotent.
--   Constraints on already-deployed columns use DO blocks with pg_constraint
--   existence checks — safe to run on fresh or previously-migrated schemas.
--   No existing data is modified, renamed, or removed.
--   CHECK constraints enforce data integrity at the database level so
--   invalid values are rejected before reaching the application.
--
-- Compatibility:
--   Fully backward-compatible. Existing sessions default to 'resume_based'
--   and NULL target fields, which is equivalent to pre-migration behavior.
--
-- Hardening notes (added over original):
--   • interview_type is NOT NULL — NULL is not a valid strategy identifier
--     and passes PostgreSQL IN() checks silently (NULL IN (...) = NULL = passes).
--   • target_role and target_company enforce a minimum length of 1 when set —
--     an empty string '' is not semantically equivalent to NULL and should
--     never reach the application or LLM context.
--   • interview_type_definitions adds is_active for soft-deprecation of types,
--     a question_strategy allowlist, an updated_at trigger, and access controls.
--   • target_company gains a partial index consistent with target_role.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- interview_type: controls which question-generation strategy is used.
--
--   resume_based  — default; questions are driven by the candidate's PDF resume.
--   role_based    — questions are driven by the target_role field; useful when
--                   the candidate does not have a strong resume yet.
--   hr_round      — behavioral, cultural fit, and soft-skill focused questions;
--                   used for HR screening rounds.
--
-- NOT NULL rationale: NULL is not a valid strategy and would silently pass
--   the IN() CHECK in PostgreSQL (NULL IN (...) evaluates to NULL, which
--   passes a CHECK constraint because only FALSE causes a failure).
--   NOT NULL + DEFAULT 'resume_based' is safe: existing rows already have
--   the default value from the initial ADD COLUMN, so SET NOT NULL succeeds
--   without a table scan rejection.
-- ---------------------------------------------------------------------------
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS interview_type TEXT NOT NULL DEFAULT 'resume_based'
        CHECK (interview_type IN ('resume_based', 'role_based', 'hr_round'));

-- For installations where the column was already added without NOT NULL,
-- promote it now.  The DEFAULT ensures all existing rows are non-NULL.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name  = 'interview_sessions'
          AND column_name = 'interview_type'
          AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE interview_sessions
            ALTER COLUMN interview_type SET NOT NULL;
    END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- target_role: free-text field for the job role the candidate is targeting.
-- Used by role_based and hr_round sessions to contextualize questions.
--
-- Bounded: 1–200 characters when non-NULL.
--   Lower bound (1): rejects empty strings that are semantically NULL.
--     An empty target_role sent to the LLM context produces nonsense questions.
--   Upper bound (200): prevents unbounded input and oversized index entries.
-- NULL = no target role specified (valid for resume_based sessions).
-- ---------------------------------------------------------------------------
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS target_role TEXT
        CHECK (target_role IS NULL OR char_length(target_role) BETWEEN 1 AND 200);

-- Upgrade existing constraint if column was added without the lower bound.
DO $$
BEGIN
    -- Drop old constraint (upper-bound-only) if present; replace with BETWEEN.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname    = 'interview_sessions_target_role_check'
          AND conrelid   = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            DROP CONSTRAINT interview_sessions_target_role_check;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname    = 'chk_interview_sessions_target_role_len'
          AND conrelid   = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            ADD CONSTRAINT chk_interview_sessions_target_role_len
            CHECK (target_role IS NULL OR char_length(target_role) BETWEEN 1 AND 200);
    END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- target_company: optional free-text field for the company the candidate is
-- targeting.  Allows company-specific question flavoring (e.g. known values,
-- team structure, engineering culture) in future iterations.
-- Bounded: 1–200 characters when non-NULL (same rationale as target_role).
-- ---------------------------------------------------------------------------
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS target_company TEXT
        CHECK (target_company IS NULL OR char_length(target_company) BETWEEN 1 AND 200);

-- Upgrade existing constraint if column was added without the lower bound.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname    = 'interview_sessions_target_company_check'
          AND conrelid   = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            DROP CONSTRAINT interview_sessions_target_company_check;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname    = 'chk_interview_sessions_target_company_len'
          AND conrelid   = 'interview_sessions'::regclass
    ) THEN
        ALTER TABLE interview_sessions
            ADD CONSTRAINT chk_interview_sessions_target_company_len
            CHECK (target_company IS NULL OR char_length(target_company) BETWEEN 1 AND 200);
    END IF;
END;
$$;


-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for filtering and grouping sessions by interview_type.
-- Supports analytics queries such as:
--   SELECT interview_type, AVG(final_score) FROM interview_sessions GROUP BY interview_type
CREATE INDEX IF NOT EXISTS idx_interview_sessions_interview_type
    ON interview_sessions (interview_type)
    WHERE interview_type IS NOT NULL;

-- Index for target_role: supports queries filtering by specific target roles
-- (e.g. find all sessions for 'Backend Engineer' roles for reporting).
CREATE INDEX IF NOT EXISTS idx_interview_sessions_target_role
    ON interview_sessions (target_role)
    WHERE target_role IS NOT NULL;

-- Index for target_company: consistent with target_role index above.
-- Supports analytics: "how many sessions target Google vs Amazon?"
-- and company-specific question-cache lookups in future iterations.
CREATE INDEX IF NOT EXISTS idx_interview_sessions_target_company
    ON interview_sessions (target_company)
    WHERE target_company IS NOT NULL;


-- =============================================================================
-- Reference table: interview_type_definitions
-- =============================================================================
-- Documents interview type definitions for application code, admin panels,
-- and reporting dashboards.  Does NOT drive application logic — the CHECK
-- constraint on interview_sessions.interview_type does.
--
-- is_active allows soft-deprecation of a type without:
--   (a) running a new migration to drop a CHECK constraint (which requires
--       a full table scan and an AccessExclusiveLock on interview_sessions), or
--   (b) hard-deleting the definition row (which breaks historical reports that
--       reference the deprecated type_key in old sessions).
-- Workflow: set is_active = FALSE to hide from the UI; the existing sessions
-- with that type remain valid and queryable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS interview_type_definitions (
    type_key          TEXT        PRIMARY KEY,
    display_name      TEXT        NOT NULL,
    description       TEXT        NOT NULL,
    -- question_strategy is used by application routing logic — constrained to
    -- known values so a typo in seed data does not silently break question gen.
    question_strategy TEXT        NOT NULL
        CHECK (question_strategy IN ('resume_driven', 'role_driven', 'behavioral_hr')),
    -- Soft-deprecation flag.  FALSE = hidden from UI, new sessions cannot use
    -- this type.  Historical sessions with this type_key remain valid.
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE interview_type_definitions IS
    'Reference table documenting valid interview_type values. '
    'Does NOT drive application logic — the CHECK constraint on '
    'interview_sessions.interview_type is the authoritative source. '
    'Use is_active = FALSE to soft-deprecate a type without a schema migration. '
    'question_strategy values are constrained to prevent routing mismatches.';

COMMENT ON COLUMN interview_type_definitions.is_active IS
    'FALSE = type is deprecated; hidden from UI and new session creation. '
    'Existing sessions with this type_key remain valid and queryable. '
    'To fully remove a type: first deprecate here, then run a separate '
    'migration to update the interview_sessions CHECK constraint.';

COMMENT ON COLUMN interview_type_definitions.question_strategy IS
    'Routing key used by the question-generation service. '
    'Must match one of: resume_driven, role_driven, behavioral_hr. '
    'Constrained by CHECK to prevent silent routing failures from typos.';


-- ---------------------------------------------------------------------------
-- updated_at trigger for interview_type_definitions
-- Reflects when a type definition was last modified (display_name change,
-- description update, is_active toggle).  Used by admin UIs for cache
-- invalidation and audit visibility.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _set_updated_at_interview_type_definitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_interview_type_definitions_updated_at
    ON interview_type_definitions;

CREATE TRIGGER trg_interview_type_definitions_updated_at
    BEFORE UPDATE ON interview_type_definitions
    FOR EACH ROW
    EXECUTE FUNCTION _set_updated_at_interview_type_definitions();


-- ---------------------------------------------------------------------------
-- Access controls on interview_type_definitions
-- This is configuration data, not user PII — SELECT is safe for authenticated
-- users (needed to populate type-picker dropdowns in the UI).
-- INSERT/UPDATE/DELETE are restricted to the service role (backend only).
-- ---------------------------------------------------------------------------
REVOKE ALL  ON interview_type_definitions FROM PUBLIC;
REVOKE ALL  ON interview_type_definitions FROM anon;
GRANT SELECT ON interview_type_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON interview_type_definitions TO service_role;


-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------
INSERT INTO interview_type_definitions
    (type_key, display_name, description, question_strategy, is_active)
VALUES
    (
        'resume_based',
        'Resume-Based Interview',
        'Questions are generated from the candidate''s PDF resume. Covers projects, skills, experience, ownership, and technical depth.',
        'resume_driven',
        TRUE
    ),
    (
        'role_based',
        'Role-Based Interview',
        'Questions are driven by the target role field. Useful for candidates without a strong resume or for role-specific practice.',
        'role_driven',
        TRUE
    ),
    (
        'hr_round',
        'HR Round Interview',
        'Behavioral, cultural fit, and soft-skill focused questions. Mirrors the HR screening round used by most companies.',
        'behavioral_hr',
        TRUE
    )
ON CONFLICT (type_key) DO UPDATE
    SET display_name      = EXCLUDED.display_name,
        description       = EXCLUDED.description,
        question_strategy = EXCLUDED.question_strategy,
        is_active         = EXCLUDED.is_active;


-- =============================================================================
-- Column comments
-- =============================================================================

COMMENT ON COLUMN interview_sessions.interview_type IS
    'Controls the question-generation strategy. '
    'Values: resume_based (default), role_based, hr_round. '
    'NOT NULL — NULL is not a valid strategy and would silently pass '
    'the IN() CHECK constraint in PostgreSQL.';

COMMENT ON COLUMN interview_sessions.target_role IS
    'The job role the candidate is targeting. '
    'Used by role_based and hr_round sessions to contextualize questions. '
    '1–200 chars when set; NULL for resume_based sessions with no specific role. '
    'Empty string is rejected — use NULL to indicate "not specified".';

COMMENT ON COLUMN interview_sessions.target_company IS
    'Optional company the candidate is targeting. '
    'Enables company-specific question context in future iterations. '
    '1–200 chars when set; NULL when not specified. '
    'Empty string is rejected — use NULL to indicate "not specified".';