-- OLD-PUSH MIGRATION COMPATIBILITY BOOTSTRAP
-- Resolves missing tables for 005_user_activity.sql patch which overwrote the original.

CREATE TABLE IF NOT EXISTS user_activity_stats (
    id SERIAL PRIMARY KEY,
    active_users_count INT NOT NULL DEFAULT 0,
    inactive_users_count INT NOT NULL DEFAULT 0,
    total_users_count INT NOT NULL DEFAULT 0,
    live_window_minutes INT NOT NULL DEFAULT 15,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert the singleton row 005 updates
INSERT INTO user_activity_stats (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS user_activity_events (
    id BIGSERIAL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL DEFAULT 'heartbeat' CHECK (event_type IN ('heartbeat', 'login', 'logout', 'interview_start', 'interview_end')),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_output_fingerprints (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_topic_progress (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    correct_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_plan_interviews (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    total_interviews INT NOT NULL DEFAULT 0,
    current_cycle_interviews INT NOT NULL DEFAULT 0,
    current_cycle_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_interview_at TIMESTAMPTZ
);
