-- Operator recovery receipts contain no student/source identifiers or payloads.
-- Verify the target ledger before applying this locally allocated number.
CREATE TABLE unified_evidence_recovery_audit (
    request_id UUID PRIMARY KEY,
    manifest_sha256 TEXT NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
    target_sha256 TEXT NOT NULL CHECK(target_sha256 ~ '^[a-f0-9]{64}$'),
    ticket_ref TEXT NOT NULL CHECK(ticket_ref ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
    database_role TEXT NOT NULL DEFAULT current_user,
    retried_count INTEGER NOT NULL CHECK(retried_count BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE unified_evidence_recovery_audit ENABLE ROW LEVEL SECURITY;
-- No browser policies. This is not a public maintenance API.
