-- Durable evaluation work is created in the same transaction as an answer.
-- Historical answers are queued only through explicit owner retry/backfill.
ALTER TABLE question_evaluations ADD COLUMN IF NOT EXISTS evaluation_version TEXT;
ALTER TABLE question_evaluations ADD COLUMN IF NOT EXISTS prompt_version TEXT;
ALTER TABLE question_evaluations ADD COLUMN IF NOT EXISTS provider_model TEXT;

CREATE TABLE IF NOT EXISTS interview_evaluation_jobs (
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    turn_number INT NOT NULL CHECK (turn_number > 0),
    source_message_id BIGINT NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','RUNNING','AVAILABLE','FAILED')),
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    lease_id UUID,
    retry_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_code TEXT,
    answer_duration_seconds INT,
    PRIMARY KEY (session_id,turn_number)
);
ALTER TABLE interview_evaluation_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_interview_eval_pending ON interview_evaluation_jobs(retry_after)
    WHERE state IN ('PENDING','RUNNING');

CREATE OR REPLACE FUNCTION enqueue_interview_evaluation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.role='user' AND NEW.turn_number>0 AND length(trim(NEW.content))>0
       AND NEW.content NOT IN ('[NO_ANSWER_TIMEOUT]', '[SYSTEM_DURATION_EXPIRED]', '__start__', '[NO_ANSWER]','[START_INTERVIEW]','[SYSTEM_TIME_UP]','[USER_REQUESTED_END]','[TRANSCRIPTION_FAILED]') THEN
        INSERT INTO interview_evaluation_jobs(session_id,turn_number,source_message_id)
        VALUES(NEW.session_id,NEW.turn_number,NEW.id)
        ON CONFLICT(session_id,turn_number) DO NOTHING;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS interview_answer_evaluation_outbox ON conversation_messages;
CREATE TRIGGER interview_answer_evaluation_outbox AFTER INSERT ON conversation_messages
    FOR EACH ROW EXECUTE FUNCTION enqueue_interview_evaluation();
