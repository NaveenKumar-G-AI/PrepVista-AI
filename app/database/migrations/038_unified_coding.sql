-- Additive coding/journey storage. Verify 038 is free in the deployed ledger
-- before release. No legacy scores, entitlements or identity mappings change.
CREATE TABLE coding_workspaces (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    state JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(state::text) <= 2200000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE coding_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    digest TEXT NOT NULL,
    challenge_id VARCHAR(160) NOT NULL,
    language VARCHAR(20) NOT NULL,
    content JSONB NOT NULL CHECK (octet_length(content::text) <= 180000),
    authority TEXT NOT NULL DEFAULT 'CLIENT_REPORTED' CHECK (authority = 'CLIENT_REPORTED'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, request_id)
);
CREATE INDEX coding_artifacts_owner ON coding_artifacts(user_id, created_at DESC);
CREATE TABLE coding_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    digest TEXT NOT NULL,
    base_revision BIGINT NOT NULL,
    merged_state JSONB NOT NULL,
    report JSONB NOT NULL,
    committed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, digest, base_revision)
);
CREATE TABLE unified_evidence_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source_module TEXT NOT NULL CHECK (source_module IN ('coding', 'interview')),
    source_id UUID NOT NULL,
    source_version BIGINT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, source_module, source_id, source_version)
);
CREATE INDEX unified_evidence_owner ON unified_evidence_events(user_id, id);
CREATE INDEX unified_evidence_pending ON unified_evidence_events(retry_after,id) WHERE processed_at IS NULL AND attempts < 5;
CREATE TABLE unified_observations (
    event_id BIGINT PRIMARY KEY REFERENCES unified_evidence_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source_module TEXT NOT NULL,
    source_id UUID NOT NULL,
    adapter_version INTEGER NOT NULL,
    observation JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX unified_observations_owner ON unified_observations(user_id,event_id);
CREATE TABLE unified_deletion_tombstones (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source_module TEXT NOT NULL,
    source_id UUID NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id,source_module,source_id)
);
CREATE TABLE unified_readiness_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    input_digest TEXT NOT NULL,
    watermark BIGINT NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role, policy_version, input_digest)
);
CREATE INDEX unified_readiness_owner ON unified_readiness_snapshots(user_id, created_at DESC);
CREATE TABLE practice_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    mission_key TEXT NOT NULL,
    objective JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','LAUNCHED','DEFERRED','DISMISSED','COMPLETED')),
    defer_until TIMESTAMPTZ,
    decision_note VARCHAR(500) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    launched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completion_source_id UUID,
    UNIQUE(user_id,mission_key)
);
CREATE TABLE coding_ai_requests (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    digest TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('RESERVED', 'COMPLETED', 'FAILED', 'EXPIRED')),
    response JSONB,
    provider VARCHAR(40) NOT NULL DEFAULT 'unknown',
    model VARCHAR(100) NOT NULL DEFAULT 'unknown',
    input_tokens BIGINT CHECK(input_tokens >= 0),
    output_tokens BIGINT CHECK(output_tokens >= 0),
    total_tokens BIGINT CHECK(total_tokens >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY(user_id, request_id)
);
ALTER TABLE interview_answer_retries ADD COLUMN mission_id UUID REFERENCES practice_missions(id) ON DELETE SET NULL;
CREATE INDEX coding_ai_daily ON coding_ai_requests(user_id, created_at);
CREATE INDEX coding_ai_global_daily ON coding_ai_requests(created_at);
CREATE INDEX coding_ai_reserved ON coding_ai_requests(user_id) WHERE state='RESERVED';
CREATE TABLE unified_sharing (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id, organization_id)
);
-- No direct browser policies. Existing owner-scoped FastAPI authorization is
-- required even for privileged DB connections. Cascades cover derived data.
ALTER TABLE coding_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_deletion_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_readiness_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_sharing ENABLE ROW LEVEL SECURITY;

-- The interview domain result and its small outbox event commit atomically.
-- This adds no HTTP/provider dependency to a live answer or finish operation.
CREATE FUNCTION capture_unified_interview_evidence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state = 'FINISHED' AND (OLD.state IS DISTINCT FROM 'FINISHED') AND
       (EXISTS(SELECT 1 FROM coding_workspaces WHERE user_id=NEW.user_id) OR
        EXISTS(SELECT 1 FROM coding_artifacts WHERE user_id=NEW.user_id)) THEN
        INSERT INTO unified_evidence_events(user_id, source_module, source_id, payload)
        VALUES(NEW.user_id, 'interview', NEW.id,
            jsonb_build_object('authority', 'INTERVIEW_TEXT_SIGNAL', 'report_available',
                COALESCE(NEW.runtime_state::jsonb ? 'evidence_report_v2', false)))
        ON CONFLICT DO NOTHING;
        UPDATE practice_missions SET status='COMPLETED',completed_at=NOW(),completion_source_id=NEW.id
        WHERE user_id=NEW.user_id AND status='LAUNCHED'
          AND objective->>'completion'='INTERVIEW_FINISHED'
          AND id::text=NEW.runtime_state::jsonb->'orchestrator_v2'->>'mission_id';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER unified_interview_finished AFTER UPDATE OF state ON interview_sessions
FOR EACH ROW EXECUTE FUNCTION capture_unified_interview_evidence();

-- Erasure invalidates all affected derived snapshots. A queued/replayed event
-- cannot reconstruct a deleted artifact/session. Account cascades need no new
-- tombstone because the canonical profile no longer exists.
CREATE FUNCTION erase_unified_source() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE module_name TEXT := TG_ARGV[0];
BEGIN
    PERFORM id FROM profiles WHERE id=OLD.user_id FOR UPDATE;
    IF FOUND AND (EXISTS(SELECT 1 FROM coding_workspaces WHERE user_id=OLD.user_id) OR
                  EXISTS(SELECT 1 FROM coding_artifacts WHERE user_id=OLD.user_id)) THEN
        INSERT INTO unified_deletion_tombstones(user_id,source_module,source_id)
            VALUES(OLD.user_id,module_name,OLD.id) ON CONFLICT DO NOTHING;
    END IF;
    DELETE FROM unified_readiness_snapshots WHERE user_id=OLD.user_id;
    DELETE FROM practice_missions WHERE user_id=OLD.user_id AND
        (completion_source_id=OLD.id OR objective->>'artifact_id'=OLD.id::text);
    DELETE FROM unified_evidence_events WHERE user_id=OLD.user_id AND source_module=module_name AND source_id=OLD.id;
    RETURN OLD;
END $$;
CREATE TRIGGER unified_coding_erasure BEFORE DELETE ON coding_artifacts
FOR EACH ROW EXECUTE FUNCTION erase_unified_source('coding');
CREATE TRIGGER unified_interview_erasure BEFORE DELETE ON interview_sessions
FOR EACH ROW EXECUTE FUNCTION erase_unified_source('interview');

CREATE FUNCTION capture_unified_retry() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM coding_workspaces WHERE user_id=NEW.user_id) AND
       NOT EXISTS(SELECT 1 FROM coding_artifacts WHERE user_id=NEW.user_id) THEN
        RETURN NEW;
    END IF;
    INSERT INTO unified_evidence_events(user_id,source_module,source_id,source_version,payload)
        VALUES(NEW.user_id,'interview',NEW.session_id,NEW.id+1,
            jsonb_build_object('authority','INTERVIEW_TEXT_SIGNAL','retry_id',NEW.id)) ON CONFLICT DO NOTHING;
    UPDATE practice_missions SET status='COMPLETED',completed_at=NOW(),completion_source_id=NEW.session_id
        WHERE id=NEW.mission_id AND user_id=NEW.user_id AND status='LAUNCHED' AND objective->>'completion'='ANSWER_RETRIED';
    RETURN NEW;
END $$;
CREATE TRIGGER unified_retry_saved AFTER INSERT ON interview_answer_retries
FOR EACH ROW EXECUTE FUNCTION capture_unified_retry();

CREATE FUNCTION erase_unified_retry() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM id FROM profiles WHERE id=OLD.user_id FOR UPDATE;
    IF FOUND AND (EXISTS(SELECT 1 FROM coding_workspaces WHERE user_id=OLD.user_id) OR
                  EXISTS(SELECT 1 FROM coding_artifacts WHERE user_id=OLD.user_id)) THEN
        -- Conservative erasure: invalidate the interview's derived preparation
        -- observations when a constituent retry is removed. Original module
        -- reports retain their own retention policy; queued events cannot restore
        -- this derived source automatically.
        INSERT INTO unified_deletion_tombstones(user_id,source_module,source_id)
            VALUES(OLD.user_id,'interview',OLD.session_id) ON CONFLICT DO NOTHING;
    END IF;
    DELETE FROM unified_readiness_snapshots WHERE user_id=OLD.user_id;
    DELETE FROM unified_evidence_events WHERE user_id=OLD.user_id AND source_module='interview' AND source_id=OLD.session_id;
    RETURN OLD;
END $$;
CREATE TRIGGER unified_retry_erasure BEFORE DELETE ON interview_answer_retries
FOR EACH ROW EXECUTE FUNCTION erase_unified_retry();
