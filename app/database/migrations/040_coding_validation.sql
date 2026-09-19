-- Qualified isolated execution is independently gated. Verify this migration
-- number and all prerequisite checksums against the target before deployment.
ALTER TABLE coding_artifacts ADD CONSTRAINT coding_artifacts_owner_id_unique UNIQUE(user_id,id);
CREATE TABLE coding_validation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL,
    request_id UUID NOT NULL,
    suite_id TEXT NOT NULL,
    suite_sha256 TEXT NOT NULL CHECK(length(suite_sha256)=64),
    code_sha256 TEXT NOT NULL CHECK(length(code_sha256)=64),
    qualification_id TEXT NOT NULL,
    runner_image TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','RUNNING','COMPLETED','UNAVAILABLE')),
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    result JSONB CHECK(result IS NULL OR octet_length(result::text) <= 16000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(user_id,request_id),
    FOREIGN KEY(user_id,artifact_id) REFERENCES coding_artifacts(user_id,id) ON DELETE CASCADE,
    CHECK((state='COMPLETED') = (result IS NOT NULL))
);
CREATE INDEX coding_validation_owner ON coding_validation_jobs(user_id,created_at DESC);
CREATE INDEX coding_validation_queue ON coding_validation_jobs(created_at,id) WHERE state IN ('QUEUED','RUNNING');
ALTER TABLE coding_validation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_evidence_events DROP CONSTRAINT unified_evidence_events_source_module_check;
ALTER TABLE unified_evidence_events ADD CONSTRAINT unified_evidence_events_source_module_check
    CHECK(source_module IN ('coding','interview','coding_validation'));
CREATE FUNCTION capture_coding_validation_evidence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state='COMPLETED' AND OLD.state IS DISTINCT FROM 'COMPLETED' THEN
        INSERT INTO unified_evidence_events(user_id,source_module,source_id,payload)
            VALUES(NEW.user_id,'coding_validation',NEW.id,'{"authority":"ISOLATED_SERVER_TEST"}'::jsonb)
            ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER coding_validation_completed AFTER UPDATE OF state ON coding_validation_jobs
FOR EACH ROW EXECUTE FUNCTION capture_coding_validation_evidence();
CREATE TRIGGER coding_validation_erasure BEFORE DELETE ON coding_validation_jobs
FOR EACH ROW EXECUTE FUNCTION erase_unified_source('coding_validation');
