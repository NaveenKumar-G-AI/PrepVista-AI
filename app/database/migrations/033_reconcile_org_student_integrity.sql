-- Reconcile organization enrollment counters and historical interview context.
--
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

-- Reconcile the denormalized organization_students performance snapshot with
-- profiles, its documented source of truth. This repairs rows created while an
-- older trigger or partially deployed worker was active.
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
)
UPDATE organization_students os
SET readiness_tier = p.readiness_tier,
    is_zero_offer_risk = p.is_zero_offer_risk,
    latest_overall_score = p.latest_overall_score,
    first_overall_score = p.first_overall_score,
    total_sessions_completed = p.total_sessions_completed,
    sessions_without_improvement = p.sessions_without_improvement,
    last_improvement_at = p.last_improvement_at,
    target_score = p.target_score,
    score_delta = latest_session.score_delta,
    updated_at = NOW()
FROM profiles p
LEFT JOIN latest_sessions latest_session
       ON latest_session.user_id = p.id
      AND latest_session.organization_id = p.organization_id
WHERE os.user_id = p.id
  AND os.organization_id = p.organization_id
  AND os.status <> 'removed'
  AND (
      os.readiness_tier IS DISTINCT FROM p.readiness_tier
      OR os.is_zero_offer_risk IS DISTINCT FROM p.is_zero_offer_risk
      OR os.latest_overall_score IS DISTINCT FROM p.latest_overall_score
      OR os.first_overall_score IS DISTINCT FROM p.first_overall_score
      OR os.total_sessions_completed IS DISTINCT FROM p.total_sessions_completed
      OR os.sessions_without_improvement IS DISTINCT FROM p.sessions_without_improvement
      OR os.last_improvement_at IS DISTINCT FROM p.last_improvement_at
      OR os.target_score IS DISTINCT FROM p.target_score
      OR os.score_delta IS DISTINCT FROM latest_session.score_delta
  );
