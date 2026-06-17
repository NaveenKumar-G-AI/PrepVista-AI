-- ════════════════════════════════════════════════════════════════════════════
-- 019_answer_quality_flags.sql
--
-- Creates the answer_quality_flags and cohort_snapshots analytics tables.
--
-- WHY THIS EXISTS AS A SEPARATE MIGRATION
-- ---------------------------------------
-- These two tables were authored in 001_initial_schema.sql, but were added to
-- that file *after* 001 had already been applied to existing databases. The
-- migration runner records each file's version in schema_migrations and never
-- re-executes an already-applied file (it only logs a checksum-drift warning).
-- As a result, environments that applied 001 before these tables were added
-- never received them, and the org analytics endpoints fail at runtime with:
--
--     relation "answer_quality_flags" does not exist  (UndefinedTableError)
--     -> GET /org/my/analytics            (org_college_analytics.py:228)
--     -> GET /org/my/analytics/performance(org_college_analytics.py:326)
--     -> GET /org/my/analytics/readiness  (org_college_analytics.py:629)
--
-- This incremental migration creates the objects on databases that are missing
-- them. It is fully idempotent: on a fresh database (where 001 already created
-- these objects) every statement is a no-op.
--
-- Definitions are kept byte-for-byte consistent with 001_initial_schema.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── answer_quality_flags ────────────────────────────────────────────────────
-- Per-session answer quality pattern flags. One row per completed session.
CREATE TABLE IF NOT EXISTS answer_quality_flags (
    id                        BIGSERIAL    PRIMARY KEY,
    session_id                UUID         NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    user_id                   UUID         NOT NULL REFERENCES profiles(id)           ON DELETE CASCADE,
    filler_word_ratio         NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (filler_word_ratio >= 0 AND filler_word_ratio <= 1),
    star_usage_score          NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (star_usage_score >= 0 AND star_usage_score <= 10),
    evasiveness_score         NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (evasiveness_score >= 0 AND evasiveness_score <= 10),
    tone_score                NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (tone_score >= 0 AND tone_score <= 10),
    repetition_ratio          NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (repetition_ratio >= 0 AND repetition_ratio <= 1),
    confidence_signal_score   NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (confidence_signal_score >= 0 AND confidence_signal_score <= 10),
    grammar_score             NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (grammar_score >= 0 AND grammar_score <= 10),
    vocabulary_richness       NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (vocabulary_richness >= 0 AND vocabulary_richness <= 1),
    answer_completeness_ratio NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (answer_completeness_ratio >= 0 AND answer_completeness_ratio <= 1),
    created_at                TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (session_id)
);

-- ── cohort_snapshots ────────────────────────────────────────────────────────
-- Pre-computed cohort-level snapshots. Not yet read by any router today, but
-- created here to keep prod schema consistent with 001 and avoid a future
-- failure when the snapshot job lands.
CREATE TABLE IF NOT EXISTS cohort_snapshots (
    id                   BIGSERIAL    PRIMARY KEY,
    institution_id       UUID         NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    snapshot_date        DATE         NOT NULL,
    department           TEXT         NOT NULL DEFAULT '',
    batch                TEXT         NOT NULL DEFAULT '',
    graduation_year      INT,
    total_students       INT          NOT NULL DEFAULT 0,
    active_students      INT          NOT NULL DEFAULT 0,
    total_sessions       INT          NOT NULL DEFAULT 0,
    avg_overall_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
    avg_communication    NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_technical_depth  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_problem_solving  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_confidence       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_structure_star   NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_vocabulary       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_vocal_delivery   NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_leadership       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_teamwork         NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_adaptability     NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_reasoning        NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_conciseness      NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_professionalism  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_role_fit         NUMERIC(4,2) NOT NULL DEFAULT 0,
    ready_count          INT          NOT NULL DEFAULT 0,
    almost_ready_count   INT          NOT NULL DEFAULT 0,
    developing_count     INT          NOT NULL DEFAULT 0,
    at_risk_count        INT          NOT NULL DEFAULT 0,
    avg_score_delta      NUMERIC(5,2),
    avg_slope            NUMERIC(5,3),
    created_at           TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (institution_id, snapshot_date, department, batch)
);

-- ── Indexes (idempotent) ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_answer_quality_user
    ON answer_quality_flags(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cohort_snapshots_institution_date
    ON cohort_snapshots(institution_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_cohort_snapshots_dept
    ON cohort_snapshots(institution_id, department, snapshot_date DESC);

-- ── Row level security ──────────────────────────────────────────────────────
-- Idempotent. The backend reads these tables over a privileged pool that is
-- not gated by RLS; these policies are defense-in-depth for direct
-- Supabase-client access and mirror 001.
ALTER TABLE answer_quality_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_snapshots     ENABLE ROW LEVEL SECURITY;

-- Policies reference helper functions defined in 001. Guard their creation so
-- that an environment missing those helpers still gets the tables (the actual
-- fix) rather than failing the whole migration. On a normal database the
-- helpers exist and the policies are (re)created to match 001 exactly.
DO $$
BEGIN
    IF to_regprocedure('auth.uid()') IS NOT NULL
       AND to_regprocedure('admin_can_view_department(uuid)') IS NOT NULL THEN

        DROP POLICY IF EXISTS aqf_self ON answer_quality_flags;
        CREATE POLICY aqf_self ON answer_quality_flags
            FOR SELECT USING (user_id = auth.uid());

        DROP POLICY IF EXISTS aqf_institution_admin ON answer_quality_flags;
        CREATE POLICY aqf_institution_admin ON answer_quality_flags
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE  p.id             = answer_quality_flags.user_id
                      AND  p.institution_id IS NOT NULL
                      AND  admin_can_view_department(p.institution_id, p.department)
                )
            );
    ELSE
        RAISE NOTICE 'Skipping answer_quality_flags RLS policies: helper functions not present';
    END IF;

    IF to_regprocedure('is_institution_admin(uuid)') IS NOT NULL THEN
        DROP POLICY IF EXISTS cohort_snapshots_admin_select ON cohort_snapshots;
        CREATE POLICY cohort_snapshots_admin_select ON cohort_snapshots
            FOR SELECT USING (is_institution_admin(institution_id));

        DROP POLICY IF EXISTS cohort_snapshots_admin_insert ON cohort_snapshots;
        CREATE POLICY cohort_snapshots_admin_insert ON cohort_snapshots
            FOR INSERT WITH CHECK (is_institution_admin(institution_id));

        DROP POLICY IF EXISTS cohort_snapshots_admin_update ON cohort_snapshots;
        CREATE POLICY cohort_snapshots_admin_update ON cohort_snapshots
            FOR UPDATE USING (is_institution_admin(institution_id));
    ELSE
        RAISE NOTICE 'Skipping cohort_snapshots RLS policies: helper functions not present';
    END IF;
END $$;
