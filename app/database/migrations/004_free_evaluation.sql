-- =============================================================================
-- Migration 004: Free-plan Evaluation Columns
-- =============================================================================
-- Purpose:
--   Adds per-question sub-score columns and LLM-generated coaching text fields
--   to question_evaluations. Used by the Free plan feedback engine and
--   the per-question PDF report builder.
--
-- Safety:
--   All ADD COLUMN IF NOT EXISTS — fully idempotent.
--   All columns already present in 001_initial_schema.sql — this migration
--   adds constraints that were missing from the original schema.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Sub-score columns (all NUMERIC(3,1), range 0–10)
-- ✅ SEC: Range CHECKs on every score column. Without these, a runaway LLM
-- or a bug in the evaluator can store values like -5 or 999, corrupting the
-- analytics averages shown on every student's dashboard.
-- ---------------------------------------------------------------------------
ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS relevance_score NUMERIC(3,1) DEFAULT 0
        CHECK (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 10));

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS clarity_score NUMERIC(3,1) DEFAULT 0
        CHECK (clarity_score IS NULL OR (clarity_score >= 0 AND clarity_score <= 10));

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS specificity_score NUMERIC(3,1) DEFAULT 0
        CHECK (specificity_score IS NULL OR (specificity_score >= 0 AND specificity_score <= 10));

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS structure_score NUMERIC(3,1) DEFAULT 0
        CHECK (structure_score IS NULL OR (structure_score >= 0 AND structure_score <= 10));

-- ---------------------------------------------------------------------------
-- Answer status classification
-- ✅ SEC: CHECK against known valid values. This column drives the runtime
-- state machine on every answer turn — an injected or corrupted value causes
-- wrong branching in the question engine. Constrain to the known set.
-- ---------------------------------------------------------------------------
ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS answer_status TEXT
        CHECK (answer_status IS NULL OR
               answer_status IN ('strong', 'partial', 'vague', 'wrong',
                                 'silent', 'timeout', 'skipped', 'clarification'));

-- ---------------------------------------------------------------------------
-- LLM-generated coaching text fields
-- ✅ SEC: Length caps on all LLM-generated text columns. A runaway model can
-- produce 100KB+ per field per row. At 500 concurrent users finishing sessions
-- simultaneously, uncapped LLM output permanently inflates the table,
-- degrades row fetch times, and inflates every JSON API response that includes
-- these fields. Caps are generous — real coaching text is 50–300 chars.
-- ---------------------------------------------------------------------------

-- Short classification fields (1–3 word labels from evaluator)
ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS content_understanding TEXT
        CHECK (content_understanding IS NULL OR char_length(content_understanding) <= 2000);

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS depth_quality TEXT
        CHECK (depth_quality IS NULL OR char_length(depth_quality) <= 2000);

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS communication_clarity TEXT
        CHECK (communication_clarity IS NULL OR char_length(communication_clarity) <= 2000);

-- Coaching text fields (sentences, not paragraphs)
ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS what_worked TEXT
        CHECK (what_worked IS NULL OR char_length(what_worked) <= 2000);

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS what_was_missing TEXT
        CHECK (what_was_missing IS NULL OR char_length(what_was_missing) <= 2000);

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS how_to_improve TEXT
        CHECK (how_to_improve IS NULL OR char_length(how_to_improve) <= 2000);

-- Blueprint and intent fields (can be longer — structured model output)
ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS answer_blueprint TEXT
        CHECK (answer_blueprint IS NULL OR char_length(answer_blueprint) <= 4000);

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS corrected_intent TEXT
        CHECK (corrected_intent IS NULL OR char_length(corrected_intent) <= 2000);

-- ---------------------------------------------------------------------------
-- Answer timing
-- ✅ SEC: Non-negative CHECK — negative durations corrupt timing analytics.
-- ---------------------------------------------------------------------------
ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS answer_duration_seconds INT
        CHECK (answer_duration_seconds IS NULL OR answer_duration_seconds >= 0);