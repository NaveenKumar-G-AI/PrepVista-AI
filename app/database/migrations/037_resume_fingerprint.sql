ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS resume_fingerprint TEXT;
