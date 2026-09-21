-- Repair late-evaluation cache maintenance. No historical data is rewritten at
-- migration time. Use repair_interview_performance_snapshots with explicit owner
-- IDs in bounded transactions after deployment; source sessions remain intact.
-- These are legacy interview-score caches, not qualified unified readiness.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_readiness_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_readiness_tier_check
    CHECK (readiness_tier IN ('not_measured', 'ready', 'almost_ready', 'developing', 'at_risk'));
ALTER TABLE profiles ALTER COLUMN readiness_tier SET DEFAULT 'not_measured';
ALTER TABLE organization_students DROP CONSTRAINT IF EXISTS organization_students_readiness_tier_check;
ALTER TABLE organization_students ADD CONSTRAINT organization_students_readiness_tier_check
    CHECK (readiness_tier IN ('not_measured', 'ready', 'almost_ready', 'developing', 'at_risk'));
ALTER TABLE organization_students ALTER COLUMN readiness_tier SET DEFAULT 'not_measured';

CREATE OR REPLACE FUNCTION compute_readiness_tier(p_score NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_score IS NULL THEN 'not_measured'
        WHEN p_score >= 75 THEN 'ready' WHEN p_score >= 60 THEN 'almost_ready'
        WHEN p_score >= 40 THEN 'developing' ELSE 'at_risk' END;
$$;

-- NULL organization means the owner's personal history across all scopes.
-- Enrollment callers must pass their concrete organization ID. Partial scores
-- describe evaluated answers only and cannot become a complete-session cache.
-- Legacy rows without availability metadata retain their historical semantics.
CREATE OR REPLACE FUNCTION _interview_performance_rollup(p_user_id UUID, p_organization_id UUID)
RETURNS TABLE(first_score NUMERIC, latest_score NUMERIC, completed_count INT,
    stuck_count INT, improved_at TIMESTAMPTZ, latest_delta NUMERIC,
    tier TEXT, risk BOOLEAN)
LANGUAGE sql STABLE AS $$
    WITH history AS (
        SELECT id, final_score, COALESCE(finished_at, created_at) AS observed_at,
            ROW_NUMBER() OVER chronology AS position,
            LAG(final_score) OVER chronology AS previous_score
        FROM interview_sessions
        WHERE user_id = p_user_id AND state = 'FINISHED'
          AND final_score IS NOT NULL
          AND (p_organization_id IS NULL OR organization_id = p_organization_id)
          AND COALESCE(runtime_state #>> '{final_summary,evaluation_status}', 'AVAILABLE') = 'AVAILABLE'
        WINDOW chronology AS (ORDER BY COALESCE(finished_at, created_at), created_at, id)
    ), aggregate AS (
        SELECT (ARRAY_AGG(final_score ORDER BY position))[1] AS first_score,
            (ARRAY_AGG(final_score ORDER BY position DESC))[1] AS latest_score,
            COUNT(*)::INT AS completed_count,
            (COUNT(*) - COALESCE(MAX(position) FILTER (WHERE final_score > previous_score),
                LEAST(COUNT(*), 1)))::INT AS stuck_count,
            MAX(observed_at) FILTER (WHERE
                (CASE WHEN final_score >= 75 THEN 4 WHEN final_score >= 60 THEN 3
                    WHEN final_score >= 40 THEN 2 ELSE 1 END) >
                (CASE WHEN previous_score IS NULL THEN NULL WHEN previous_score >= 75 THEN 4
                    WHEN previous_score >= 60 THEN 3 WHEN previous_score >= 40 THEN 2 ELSE 1 END)) AS improved_at,
            (ARRAY_AGG(final_score - previous_score ORDER BY position DESC))[1] AS latest_delta
        FROM history
    ) SELECT first_score, latest_score, completed_count, stuck_count, improved_at, latest_delta,
        compute_readiness_tier(latest_score),
        COALESCE((latest_score < 40 AND completed_count >= 3) OR stuck_count >= 5 OR latest_score < 30, FALSE)
    FROM aggregate;
$$;

-- Source session rows are never updated here: two evaluation workers can hold
-- different session locks for one owner. Rewriting other sessions under an
-- owner lock would deadlock them. Cache deltas are calculated from source order,
-- not the old session.score_delta field or evaluation arrival order.
CREATE OR REPLACE FUNCTION _refresh_interview_performance(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 46));
    UPDATE profiles p SET first_overall_score = r.first_score,
        latest_overall_score = r.latest_score, total_sessions_completed = r.completed_count,
        sessions_without_improvement = r.stuck_count, last_improvement_at = r.improved_at,
        readiness_tier = r.tier, is_zero_offer_risk = r.risk
    FROM _interview_performance_rollup(p_user_id, NULL) r WHERE p.id = p_user_id;

    UPDATE organization_students os SET first_overall_score = r.first_score,
        latest_overall_score = r.latest_score, total_sessions_completed = r.completed_count,
        sessions_without_improvement = r.stuck_count, last_improvement_at = r.improved_at,
        score_delta = r.latest_delta, readiness_tier = r.tier, is_zero_offer_risk = r.risk
    FROM organization_students owned
    CROSS JOIN LATERAL _interview_performance_rollup(owned.user_id, owned.organization_id) r
    WHERE owned.user_id = p_user_id AND os.id = owned.id;
END;
$$;

-- Remove both paths that copied personal results to every enrollment.
DROP TRIGGER IF EXISTS trg_sync_org_student_performance ON profiles;
DROP TRIGGER IF EXISTS trg_org_student_init_perf ON organization_students;
DROP FUNCTION IF EXISTS _sync_org_student_performance();
DROP FUNCTION IF EXISTS _init_org_student_performance();

-- A new enrollment gets only results explicitly attributed to its organization.
-- Acquire the same owner lock BEFORE insertion; never lock a second session.
CREATE OR REPLACE FUNCTION _init_scoped_interview_performance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::TEXT, 46));
    SELECT * INTO r FROM _interview_performance_rollup(NEW.user_id, NEW.organization_id);
    NEW.first_overall_score := r.first_score;
    NEW.latest_overall_score := r.latest_score;
    NEW.total_sessions_completed := r.completed_count;
    NEW.sessions_without_improvement := r.stuck_count;
    NEW.last_improvement_at := r.improved_at;
    NEW.score_delta := r.latest_delta;
    NEW.readiness_tier := r.tier;
    NEW.is_zero_offer_risk := r.risk;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_org_student_init_perf BEFORE INSERT ON organization_students
    FOR EACH ROW EXECUTE FUNCTION _init_scoped_interview_performance();

-- No incrementing counters. Every relevant change derives one deterministic
-- result from committed source rows, including nullification and deletion.
DROP TRIGGER IF EXISTS trg_session_finished ON interview_sessions;
DROP FUNCTION IF EXISTS _session_finished_sync();
CREATE OR REPLACE FUNCTION _sync_interview_performance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.state = 'FINISHED' THEN PERFORM _refresh_interview_performance(OLD.user_id); END IF;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.state = 'FINISHED' THEN PERFORM _refresh_interview_performance(NEW.user_id); END IF;
    ELSIF (OLD.state = 'FINISHED' OR NEW.state = 'FINISHED') AND (
        OLD.state IS DISTINCT FROM NEW.state OR OLD.final_score IS DISTINCT FROM NEW.final_score
        OR OLD.finished_at IS DISTINCT FROM NEW.finished_at OR OLD.created_at IS DISTINCT FROM NEW.created_at
        OR OLD.organization_id IS DISTINCT FROM NEW.organization_id OR OLD.user_id IS DISTINCT FROM NEW.user_id
        OR (OLD.runtime_state #>> '{final_summary,evaluation_status}')
           IS DISTINCT FROM (NEW.runtime_state #>> '{final_summary,evaluation_status}')) THEN
        -- Deterministic owner lock order also covers a backend ownership repair.
        IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
            PERFORM _refresh_interview_performance(LEAST(OLD.user_id, NEW.user_id));
            PERFORM _refresh_interview_performance(GREATEST(OLD.user_id, NEW.user_id));
        ELSE
            PERFORM _refresh_interview_performance(NEW.user_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER trg_session_finished AFTER INSERT OR UPDATE OR DELETE ON interview_sessions
    FOR EACH ROW EXECUTE FUNCTION _sync_interview_performance();

-- Operator/backend-only historical repair, at most 100 explicitly selected
-- owners. Caller controls transaction/statement timeout and records checkpoints.
-- No automatic full-table backfill or changes to source answers/evaluations.
CREATE OR REPLACE FUNCTION repair_interview_performance_snapshots(p_user_ids UUID[])
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE owner_id UUID; repaired INT := 0;
BEGIN
    IF p_user_ids IS NULL OR cardinality(p_user_ids) NOT BETWEEN 1 AND 100
        OR array_position(p_user_ids, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'SNAPSHOT_REPAIR_REQUIRES_1_TO_100_OWNER_IDS';
    END IF;
    FOR owner_id IN SELECT DISTINCT id FROM unnest(p_user_ids) id ORDER BY id LOOP
        IF EXISTS(SELECT 1 FROM profiles WHERE id = owner_id) THEN
            PERFORM _refresh_interview_performance(owner_id);
            repaired := repaired + 1;
        END IF;
    END LOOP;
    RETURN repaired;
END;
$$;

-- Invoker-rights functions: no bypass of RLS/table permissions. Public execute
-- is still revoked so ordinary authenticated clients cannot force cache writes.
REVOKE ALL ON FUNCTION _interview_performance_rollup(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION _refresh_interview_performance(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION repair_interview_performance_snapshots(UUID[]) FROM PUBLIC;
