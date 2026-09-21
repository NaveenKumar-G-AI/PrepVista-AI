-- =============================================================================
-- 004_feature40_insights_technology_outbox.sql
-- Personalized insight feed (daily signal / weekly brief / alerts), technology
-- decision signals, and the durable outbox used to hand strategic actions to
-- Feature 36 without Feature 40 building a competing task engine (spec ??55).
-- =============================================================================

-- ---- Market insights: the personalized, non-generic feed (spec ??47-50) -----
CREATE TABLE market_insights (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID REFERENCES students(id) ON DELETE CASCADE, -- NULL = role-level, not yet personalized
  role_id              UUID REFERENCES roles(id),
  skill_id             UUID REFERENCES skills(id),
  insight_type         TEXT NOT NULL,   -- DAILY_SIGNAL | WEEKLY_BRIEF | ROLE_EVOLUTION_ALERT | SKILL_SIGNAL_ALERT | CAREER_SIGNAL_ALERT
  headline             TEXT NOT NULL,
  body                 TEXT NOT NULL,
  why_it_matters       TEXT NOT NULL,
  recommended_action   TEXT NOT NULL,
  confidence           confidence_level NOT NULL DEFAULT 'UNKNOWN',
  source_type          source_type NOT NULL DEFAULT 'PLATFORM_HISTORICAL_DATA',
  period               TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at              TIMESTAMPTZ
);
CREATE INDEX idx_market_insights_student ON market_insights(student_id, created_at DESC);

-- ---- Technology decision signals ("Should I learn X?", spec ??44) -----------
CREATE TABLE technology_signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technology_name     TEXT NOT NULL,
  maturity            TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (maturity IN ('EMERGING','GROWING','ESTABLISHED','DECLINING','UNKNOWN')),
  employer_adoption   NUMERIC(5,4) NOT NULL DEFAULT 0,  -- 0..1
  transferability     NUMERIC(5,4) NOT NULL DEFAULT 0,  -- 0..1
  sample_size         INT NOT NULL DEFAULT 0,
  confidence          confidence_level NOT NULL DEFAULT 'UNKNOWN',
  source_type         source_type NOT NULL DEFAULT 'PLATFORM_HISTORICAL_DATA',
  period              TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technology_name, period)
);

-- ---- Durable outbox: Feature 40 -> Feature 36 (and any other consumer) ------
-- Feature 40 creates strategic actions; Feature 36 executes/prioritizes them.
-- The outbox makes that handoff durable (survives process restarts/retries)
-- instead of a direct in-process call that can silently drop events.
CREATE TABLE outbox_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       TEXT NOT NULL,     -- e.g. FEATURE40.STRATEGIC_ACTION.CREATED, FEATURE40.FUTURE_GAP.CRITICAL_OPENED
  target_feature   TEXT NOT NULL,     -- FEATURE36, FEATURE35, etc.
  student_id       UUID REFERENCES students(id) ON DELETE CASCADE,
  payload          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DISPATCHED','FAILED')),
  attempts         INT NOT NULL DEFAULT 0,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at    TIMESTAMPTZ
);
CREATE INDEX idx_outbox_status ON outbox_events(status, created_at);
