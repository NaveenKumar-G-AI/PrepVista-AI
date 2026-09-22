-- Guided Interview Assistance — database schema
-- Run after all existing migrations.

-- Assistance policy per interview session (immutable after creation)
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

-- Individual assistance events (one per hint/guidance request)
CREATE TABLE IF NOT EXISTS interview_assistance_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    turn_number INTEGER NOT NULL,
    
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
    
    invalidated BOOLEAN NOT NULL DEFAULT FALSE,
    
    UNIQUE (session_id, turn_number, assistance_type, assistance_level)
);
CREATE INDEX IF NOT EXISTS idx_assistance_event_session ON interview_assistance_event(session_id);
CREATE INDEX IF NOT EXISTS idx_assistance_event_turn ON interview_assistance_event(session_id, turn_number);

-- Add assistance_provenance to existing question_evaluations
ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS assistance_provenance TEXT DEFAULT 'unknown';
-- Values: 'independent', 'hint_assisted', 'answer_guided', 'unknown'
