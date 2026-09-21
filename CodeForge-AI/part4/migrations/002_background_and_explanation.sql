-- CodeForge Evaluation Engine — Migration 002
-- Adds: background-analysis status tracking (Phase 35), AI-assisted
-- complexity reasoning columns (Phase 8), and explanation evaluation
-- (Phase 15-16).

ALTER TABLE attempts ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
    CHECK (analysis_status IN ('NOT_APPLICABLE','PENDING','COMPLETE','FAILED'));

ALTER TABLE complexity_analysis ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'NOT_ATTEMPTED'
    CHECK (ai_status IN ('NOT_ATTEMPTED','AI_GENERATED','AI_EVALUATION_PENDING','AI_RESPONSE_INVALID'));
ALTER TABLE complexity_analysis ADD COLUMN ai_reasoning TEXT;

CREATE TABLE IF NOT EXISTS explanation_evaluations (
    evaluation_id         TEXT PRIMARY KEY,
    attempt_id            TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id),
    provided              INTEGER NOT NULL,           -- 0 if student gave no explanation
    conceptual_understanding TEXT
        CHECK (conceptual_understanding IN ('LOW','MEDIUM','HIGH') OR conceptual_understanding IS NULL),
    consistency_with_code TEXT,                        -- free-text note, not a boolean verdict
    algorithm_reasoning_notes TEXT,
    ai_status             TEXT NOT NULL CHECK (ai_status IN ('AI_GENERATED','AI_EVALUATION_PENDING','AI_RESPONSE_INVALID','NOT_APPLICABLE')),
    created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attempts_analysis_status ON attempts(analysis_status);
