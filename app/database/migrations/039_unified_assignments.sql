-- Additive bridge to the canonical intervention tables from 029/031.
-- Verify the target migration ledger before deploying; flags do not gate DDL.
CREATE TABLE unified_assignment_batches (
    intervention_id UUID PRIMARY KEY REFERENCES intervention(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    request_digest TEXT NOT NULL,
    task_kind TEXT NOT NULL CHECK(task_kind IN ('CODING_PRACTICE','PROJECT','INTERVIEW')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, request_id)
);
ALTER TABLE practice_missions ADD CONSTRAINT practice_missions_owner_id_unique UNIQUE(user_id,id);
ALTER TABLE intervention_assignment ADD CONSTRAINT intervention_assignment_owner_id_unique UNIQUE(student_id,id);
CREATE TABLE unified_assignment_links (
    assignment_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    mission_id UUID UNIQUE,
    accepted_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    FOREIGN KEY(user_id,assignment_id) REFERENCES intervention_assignment(student_id,id) ON DELETE CASCADE,
    FOREIGN KEY(user_id,mission_id) REFERENCES practice_missions(user_id,id) ON DELETE SET NULL (mission_id)
);
ALTER TABLE unified_assignment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_assignment_links ENABLE ROW LEVEL SECURITY;
-- These legacy tables are now part of the private assignment workflow. Browser
-- roles must not bypass the API's membership and completion-sharing decisions.
ALTER TABLE intervention ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Completion reflects committed activity, never an administrative click or grade.
-- This trigger performs no remote call and exposes no artifact/source identifier.
CREATE FUNCTION complete_unified_assignment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status='COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
        PERFORM os.user_id FROM organization_students os
            JOIN organizations o ON o.id=os.organization_id
            JOIN intervention i ON i.institution_id=o.id
            JOIN intervention_assignment a ON a.intervention_id=i.id AND a.student_id=os.user_id
            JOIN unified_assignment_links l ON l.assignment_id=a.id
            WHERE l.mission_id=NEW.id AND l.user_id=NEW.user_id AND l.accepted_at IS NOT NULL
              AND l.withdrawn_at IS NULL AND os.status='active' AND o.status='active'
            FOR SHARE OF os,o;
        IF FOUND THEN
            UPDATE intervention_assignment a SET status='COMPLETED',completed_at=NOW()
            FROM unified_assignment_links l WHERE l.assignment_id=a.id AND l.mission_id=NEW.id
                AND l.user_id=NEW.user_id AND l.withdrawn_at IS NULL
                AND a.status IN ('ACKNOWLEDGED','IN_PROGRESS','OVERDUE');
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER unified_assignment_completed AFTER UPDATE OF status ON practice_missions
FOR EACH ROW EXECUTE FUNCTION complete_unified_assignment();

CREATE FUNCTION erase_unified_assignment_completion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE intervention_assignment a SET status='CANCELLED',completed_at=NULL
        FROM unified_assignment_links l WHERE l.assignment_id=a.id AND l.mission_id=OLD.id;
    RETURN OLD;
END $$;
CREATE TRIGGER unified_assignment_source_erased BEFORE DELETE ON practice_missions
FOR EACH ROW EXECUTE FUNCTION erase_unified_assignment_completion();
