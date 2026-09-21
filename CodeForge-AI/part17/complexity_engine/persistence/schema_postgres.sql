-- Complexity Analysis Engine — production schema (Postgres / Supabase)
--
-- TEMPLATE, not verified against your real schema (this build has no
-- access to your actual database). Two things you MUST adjust before
-- running this:
--   1. The `REFERENCES` targets marked "-- ADJUST ME" below, to match
--      your actual users/submissions/problems table names and column
--      types (this assumes uuid primary keys and a Supabase-style
--      `auth.users` table, which is the common case but not guaranteed
--      to be yours).
--   2. The RLS policies' `auth.uid()` calls assume Supabase Auth. If
--      you're not on Supabase Auth, replace with your own current-user
--      mechanism.
--
-- Only three new tables are added, exactly as the spec names them.
-- Nothing here touches or duplicates any existing table.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS complexity_assessments (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id      uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE, -- ADJUST ME
    user_id            uuid NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE, -- ADJUST ME
    problem_id         uuid REFERENCES problems(id) ON DELETE SET NULL,           -- ADJUST ME
    language           text NOT NULL,
    function_name      text NOT NULL,
    source_hash        text NOT NULL,
    analysis_version   text NOT NULL,
    time_complexity    text NOT NULL,
    space_complexity   text NOT NULL,
    best_case          text,
    dominant_cost      text NOT NULL,
    confidence         text NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW','UNKNOWN')),
    constraint_risk     text,
    is_recursive       boolean NOT NULL DEFAULT false,
    report_json        jsonb NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_hash)  -- idempotency: one row per immutable (submission, analysis_version) pair
);
CREATE INDEX IF NOT EXISTS idx_assessments_user     ON complexity_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_submission ON complexity_assessments(submission_id);

CREATE TABLE IF NOT EXISTS complexity_findings (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id  uuid NOT NULL REFERENCES complexity_assessments(id) ON DELETE CASCADE,
    kind           text NOT NULL,
    description    text NOT NULL,
    confidence     text NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW','UNKNOWN')),
    line           integer,
    col            integer,
    function_name  text
);
CREATE INDEX IF NOT EXISTS idx_findings_assessment ON complexity_findings(assessment_id);

CREATE TABLE IF NOT EXISTS complexity_history (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- ADJUST ME
    problem_id                uuid NOT NULL REFERENCES problems(id)  ON DELETE CASCADE,  -- ADJUST ME
    assessment_id             uuid NOT NULL REFERENCES complexity_assessments(id) ON DELETE CASCADE,
    time_complexity_rank      double precision NOT NULL,
    time_complexity_notation  text NOT NULL,
    attempt_number            integer NOT NULL,
    created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_user_problem ON complexity_history(user_id, problem_id, attempt_number);

-- ---------------------------------------------------------------------
-- RLS: a student can read/write only their own rows. No student can
-- read another student's analysis. Admin/service-role access should go
-- through your existing service-role key, which bypasses RLS by design
-- — do not add a broad "admins can see everything" policy here unless
-- you already have an equivalent pattern elsewhere in your schema.
-- ---------------------------------------------------------------------

ALTER TABLE complexity_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE complexity_findings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE complexity_history     ENABLE ROW LEVEL SECURITY;

CREATE POLICY complexity_assessments_owner_select ON complexity_assessments
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY complexity_assessments_owner_insert ON complexity_assessments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE/DELETE policy is defined: assessments are immutable analysis
-- records tied to an immutable submission. If you need corrections, add
-- a new assessment (new analysis_version) rather than mutating history.

CREATE POLICY complexity_findings_owner_select ON complexity_findings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM complexity_assessments a
            WHERE a.id = complexity_findings.assessment_id AND a.user_id = auth.uid()
        )
    );

CREATE POLICY complexity_history_owner_select ON complexity_history
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY complexity_history_owner_insert ON complexity_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);
