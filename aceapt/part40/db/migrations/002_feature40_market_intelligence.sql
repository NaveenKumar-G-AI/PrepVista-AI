-- =============================================================================
-- 002_feature40_market_intelligence.sql
-- Market-facing intelligence: snapshots, signals, role evolution, skill trends,
-- skill combinations. Nothing here is student-scoped, so no RLS is needed on
-- these tables (they are read by every student targeting a given role).
-- =============================================================================

CREATE TYPE confidence_level AS ENUM ('HIGH','MODERATE','LOW','UNKNOWN');
CREATE TYPE source_type AS ENUM (
  'VERIFIED_MARKET_DATA',
  'EMPLOYER_JOB_DATA',
  'PLATFORM_HISTORICAL_DATA',
  'TRUSTED_RESEARCH',
  'STUDENT_DATA',
  'AI_INFERENCE'
);
CREATE TYPE role_change_classification AS ENUM ('STABLE','EVOLVING','TRANSFORMING','EMERGING','UNCERTAIN');
CREATE TYPE skill_trend_classification AS ENUM ('DURABLE','GROWING','EMERGING','ROLE_SPECIFIC','DECLINING','UNKNOWN');

-- ---- Market snapshots: one row per (role, period) --------------------------
-- Skill/tool frequencies observed in the market for a role during a period.
-- Enables "WHAT CHANGED?" between periods (spec section 18).
CREATE TABLE market_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id             UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  period              TEXT NOT NULL,                 -- e.g. '2026-Q1'
  skill_frequencies   JSONB NOT NULL DEFAULT '{}',    -- { "<skill_slug>": <0..1 frequency> }
  sample_size         INT NOT NULL DEFAULT 0,
  source_type         source_type NOT NULL DEFAULT 'PLATFORM_HISTORICAL_DATA',
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, period)
);
CREATE INDEX idx_market_snapshots_role_period ON market_snapshots(role_id, period);

-- ---- Market signals: individual detected movements --------------------------
CREATE TABLE market_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         UUID REFERENCES roles(id) ON DELETE CASCADE,
  skill_id        UUID REFERENCES skills(id) ON DELETE CASCADE,
  signal_type     TEXT NOT NULL,                      -- SKILL_FREQUENCY_INCREASE | SKILL_FREQUENCY_DECREASE | NEW_TECHNOLOGY | NEW_ROLE_TITLE | NEW_COMBINATION | RESPONSIBILITY_SHIFT | EXPERIENCE_EXPECTATION_SHIFT
  period          TEXT NOT NULL,
  strength         NUMERIC(5,4) NOT NULL DEFAULT 0,    -- magnitude of movement, 0..1
  sample_size      INT NOT NULL DEFAULT 0,
  source_type      source_type NOT NULL DEFAULT 'PLATFORM_HISTORICAL_DATA',
  confidence       confidence_level NOT NULL DEFAULT 'UNKNOWN',
  interpretation   TEXT NOT NULL,                      -- deterministic, human-readable one-liner
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role_id IS NOT NULL OR skill_id IS NOT NULL)
);
CREATE INDEX idx_market_signals_role_period ON market_signals(role_id, period);
CREATE INDEX idx_market_signals_skill_period ON market_signals(skill_id, period);

-- ---- Role evolution: one row per (role, period) -----------------------------
CREATE TABLE role_evolutions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id                   UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  period                    TEXT NOT NULL,
  classification            role_change_classification NOT NULL DEFAULT 'UNCERTAIN',
  then_summary              TEXT NOT NULL DEFAULT '',
  now_summary               TEXT NOT NULL DEFAULT '',
  emerging_summary          TEXT NOT NULL DEFAULT '',
  future_possibility        TEXT NOT NULL DEFAULT '',
  ai_assisted_tasks         JSONB NOT NULL DEFAULT '[]',
  human_critical_tasks      JSONB NOT NULL DEFAULT '[]',
  ai_complementary_skills   JSONB NOT NULL DEFAULT '[]',
  new_responsibilities      JSONB NOT NULL DEFAULT '[]',
  potential_risks           JSONB NOT NULL DEFAULT '[]',
  potential_opportunities   JSONB NOT NULL DEFAULT '[]',
  confidence                confidence_level NOT NULL DEFAULT 'UNKNOWN',
  source_type               source_type NOT NULL DEFAULT 'AI_INFERENCE',
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, period)
);

-- ---- Skill trends: one row per (skill, role?, period) -----------------------
CREATE TABLE skill_trends (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id              UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  role_id               UUID REFERENCES roles(id) ON DELETE CASCADE, -- NULL = cross-role trend
  period                TEXT NOT NULL,
  classification        skill_trend_classification NOT NULL DEFAULT 'UNKNOWN',
  market_signal_strength NUMERIC(5,4) NOT NULL DEFAULT 0,
  sample_size           INT NOT NULL DEFAULT 0,
  confidence            confidence_level NOT NULL DEFAULT 'UNKNOWN',
  source_type           source_type NOT NULL DEFAULT 'PLATFORM_HISTORICAL_DATA',
  explanation           TEXT NOT NULL DEFAULT '',
  recommended_action    TEXT NOT NULL DEFAULT '',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (skill_id, role_id, period)
);
CREATE INDEX idx_skill_trends_skill_period ON skill_trends(skill_id, period);
CREATE INDEX idx_skill_trends_role_period ON skill_trends(role_id, period);

-- ---- Skill combinations ------------------------------------------------------
CREATE TABLE skill_combinations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  skill_ids     JSONB NOT NULL DEFAULT '[]',   -- array of skill UUIDs (as text)
  role_ids      JSONB NOT NULL DEFAULT '[]',   -- array of role UUIDs (as text) where it appears
  frequency     NUMERIC(5,4) NOT NULL DEFAULT 0,
  sample_size   INT NOT NULL DEFAULT 0,
  explanation   TEXT NOT NULL DEFAULT '',
  confidence    confidence_level NOT NULL DEFAULT 'UNKNOWN',
  period        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_skill_combinations_period ON skill_combinations(period);
