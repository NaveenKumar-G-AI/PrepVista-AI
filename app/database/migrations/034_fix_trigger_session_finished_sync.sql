-- Fix: _session_finished_sync must update organization_students as well as profiles.
-- The previous migration (033) added performance columns to organization_students
-- to enable org-scoped filtering without joining profiles, but failed to update
-- the trigger that maintains them.

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

    -- NEW: Also update the active organization_students record
    IF NEW.organization_id IS NOT NULL THEN
        UPDATE organization_students
        SET latest_overall_score = NEW.final_score,
            total_sessions_completed = total_sessions_completed + 1,
            first_overall_score = CASE
                WHEN total_sessions_completed = 0 OR first_overall_score IS NULL
                THEN NEW.final_score
                ELSE first_overall_score
            END,
            readiness_tier = new_tier,
            is_zero_offer_risk = zero_offer_risk,
            sessions_without_improvement = new_stuck_count,
            last_improvement_at = CASE
                WHEN (readiness_tier = 'at_risk' AND new_tier IN ('developing', 'almost_ready', 'ready'))
                  OR (readiness_tier = 'developing' AND new_tier IN ('almost_ready', 'ready'))
                  OR (readiness_tier = 'almost_ready' AND new_tier = 'ready')
                THEN NOW()
                ELSE last_improvement_at
            END,
            score_delta = calculated_delta,
            updated_at = NOW()
        WHERE user_id = NEW.user_id 
          AND organization_id = NEW.organization_id 
          AND status = 'active';
    END IF;

    RETURN NEW;
END;
$$;
