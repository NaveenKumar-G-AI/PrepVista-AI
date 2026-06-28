-- ════════════════════════════════════════════════════════════════════════════
-- 021_transcript_repair_audit.sql
--
-- Fix 2 — LLM transcript repair pass before scoring.
--
-- Adds an audit column to question_evaluations holding the resume-grounded,
-- LLM-repaired transcript (mis-heard proper nouns / college / company / tool
-- names corrected). The existing raw_answer column keeps the TRUE original STT
-- output, and normalized_answer keeps the post-recovery text fed to the
-- evaluator. Storing all three gives a full audit trail:
--
--     raw_answer        -> exactly what STT produced
--     repaired_answer   -> after the resume-grounded LLM repair pass (Fix 2)
--     normalized_answer -> after dictionary recovery, as scored
--
-- NULL for any evaluation written before this migration / when repair was
-- skipped or fell back to raw. Additive and idempotent.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE question_evaluations
    ADD COLUMN IF NOT EXISTS repaired_answer TEXT;
