-- ════════════════════════════════════════════════════════════════════════════
-- 020_question_evaluations_unique_turn.sql
--
-- Adds the UNIQUE index on question_evaluations(session_id, turn_number) that the
-- application's INSERT ... ON CONFLICT (session_id, turn_number) DO NOTHING clauses
-- depend on.
--
-- WHY THIS EXISTS  (root cause of "scores always zero" + "report shows no Q&A")
-- ----------------------------------------------------------------------------
-- 001_initial_schema.sql created a PLAIN (non-unique) index on these columns:
--
--     CREATE INDEX IF NOT EXISTS idx_evaluations_session
--         ON question_evaluations(session_id, turn_number);
--
-- But every code path that writes an evaluation uses ON CONFLICT inference on
-- exactly that column pair:
--
--     INSERT INTO question_evaluations (...) VALUES (...)
--     ON CONFLICT (session_id, turn_number) DO NOTHING
--       - app/routers/interviews_answer.py        (_evaluate_and_store, Phase 3)
--       - app/services/interviewer_session.py     (_ensure_pending_evaluations._eval_and_write)
--
-- PostgreSQL requires a UNIQUE index/constraint matching the ON CONFLICT target.
-- A plain index does NOT satisfy it, so every one of those INSERTs raised:
--
--     there is no unique or exclusion constraint matching the ON CONFLICT
--     specification   (SQLSTATE 42P10, InvalidColumnReference)
--
-- Both write paths wrap the INSERT in try/except that only logs
-- ("background_eval_failed" / "pending_eval_failed" / "final_eval_failed"), so the
-- failure was silent. Net effect: question_evaluations was never populated, which
-- cascaded into the two reported symptoms:
--   • finish_session -> compute_final_score([])  -> final_score = 0   ("scores always zero")
--   • get_report     -> evaluations = []         -> no questions/answers in report
--
-- THE FIX
-- -------
-- Replace the non-unique index with a UNIQUE one on the same columns. This both
-- (a) makes the ON CONFLICT clause valid so evaluations persist, and (b) enforces
-- the one-evaluation-per-(session, turn) invariant the application already assumes.
-- The unique index also serves every existing lookup (WHERE session_id = $1
-- ORDER BY turn_number), so the old plain index is redundant and is dropped.
--
-- Idempotent and re-runnable. Runs inside the migration runner's transaction
-- (no CONCURRENTLY), so the de-dup + index swap are atomic.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Step 1: collapse any pre-existing duplicate (session_id, turn_number) rows ─
-- Until this migration runs, ON CONFLICT was inoperative, so in the unlikely event
-- a concurrent finish + background task both succeeded against an environment that
-- happened to already have a unique constraint, duplicates could exist. Keep the
-- earliest physical row per pair (lowest ctid) and delete the rest, so the UNIQUE
-- index below can be built without error. No-op on the normal (empty/clean) case.
DELETE FROM question_evaluations qe
USING question_evaluations dup
WHERE qe.session_id  = dup.session_id
  AND qe.turn_number = dup.turn_number
  AND qe.ctid        > dup.ctid;

-- ── Step 2: drop the redundant non-unique index from 001 ──────────────────────
DROP INDEX IF EXISTS idx_evaluations_session;

-- ── Step 3: create the UNIQUE index the ON CONFLICT clauses require ────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_evaluations_session_turn
    ON question_evaluations (session_id, turn_number);
