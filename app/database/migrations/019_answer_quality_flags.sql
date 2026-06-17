-- ════════════════════════════════════════════════════════════════════════════
-- 019_answer_quality_flags.sql
--
-- Creates the answer_quality_flags analytics table.
--
-- WHY THIS EXISTS AS A SEPARATE MIGRATION
-- ---------------------------------------
-- answer_quality_flags was authored in 001_initial_schema.sql, but added to that
-- file *after* 001 had already been applied to existing databases. The migration
-- runner records each file's version in schema_migrations and never re-executes
-- an already-applied file (it only logs a checksum-drift warning). So databases
-- that applied 001 before this table was added never received it, and the org
-- analytics endpoints fail at runtime with:
--
--     relation "answer_quality_flags" does not exist  (UndefinedTableError)
--     -> GET /org/my/analytics            (org_college_analytics.py)
--     -> GET /org/my/analytics/performance(org_college_analytics.py)
--     -> GET /org/my/analytics/readiness  (org_college_analytics.py)
--
-- SCOPE NOTE
-- ----------
-- This migration deliberately creates ONLY answer_quality_flags. Its sole
-- dependencies are interview_sessions and profiles, which exist in every
-- environment. It does NOT touch cohort_snapshots: that table has a foreign key
-- to institutions(id), and this production database uses the organizations /
-- college_* schema (migration 017), not the institutions schema — so referencing
-- institutions here would fail with `relation "institutions" does not exist` and
-- roll back the whole migration. cohort_snapshots is not read by any router, so
-- it is simply not created here.
--
-- Idempotent: re-runnable, and a no-op on any database that already has the
-- table. RLS policy creation is best-effort (each guarded by its own
-- subtransaction) so a missing helper function or column can never abort the
-- migration — the table (the actual fix) is always created.
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

-- ── Index (idempotent) ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_answer_quality_user
    ON answer_quality_flags(user_id, created_at DESC);

-- ── Row level security (best-effort, never fatal) ───────────────────────────
-- The backend reads this table over a privileged pool that bypasses RLS; these
-- policies are defense-in-depth for direct Supabase-client access. Enabling RLS
-- with no policies is a safe deny-by-default for non-privileged clients.
ALTER TABLE answer_quality_flags ENABLE ROW LEVEL SECURITY;

-- Each policy is created inside its own subtransaction (BEGIN ... EXCEPTION) so
-- that a missing helper function (auth.uid, admin_can_view_department) or a
-- missing profiles.institution_id column can never abort the migration. The
-- table above is already created and committed regardless.
DO $$
BEGIN
    BEGIN
        IF to_regprocedure('auth.uid()') IS NOT NULL THEN
            DROP POLICY IF EXISTS aqf_self ON answer_quality_flags;
            CREATE POLICY aqf_self ON answer_quality_flags
                FOR SELECT USING (user_id = auth.uid());
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'aqf_self policy skipped: %', SQLERRM;
    END;

    BEGIN
        IF to_regprocedure('admin_can_view_department(uuid)') IS NOT NULL THEN
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
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'aqf_institution_admin policy skipped: %', SQLERRM;
    END;
END $$;
