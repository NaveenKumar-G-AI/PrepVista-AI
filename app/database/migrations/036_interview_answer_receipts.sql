-- Each answer mutation and its replay receipt commit in the same transaction.
CREATE TABLE IF NOT EXISTS interview_answer_receipts (
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    request_id VARCHAR(128) NOT NULL,
    fingerprint CHAR(64) NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, request_id)
);
ALTER TABLE interview_answer_receipts ENABLE ROW LEVEL SECURITY;
-- Server database access only; no direct anonymous/browser access policies.
