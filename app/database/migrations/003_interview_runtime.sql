-- =============================================================================
-- Migration 003: Interview Runtime State Columns
-- =============================================================================
-- Purpose:
--   Adds all runtime-tracking columns used by the Python interviewer service
--   to record live session state, idempotency tokens, difficulty mode, and
--   per-question retry/answer tracking.
--
-- Safety:
--   All changes use ADD COLUMN IF NOT EXISTS — fully idempotent and safe to
--   re-run on an existing database without errors or data loss.
--
-- Compatibility:
--   Backward-compatible with all existing application code.
--   No columns are removed, renamed, or have their types changed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Idempotency cache: stores the last client request ID and its response so
-- that duplicate submissions from mobile/flaky connections return the cached
-- result without re-processing.
-- ---------------------------------------------------------------------------
-- ✅ SEC: Length cap on request ID — our generateRequestId() produces 16-char
-- strings. Without a cap an arbitrarily long string can be stored as the
-- idempotency key and scanned on every answer submission.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS last_client_request_id TEXT
        CHECK (last_client_request_id IS NULL OR char_length(last_client_request_id) <= 128);

ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS last_client_response JSONB;

-- ---------------------------------------------------------------------------
-- Difficulty mode: controls question difficulty throughout the session.
-- Valid values: 'auto' | 'basic' | 'medium' | 'difficult'
-- Default 'auto' keeps behavior identical to pre-migration sessions.
-- ---------------------------------------------------------------------------
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS difficulty_mode TEXT NOT NULL DEFAULT 'auto'
        CHECK (difficulty_mode IN ('auto', 'basic', 'medium', 'difficult'));

-- ---------------------------------------------------------------------------
-- Active question tracking: used by the state machine to detect duplicate
-- question delivery and to support the repeat-question flow.
-- ---------------------------------------------------------------------------
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS active_question_signature TEXT;

ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS active_question_turn INT;

-- ---------------------------------------------------------------------------
-- Per-question retry counter: incremented when the same question is
-- re-asked (e.g. after a clarification or timeout).
-- Bounded at application level; stored as a non-negative INT.
-- ---------------------------------------------------------------------------
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS question_retry_count INT NOT NULL DEFAULT 0
        CHECK (question_retry_count >= 0);

-- ---------------------------------------------------------------------------
-- Last answer status: records the most recent AI answer classification
-- (e.g. 'strong', 'partial', 'timeout', 'silent') for quick runtime checks
-- without loading the full question_evaluations table.
-- ---------------------------------------------------------------------------
-- ✅ SEC: CHECK on last_answer_status — any string was previously accepted.
-- This column drives the state machine on every answer turn. An injected or
-- corrupted value could cause wrong branching in the question engine.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS last_answer_status TEXT
        CHECK (last_answer_status IS NULL OR
               last_answer_status IN ('strong', 'partial', 'vague', 'wrong', 'silent', 'timeout', 'skipped', 'clarification'));

-- ---------------------------------------------------------------------------
-- Runtime state: stores the complete live state machine payload as JSONB.
-- Includes: question_state, clarification_count, timeout_count,
--           skipped_count, system_cutoff_count, question_response_times,
--           family_history, exited_early, final_summary, and more.
-- Default '{}' keeps existing sessions compatible.
-- ---------------------------------------------------------------------------
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS runtime_state JSONB DEFAULT '{}'::jsonb;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for idempotency cache lookups:
--   WHERE id = $1 AND access_token = $2 AND last_client_request_id = $3
--
-- id and access_token are already covered by the primary key and the unique
-- constraint on access_token.  This partial index on last_client_request_id
-- prevents a full sequential scan on the sessions table for every retry check.
-- The WHERE clause keeps the index minimal by excluding rows that have never
-- had a request cached.
CREATE INDEX IF NOT EXISTS idx_interview_sessions_last_client_request_id
    ON interview_sessions (last_client_request_id)
    WHERE last_client_request_id IS NOT NULL;

-- Index for difficulty_mode: supports analytics queries that filter or group
-- sessions by difficulty level (e.g. "average score per difficulty mode").
CREATE INDEX IF NOT EXISTS idx_interview_sessions_difficulty_mode
    ON interview_sessions (difficulty_mode)
    WHERE difficulty_mode IS NOT NULL;

-- GIN index on runtime_state: supports JSONB containment lookups used by admin
-- dashboards and monitoring queries (e.g. WHERE runtime_state @> '{"exited_early":true}').
-- ✅ FIXED: was jsonb_path_ops — that operator class only supports @? and @@
-- (JSONPath operators). The containment operator @> used in admin queries
-- requires the default jsonb_ops class. With the wrong class PostgreSQL falls
-- back to a full sequential scan on every admin dashboard query that filters
-- by runtime_state keys. jsonb_ops supports @>, ?, ?|, ?& — all needed here.
CREATE INDEX IF NOT EXISTS idx_interview_sessions_runtime_state_gin
    ON interview_sessions USING GIN (runtime_state)
    WHERE runtime_state IS NOT NULL AND runtime_state != '{}'::jsonb;