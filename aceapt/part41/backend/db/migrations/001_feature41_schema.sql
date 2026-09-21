-- ACEAPT Feature 41 — Adaptive Career Strategy Engine
-- NEW TABLES ONLY (spec #59/#96: do not invent structures for entities that
-- already exist elsewhere — student/goal/skill/evidence/opportunity/
-- application/decision/outcome are assumed to already exist in ACEAPT).
--
-- This has NOT been run against a live database in this build (no
-- DATABASE_URL was available). It has been reviewed against
-- src/repositories/pgRepository.ts for column/type agreement, but verify it
-- against your real Postgres instance (and real student/goal table names)
-- before relying on it. The commented FK lines assume a `student(id)` /
-- `goal(id)` table — adjust names and re-enable them to match your schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS career_strategy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL, -- REFERENCES student(id)
  current_version_id UUID,
  status TEXT NOT NULL DEFAULT 'insufficient_data'
    CHECK (status IN ('on_track','needs_attention','shift_recommended','insufficient_data')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);
CREATE INDEX IF NOT EXISTS idx_career_strategy_student ON career_strategy(student_id);

CREATE TABLE IF NOT EXISTS strategy_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES career_strategy(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  goal_id UUID, -- REFERENCES goal(id)
  target_role TEXT NOT NULL DEFAULT '',
  reason TEXT,
  assumptions JSONB NOT NULL DEFAULT '[]',
  priorities JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ,
  UNIQUE (strategy_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_strategy_version_strategy ON strategy_version(strategy_id);

-- career_strategy.current_version_id intentionally has no FK constraint
-- declared here to avoid a circular-creation-order issue in a single
-- migration file; add one after both tables exist if your migration tool
-- supports ALTER TABLE ... ADD CONSTRAINT in a later step.

CREATE TABLE IF NOT EXISTS strategy_signal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES career_strategy(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('progress','gap','risk','opportunity','trend','bottleneck','decision','uncertainty','constraint')),
  code TEXT NOT NULL,
  detail TEXT NOT NULL,
  weight NUMERIC(3,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_strategy_signal_strategy ON strategy_signal(strategy_id, type);

CREATE TABLE IF NOT EXISTS bottleneck (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES career_strategy(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','monitoring','resolved')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bottleneck_strategy ON bottleneck(strategy_id, status);

CREATE TABLE IF NOT EXISTS strategy_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES career_strategy(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','accepted','not_now','in_progress','completed','skipped')),
  value_tier TEXT CHECK (value_tier IN ('high','medium','low')),
  reasoning TEXT,
  not_now_reason TEXT,
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_strategy_action_strategy ON strategy_action(strategy_id, status);

CREATE TABLE IF NOT EXISTS career_experiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES career_strategy(id) ON DELETE CASCADE,
  hypothesis TEXT NOT NULL,
  action TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  measurement TEXT NOT NULL,
  time_window_days INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','completed','inconclusive','invalidated','supported')),
  actual_outcome TEXT,
  conclusion TEXT,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_experiment_strategy ON career_experiment(strategy_id, status);

CREATE TABLE IF NOT EXISTS experiment_outcome (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES career_experiment(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recommendation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES career_strategy(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('next_best_move','strategy_review','strategy_change')),
  summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  evidence JSONB NOT NULL DEFAULT '[]',
  unknowns JSONB NOT NULL DEFAULT '[]',
  risks JSONB NOT NULL DEFAULT '[]',
  alternatives JSONB NOT NULL DEFAULT '[]',
  conditions JSONB NOT NULL DEFAULT '[]',
  strategy_impact TEXT,
  requires_confirmation BOOLEAN NOT NULL DEFAULT false,
  generated_by_llm BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recommendation_strategy ON recommendation(strategy_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendation(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL CHECK (feedback IN ('helpful','not_helpful','already_done','not_possible','wrong_context')),
  not_now_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES career_strategy(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  progress TEXT,
  decisions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  outcomes JSONB NOT NULL DEFAULT '[]',
  blockers JSONB NOT NULL DEFAULT '[]',
  new_opportunities JSONB NOT NULL DEFAULT '[]',
  lessons JSONB NOT NULL DEFAULT '[]',
  next_priority TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_strategy_review_strategy ON strategy_review(strategy_id, period_end DESC);
