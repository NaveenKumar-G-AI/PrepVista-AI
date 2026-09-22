-- Guided Assistance Fixes

-- 1. Add question_instance_id (nullable for legacy) to interview_assistance_event
ALTER TABLE interview_assistance_event
    ADD COLUMN IF NOT EXISTS question_instance_id UUID;

-- 2. Drop old unique constraint
ALTER TABLE interview_assistance_event
    DROP CONSTRAINT IF EXISTS interview_assistance_event_session_id_turn_number_a_key;

-- 3. Add partial unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistance_event_instance_idempotent 
    ON interview_assistance_event (session_id, question_instance_id, assistance_type, assistance_level)
    WHERE question_instance_id IS NOT NULL;

-- 4. Add question_instance_id to question_evaluations
ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS question_instance_id UUID;
