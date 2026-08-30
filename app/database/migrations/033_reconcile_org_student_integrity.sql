-- Reconcile organization enrollment counters and historical interview context.
--
-- Some long-lived databases applied an earlier revision of migration 017 before
-- the interview-session analytics bridge was added to that file.  Their
-- schema_migrations row therefore exists even though these two columns do not.
-- Restore the bridge here before any statement below references it.  Keeping
-- this repair in the still-unapplied migration 033 makes startup self-healing
-- without rewriting the checksum of an already-applied migration.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS organization_id UUID
        REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS department_id UUID
        REFERENCES college_departments(id) ON DELETE SET NULL;

-- The same historical schema revision also predates the growth fields from
-- migration 001.  score_delta is read later in this migration, while
-- session_number is used by the session lifecycle and enrollment triggers.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS session_number INT
        CHECK (session_number IS NULL OR session_number > 0);

ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS score_delta NUMERIC(5,2);

-- Guarantee every snapshot column consumed by the reconciliation and its
-- triggers.  These are no-ops on databases that already have the current
-- schema, and make older production databases upgrade atomically.
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS organization_id UUID
        REFERENCES organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS readiness_tier TEXT NOT NULL DEFAULT 'developing'
        CHECK (readiness_tier IN ('ready', 'almost_ready', 'developing', 'at_risk')),
    ADD COLUMN IF NOT EXISTS is_zero_offer_risk BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS latest_overall_score NUMERIC(5,2)
        CHECK (latest_overall_score IS NULL OR latest_overall_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS first_overall_score NUMERIC(5,2)
        CHECK (first_overall_score IS NULL OR first_overall_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS total_sessions_completed INT NOT NULL DEFAULT 0
        CHECK (total_sessions_completed >= 0),
    ADD COLUMN IF NOT EXISTS sessions_without_improvement INT NOT NULL DEFAULT 0
        CHECK (sessions_without_improvement >= 0),
    ADD COLUMN IF NOT EXISTS last_improvement_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS target_score NUMERIC(5,2) NOT NULL DEFAULT 75.0
        CHECK (target_score BETWEEN 0 AND 100);

ALTER TABLE organization_students
    ADD COLUMN IF NOT EXISTS readiness_tier TEXT NOT NULL DEFAULT 'developing'
        CHECK (readiness_tier IN ('ready', 'almost_ready', 'developing', 'at_risk')),
    ADD COLUMN IF NOT EXISTS is_zero_offer_risk BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS latest_overall_score NUMERIC(5,2)
        CHECK (latest_overall_score IS NULL OR latest_overall_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS first_overall_score NUMERIC(5,2)
        CHECK (first_overall_score IS NULL OR first_overall_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS total_sessions_completed INT NOT NULL DEFAULT 0
        CHECK (total_sessions_completed >= 0),
    ADD COLUMN IF NOT EXISTS sessions_without_improvement INT NOT NULL DEFAULT 0
        CHECK (sessions_without_improvement >= 0),
    ADD COLUMN IF NOT EXISTS last_improvement_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS target_score NUMERIC(5,2) NOT NULL DEFAULT 75.0
        CHECK (target_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS score_delta NUMERIC(5,2);

CREATE INDEX IF NOT EXISTS idx_sessions_org
    ON interview_sessions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_org_finished
    ON interview_sessions(organization_id, finished_at DESC)
    WHERE state = 'FINISHED';

CREATE INDEX IF NOT EXISTS idx_sessions_org_dept
    ON interview_sessions(organization_id, department_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_number
    ON interview_sessions(user_id, session_number);

-- organization_students already owns a trigger that recomputes seats_used. Older
-- application code also incremented/decremented the same counter, so production
-- values can be doubled or otherwise drifted. Rebuild them from source-of-truth
-- enrollment rows before the application starts serving the corrected code.
UPDATE organizations o
SET seats_used = counts.seats_used,
    updated_at = NOW()
FROM (
    SELECT o2.id AS organization_id,
           COUNT(os.id) FILTER (WHERE os.status <> 'removed')::int AS seats_used
    FROM organizations o2
    LEFT JOIN organization_students os ON os.organization_id = o2.id
    GROUP BY o2.id
) counts
WHERE o.id = counts.organization_id
  AND o.seats_used IS DISTINCT FROM counts.seats_used;

-- Sessions completed before organization context was introduced have NULL
-- organization_id/department_id. Choose the student's active (or newest
-- non-removed) enrollment deterministically and backfill only missing values.
WITH ranked_enrollments AS (
    SELECT os.user_id,
           os.organization_id,
           os.department_id,
           ROW_NUMBER() OVER (
               PARTITION BY os.user_id
               ORDER BY (os.status = 'active') DESC, os.added_at DESC, os.id DESC
           ) AS position
    FROM organization_students os
    WHERE os.status <> 'removed'
)
UPDATE interview_sessions session
SET organization_id = enrollment.organization_id,
    department_id = COALESCE(session.department_id, enrollment.department_id)
FROM ranked_enrollments enrollment
WHERE enrollment.user_id = session.user_id
  AND enrollment.position = 1
  AND session.organization_id IS NULL;

UPDATE interview_sessions session
SET department_id = enrollment.department_id
FROM organization_students enrollment
WHERE enrollment.user_id = session.user_id
  AND enrollment.organization_id = session.organization_id
  AND enrollment.status <> 'removed'
  AND session.department_id IS NULL;

-- Rebuild historical ordinals and deltas from persisted, scored sessions.
-- This both fills newly restored columns and repairs partially populated rows.
WITH numbered_sessions AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY created_at ASC NULLS LAST, id ASC
           )::int AS calculated_number
    FROM interview_sessions
)
UPDATE interview_sessions session
SET session_number = numbered.calculated_number
FROM numbered_sessions numbered
WHERE session.id = numbered.id
  AND session.session_number IS DISTINCT FROM numbered.calculated_number;

WITH scored_sessions AS (
    SELECT id,
           final_score - LAG(final_score) OVER (
               PARTITION BY user_id
               ORDER BY COALESCE(finished_at, created_at) ASC NULLS LAST,
                        created_at ASC NULLS LAST,
                        id ASC
           ) AS calculated_delta
    FROM interview_sessions
    WHERE state = 'FINISHED'
      AND final_score IS NOT NULL
)
UPDATE interview_sessions session
SET score_delta = COALESCE(scored.calculated_delta, 0)
FROM scored_sessions scored
WHERE session.id = scored.id
  AND session.score_delta IS DISTINCT FROM COALESCE(scored.calculated_delta, 0);

-- Ensure both new and upgraded databases keep these values correct.  The
-- compatibility insert trigger only fills a missing ordinal, so it composes
-- safely with the original trigger on databases where that trigger exists.
CREATE OR REPLACE FUNCTION _ensure_session_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.session_number IS NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
        SELECT COALESCE(MAX(session_number), 0) + 1
        INTO NEW.session_number
        FROM interview_sessions
        WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_sessions_ensure_number
    BEFORE INSERT ON interview_sessions
    FOR EACH ROW EXECUTE FUNCTION _ensure_session_number();

CREATE OR REPLACE FUNCTION compute_readiness_tier(p_score NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_score IS NULL THEN 'developing'
        WHEN p_score >= 75.0 THEN 'ready'
        WHEN p_score >= 60.0 THEN 'almost_ready'
        WHEN p_score >= 40.0 THEN 'developing'
        ELSE 'at_risk'
    END;
$$;

-- Restore the complete finish lifecycle as well as its missing storage column.
-- This preserves accurate profile/enrollment snapshots after every interview.
CREATE OR REPLACE FUNCTION _session_finished_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    previous_score NUMERIC(5,2);
    calculated_delta NUMERIC(5,2);
    new_tier TEXT;
    old_tier TEXT;
    old_stuck_count INT;
    completed_count INT;
    new_stuck_count INT;
    zero_offer_risk BOOLEAN;
BEGIN
    IF NEW.final_score IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 1));

    SELECT final_score
    INTO previous_score
    FROM interview_sessions
    WHERE user_id = NEW.user_id
      AND state = 'FINISHED'
      AND id <> NEW.id
    ORDER BY finished_at DESC NULLS LAST,
             created_at DESC NULLS LAST,
             id DESC
    LIMIT 1;

    calculated_delta := NEW.final_score - COALESCE(previous_score, NEW.final_score);
    NEW.score_delta := calculated_delta;

    SELECT readiness_tier,
           COALESCE(sessions_without_improvement, 0),
           COALESCE(total_sessions_completed, 0)
    INTO old_tier, old_stuck_count, completed_count
    FROM profiles
    WHERE id = NEW.user_id
    FOR UPDATE;

    new_tier := compute_readiness_tier(NEW.final_score);
    new_stuck_count := CASE
        WHEN calculated_delta > 0 THEN 0
        ELSE old_stuck_count + 1
    END;
    zero_offer_risk := (
        (new_tier = 'at_risk' AND completed_count + 1 >= 3)
        OR new_stuck_count >= 5
        OR NEW.final_score < 30.0
    );

    UPDATE profiles
    SET latest_overall_score = NEW.final_score,
        total_sessions_completed = completed_count + 1,
        first_overall_score = CASE
            WHEN completed_count = 0 OR first_overall_score IS NULL
            THEN NEW.final_score
            ELSE first_overall_score
        END,
        readiness_tier = new_tier,
        is_zero_offer_risk = zero_offer_risk,
        sessions_without_improvement = new_stuck_count,
        last_improvement_at = CASE
            WHEN (old_tier = 'at_risk' AND new_tier IN ('developing', 'almost_ready', 'ready'))
              OR (old_tier = 'developing' AND new_tier IN ('almost_ready', 'ready'))
              OR (old_tier = 'almost_ready' AND new_tier = 'ready')
            THEN NOW()
            ELSE last_improvement_at
        END,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_session_finished
    BEFORE UPDATE ON interview_sessions
    FOR EACH ROW
    WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state = 'FINISHED')
    EXECUTE FUNCTION _session_finished_sync();

-- Preserve an explicitly supplied organization. The original trigger replaced
-- it whenever department_id was NULL, which could attach an admin-created
-- session to the student's newest enrollment in a different organization.
CREATE OR REPLACE FUNCTION _assign_session_org_context()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        SELECT os.organization_id, os.department_id
        INTO   NEW.organization_id, NEW.department_id
        FROM   organization_students os
        WHERE  os.user_id = NEW.user_id
          AND  os.status = 'active'
        ORDER  BY os.added_at DESC, os.id DESC
        LIMIT  1;
    ELSIF NEW.department_id IS NULL THEN
        SELECT os.department_id
        INTO   NEW.department_id
        FROM   organization_students os
        WHERE  os.user_id = NEW.user_id
          AND  os.organization_id = NEW.organization_id
          AND  os.status = 'active'
        ORDER  BY os.added_at DESC, os.id DESC
        LIMIT  1;
    END IF;
    RETURN NEW;
END;
$$;

-- Rebuild profile snapshots from the persisted session history.  This is
-- necessary on databases old enough to have lacked the finish lifecycle, and
-- it also corrects any counters that drifted during partial deployments.
WITH session_history AS (
    SELECT session.user_id,
           session.final_score,
           session.score_delta,
           COALESCE(session.finished_at, session.created_at) AS occurred_at,
           ROW_NUMBER() OVER (
               PARTITION BY session.user_id
               ORDER BY COALESCE(session.finished_at, session.created_at) ASC NULLS LAST,
                        session.created_at ASC NULLS LAST,
                        session.id ASC
           )::int AS sequence_number,
           CASE
               WHEN session.final_score >= 75 THEN 4
               WHEN session.final_score >= 60 THEN 3
               WHEN session.final_score >= 40 THEN 2
               ELSE 1
           END AS tier_rank
    FROM interview_sessions session
    WHERE session.state = 'FINISHED'
      AND session.final_score IS NOT NULL
),
tier_history AS (
    SELECT history.*,
           COALESCE(
               LAG(history.tier_rank) OVER (
                   PARTITION BY history.user_id
                   ORDER BY history.sequence_number
               ),
               2
           ) AS previous_tier_rank
    FROM session_history history
),
performance_rollups AS (
    SELECT history.user_id,
           (ARRAY_AGG(history.final_score ORDER BY history.sequence_number ASC))[1]
               AS first_score,
           (ARRAY_AGG(history.final_score ORDER BY history.sequence_number DESC))[1]
               AS latest_score,
           COUNT(*)::int AS completed_count,
           (
               COUNT(*)
               - COALESCE(
                   MAX(history.sequence_number) FILTER (WHERE history.score_delta > 0),
                   0
               )
           )::int AS stuck_count,
           MAX(history.occurred_at) FILTER (
               WHERE history.tier_rank > history.previous_tier_rank
           ) AS latest_tier_improvement
    FROM tier_history history
    GROUP BY history.user_id
)
UPDATE profiles profile
SET first_overall_score = rollup.first_score,
    latest_overall_score = rollup.latest_score,
    total_sessions_completed = rollup.completed_count,
    readiness_tier = compute_readiness_tier(rollup.latest_score),
    sessions_without_improvement = rollup.stuck_count,
    is_zero_offer_risk = (
        (compute_readiness_tier(rollup.latest_score) = 'at_risk'
            AND rollup.completed_count >= 3)
        OR rollup.stuck_count >= 5
        OR rollup.latest_score < 30
    ),
    last_improvement_at = rollup.latest_tier_improvement,
    updated_at = NOW()
FROM performance_rollups rollup
WHERE profile.id = rollup.user_id;

-- Reconcile every non-removed organization enrollment with the rebuilt
-- profile snapshot and the latest session belonging to that same tenant.
WITH latest_sessions AS (
    SELECT DISTINCT ON (session.user_id, session.organization_id)
           session.user_id,
           session.organization_id,
           session.score_delta
    FROM interview_sessions session
    WHERE session.state = 'FINISHED'
      AND session.organization_id IS NOT NULL
      AND session.score_delta IS NOT NULL
    ORDER BY session.user_id,
             session.organization_id,
             session.finished_at DESC NULLS LAST,
             session.created_at DESC,
             session.id DESC
),
enrollment_snapshots AS (
    SELECT enrollment.id AS enrollment_id,
           profile.readiness_tier,
           profile.is_zero_offer_risk,
           profile.latest_overall_score,
           profile.first_overall_score,
           profile.total_sessions_completed,
           profile.sessions_without_improvement,
           profile.last_improvement_at,
           profile.target_score,
           latest_session.score_delta
    FROM organization_students enrollment
    JOIN profiles profile ON profile.id = enrollment.user_id
    LEFT JOIN latest_sessions latest_session
           ON latest_session.user_id = enrollment.user_id
          AND latest_session.organization_id = enrollment.organization_id
    WHERE enrollment.status <> 'removed'
)
UPDATE organization_students os
SET readiness_tier = snapshot.readiness_tier,
    is_zero_offer_risk = snapshot.is_zero_offer_risk,
    latest_overall_score = snapshot.latest_overall_score,
    first_overall_score = snapshot.first_overall_score,
    total_sessions_completed = snapshot.total_sessions_completed,
    sessions_without_improvement = snapshot.sessions_without_improvement,
    last_improvement_at = snapshot.last_improvement_at,
    target_score = snapshot.target_score,
    score_delta = snapshot.score_delta,
    updated_at = NOW()
FROM enrollment_snapshots snapshot
WHERE os.id = snapshot.enrollment_id
  AND (
      os.readiness_tier IS DISTINCT FROM snapshot.readiness_tier
      OR os.is_zero_offer_risk IS DISTINCT FROM snapshot.is_zero_offer_risk
      OR os.latest_overall_score IS DISTINCT FROM snapshot.latest_overall_score
      OR os.first_overall_score IS DISTINCT FROM snapshot.first_overall_score
      OR os.total_sessions_completed IS DISTINCT FROM snapshot.total_sessions_completed
      OR os.sessions_without_improvement IS DISTINCT FROM snapshot.sessions_without_improvement
      OR os.last_improvement_at IS DISTINCT FROM snapshot.last_improvement_at
      OR os.target_score IS DISTINCT FROM snapshot.target_score
      OR os.score_delta IS DISTINCT FROM snapshot.score_delta
  );
