-- =============================================================================
-- CodeForge AI Cost & Performance Controls — initial schema
--
-- This file is the production-persistence counterpart to the in-memory
-- repositories the app runs against by default (see src/config/index.ts,
-- `usingInMemoryPersistence`). The application code talks to storage
-- through plain TypeScript classes (BudgetEngine, Telemetry, AuditLog,
-- PolicyEngine, ModelRegistry) rather than an ORM, so wiring this schema
-- up means adding a Postgres-backed implementation of each class's small
-- surface area (get/list/upsert) behind the same interface — nothing
-- above those classes needs to change. This has NOT been built in this
-- pass; see docs/COMPLETION_REPORT.md "Known Limitations".
--
-- Run with: psql "$DATABASE_URL" -f migrations/001_init.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Model registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_provider (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_model (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES ai_provider(id) ON DELETE RESTRICT,
  model_key TEXT NOT NULL,
  family TEXT,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  context_window INT NOT NULL,
  max_output_tokens INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPRECATED', 'DISABLED', 'UNAVAILABLE')),
  input_price_per_mtok NUMERIC(14, 6) NOT NULL,
  output_price_per_mtok NUMERIC(14, 6) NOT NULL,
  pricing_version INT NOT NULL DEFAULT 1,
  pricing_as_of DATE NOT NULL,
  pricing_source TEXT NOT NULL,
  observed_avg_latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_model_status ON ai_model(status);

-- Historical pricing versions, so a request recorded against
-- pricing_version=3 can always be re-explained even after the registry
-- moves to version 4. Populate via trigger or application-level insert
-- whenever ai_model pricing changes rather than overwriting history.
CREATE TABLE IF NOT EXISTS ai_model_pricing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES ai_model(id) ON DELETE CASCADE,
  pricing_version INT NOT NULL,
  input_price_per_mtok NUMERIC(14, 6) NOT NULL,
  output_price_per_mtok NUMERIC(14, 6) NOT NULL,
  pricing_as_of DATE NOT NULL,
  pricing_source TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, pricing_version)
);

-- ---------------------------------------------------------------------------
-- Policy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('GLOBAL', 'ORGANIZATION', 'FEATURE', 'TASK')),
  scope_ref TEXT, -- NULL only for GLOBAL
  config JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One active policy per (scope, scope_ref) — mirrors PolicyEngine's map key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_policy_active_scope
  ON ai_policy (scope, COALESCE(scope_ref, ''))
  WHERE is_active;

-- ---------------------------------------------------------------------------
-- Budgets & quotas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('GLOBAL', 'ORGANIZATION', 'FEATURE', 'USER')),
  scope_ref TEXT NOT NULL,
  organization_id UUID, -- populated for ORGANIZATION/USER scope, enables org-scoped listing without parsing scope_ref
  period TEXT NOT NULL CHECK (period IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  limit_usd NUMERIC(14, 4) NOT NULL CHECK (limit_usd > 0),
  used_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  warning_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 80,
  hard_limit BOOLEAN NOT NULL DEFAULT true,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_ref, period_start)
);
CREATE INDEX IF NOT EXISTS idx_ai_budget_org ON ai_budget(organization_id);

CREATE TABLE IF NOT EXISTS ai_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('USER', 'ORGANIZATION', 'FEATURE', 'TASK')),
  scope_ref TEXT NOT NULL,
  organization_id UUID,
  limit_count INT NOT NULL CHECK (limit_count > 0),
  used_count INT NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  UNIQUE (scope, scope_ref, period_start)
);
CREATE INDEX IF NOT EXISTS idx_ai_quota_org ON ai_quota(organization_id);

-- ---------------------------------------------------------------------------
-- Request telemetry (high write volume — see notes below)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID,
  feature TEXT NOT NULL,
  task TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'FALLBACK', 'CACHED', 'BLOCKED', 'DEGRADED')),
  provider TEXT,
  model_id UUID REFERENCES ai_model(id),
  routing_reasons TEXT[],
  input_tokens INT,
  output_tokens INT,
  total_tokens INT,
  cost_usd NUMERIC(14, 6),
  cost_basis TEXT CHECK (cost_basis IN ('ACTUAL', 'ESTIMATED', 'UNAVAILABLE')),
  pricing_version INT,
  queue_time_ms INT,
  gateway_time_ms INT,
  provider_time_ms INT,
  total_time_ms INT,
  ttft_ms INT,
  retries INT NOT NULL DEFAULT 0,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  error_category TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Example monthly partition. In production, create these on a rolling
-- schedule (pg_partman, or a scheduled job) rather than by hand — this
-- table is expected to be the highest-volume table in the system.
CREATE TABLE IF NOT EXISTS ai_request_2026_08 PARTITION OF ai_request
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS ai_request_2026_09 PARTITION OF ai_request
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE INDEX IF NOT EXISTS idx_ai_request_org_time ON ai_request(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_feature_time ON ai_request(feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_model_time ON ai_request(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_status_time ON ai_request(status, created_at DESC);
-- Idempotency lookups must be fast and tenant-scoped; NULL keys are common
-- (most requests don't set one) and excluded from the uniqueness check.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_request_idempotency
  ON ai_request(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  actor_id TEXT,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  target TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb, -- MUST be redacted at the application layer before insert; see src/errors/index.ts `redact()`
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_audit_org_time ON ai_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_type_time ON ai_audit_log(event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- Health, alerts, experiments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model_id UUID REFERENCES ai_model(id),
  status TEXT NOT NULL CHECK (status IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'RATE_LIMITED', 'DISABLED')),
  detail TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_health_provider_time ON ai_health(provider, checked_at DESC);

CREATE TABLE IF NOT EXISTS ai_alert (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  message TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_alert_org_time ON ai_alert(organization_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS ai_experiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  arm_model_ids UUID[] NOT NULL,
  traffic_fraction NUMERIC(4, 3) NOT NULL CHECK (traffic_fraction >= 0 AND traffic_fraction <= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Retention (see docs/ARCHITECTURE.md "Retention" for the policy this
-- enforces — sensitive prompt/response content is never stored in this
-- schema at all, so there is nothing to redact-on-expiry for that; these
-- statements are illustrative starting points, not a scheduled job).
-- ---------------------------------------------------------------------------
-- DELETE FROM ai_request WHERE created_at < now() - INTERVAL '13 months';
-- DELETE FROM ai_audit_log WHERE created_at < now() - INTERVAL '2 years';
-- DELETE FROM ai_health WHERE checked_at < now() - INTERVAL '30 days';
