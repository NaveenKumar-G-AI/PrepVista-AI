-- Additive V2 practice storage. Session orchestration uses existing runtime_state
-- JSONB, so historical sessions/reports need no backfill or schema rewrite.
CREATE TABLE IF NOT EXISTS interview_answer_retries (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id VARCHAR(64) NOT NULL,
    request_id VARCHAR(128) NOT NULL,
    answer TEXT NOT NULL CHECK (length(answer) BETWEEN 1 AND 3000),
    comparison JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, request_id)
);
CREATE INDEX IF NOT EXISTS interview_retries_owner ON interview_answer_retries(user_id, created_at DESC);
ALTER TABLE interview_answer_retries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS interview_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    story JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS interview_stories_owner ON interview_stories(user_id, created_at DESC);
ALTER TABLE interview_stories ENABLE ROW LEVEL SECURITY;
-- No browser policies: authenticated, owner-scoped FastAPI endpoints only.
