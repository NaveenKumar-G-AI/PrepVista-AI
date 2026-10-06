-- 038_rubric_category_expansion.sql
--
-- RELEASE BLOCKER: Expand rubric-category CHECK constraints to include all
-- legitimate categories emitted by current runtime normalization.
--
-- Historical migration 001 constrained question_evaluations.rubric_category
-- and skill_scores.category to the original 14 categories. Runtime evolution
-- added 11 more authentic categories (introduction, project_ownership,
-- behavioral, situational_judgment, creative_thinking, ai_tool_fluency,
-- programming_language, skill_verification, certification, self_assessment,
-- delivery) that are produced by normalize_rubric_category() and
-- derive_skill_score_rows(). Any write of these values fails on real
-- PostgreSQL while succeeding in offline SQLite test harnesses.
--
-- This migration:
--   1. Drops the old inline CHECK on question_evaluations.rubric_category
--   2. Adds an expanded CHECK with all 24 legitimate values
--   3. Drops the old inline CHECK on skill_scores.category
--   4. Adds an expanded CHECK with all 25 legitimate values (24 + delivery)
--
-- NO rows are deleted, updated, or rewritten.
-- NO tables are recreated.
-- NO unrelated constraints or indexes are modified.
-- Historical data remains valid because the new set is a strict superset.

-- ── question_evaluations.rubric_category ──────────────────────────────────
-- PostgreSQL names inline CHECK constraints as {table}_{column}_check.
ALTER TABLE question_evaluations
  DROP CONSTRAINT IF EXISTS question_evaluations_rubric_category_check;

ALTER TABLE question_evaluations
  ADD CONSTRAINT question_evaluations_rubric_category_check
  CHECK (rubric_category IN (
      -- Original 14 (migration 001) — preserved for historical rows
      'communication',   'technical_depth',  'problem_solving',
      'confidence',      'structure_star',   'vocabulary',
      'vocal_delivery',  'leadership',       'teamwork',
      'adaptability',    'reasoning',        'conciseness',
      'professionalism', 'role_fit',
      -- Current runtime additions — required for new evaluations
      'introduction',          'project_ownership',   'behavioral',
      'situational_judgment',  'creative_thinking',   'ai_tool_fluency',
      'programming_language',  'skill_verification',  'certification',
      'self_assessment'
  ));


-- ── skill_scores.category ─────────────────────────────────────────────────
ALTER TABLE skill_scores
  DROP CONSTRAINT IF EXISTS skill_scores_category_check;

ALTER TABLE skill_scores
  ADD CONSTRAINT skill_scores_category_check
  CHECK (category IN (
      -- Original 14 (migration 001) — preserved for historical rows
      'communication',   'technical_depth',  'problem_solving',
      'confidence',      'structure_star',   'vocabulary',
      'vocal_delivery',  'leadership',       'teamwork',
      'adaptability',    'reasoning',        'conciseness',
      'professionalism', 'role_fit',
      -- Current runtime additions — required for new evaluations
      'introduction',          'project_ownership',   'behavioral',
      'situational_judgment',  'creative_thinking',   'ai_tool_fluency',
      'programming_language',  'skill_verification',  'certification',
      'self_assessment',
      -- Synthetic category from communication_score (derive_skill_score_rows)
      'delivery'
  ));
