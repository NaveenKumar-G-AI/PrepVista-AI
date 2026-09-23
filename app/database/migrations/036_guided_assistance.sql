-- Guided Interview Assistance database schema

CREATE TABLE IF NOT EXISTS interview_assistance_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES interview_sessions(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    hints_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    answer_guidance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    policy_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistance_policy_session ON interview_assistance_policy(session_id);

CREATE TABLE IF NOT EXISTS interview_assistance_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    turn_number INTEGER NOT NULL,
    question_instance_id UUID,
    
    assistance_type TEXT NOT NULL CHECK (assistance_type IN ('hint', 'answer_guidance')),
    assistance_level INTEGER NOT NULL DEFAULT 1,
    
    request_id TEXT NOT NULL UNIQUE,
    
    question_text TEXT NOT NULL,
    question_family TEXT,
    question_version TEXT,
    
    generated_content TEXT,
    content_hash TEXT,
    
    model_provider TEXT,
    model_version TEXT,
    prompt_version TEXT DEFAULT 'v1',
    
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    
    used_before_answer BOOLEAN,
    invalidated BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_assistance_event_session ON interview_assistance_event(session_id);
CREATE INDEX IF NOT EXISTS idx_assistance_event_turn ON interview_assistance_event(session_id, turn_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistance_event_instance_idempotent 
    ON interview_assistance_event (session_id, question_instance_id, assistance_type, assistance_level)
    WHERE question_instance_id IS NOT NULL;

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS assistance_provenance TEXT DEFAULT 'unknown';

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS question_instance_id UUID;
