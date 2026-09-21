-- =============================================================================
-- 006_skill_ai_leverage.sql
-- Added after 001-005 as the AI Impact Engine (spec ??13) was being built: it
-- needs a real, queryable basis for "AI-assisted" vs "human-critical" vs
-- "AI-complementary" per skill, or role_evolution.ai_impact would have to be
-- guessed fresh on every request -- exactly the "if role == X return canned
-- string" anti-pattern spec ??108 forbids. Kept as its own migration rather
-- than folded into 001 so the history honestly shows when/why it was added.
-- =============================================================================

ALTER TABLE skills ADD COLUMN ai_leverage TEXT
  CHECK (ai_leverage IN ('AI_ASSISTED','HUMAN_CRITICAL','AI_COMPLEMENTARY') OR ai_leverage IS NULL);
