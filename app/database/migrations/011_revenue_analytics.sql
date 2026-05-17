-- =============================================================================
-- Migration 011 — user_revenue_analytics
-- Revenue analytics table: aggregated payment history per user.
--
-- SECURITY & COMPLIANCE NOTES (DPDP Act 2023 / GDPR Art. 5):
--   • email and full_name are personal data (PII). They are stored here as
--     a denormalisation for BI query performance. Obligations:
--       1. Include this table in all data-deletion pipelines.
--       2. ON DELETE CASCADE on user_id propagates profile deletion here.
--       3. Do NOT grant direct read access to analytics/BI tools that have
--          not signed a Data Processing Agreement.
--   • Row-Level Security is enabled — Supabase client SDK (anon/authenticated
--     roles) has NO direct access. All reads/writes go through the backend
--     service role which bypasses RLS by design.
--   • Revenue amounts are stored in paise (integer) to avoid floating-point
--     rounding errors. Never store rupees as FLOAT or NUMERIC(x,2).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Table definition
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_revenue_analytics (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

    -- PII: included for reporting performance — must be covered by all
    -- user-deletion pipelines.  ON DELETE CASCADE above ensures rows are
    -- removed when the profile is deleted, but email-update propagation
    -- requires an application-level hook or a scheduled resync.
    email     TEXT NOT NULL,
    full_name TEXT,

    -- Purchase counts — constrained to non-negative integers.
    -- A negative count indicates corrupt upstream data and should never reach
    -- this table.  The CHECK rejects such inserts/updates at the DB layer.
    free_purchase_count   INT     NOT NULL DEFAULT 0 CHECK (free_purchase_count   >= 0),
    pro_purchase_count    INT     NOT NULL DEFAULT 0 CHECK (pro_purchase_count    >= 0),
    career_purchase_count INT     NOT NULL DEFAULT 0 CHECK (career_purchase_count >= 0),

    -- Revenue in paise (1 rupee = 100 paise).  Negative revenue (refunds)
    -- must be tracked separately — not as negative values on these columns —
    -- to preserve audit integrity.
    pro_revenue_paise    BIGINT  NOT NULL DEFAULT 0 CHECK (pro_revenue_paise    >= 0),
    career_revenue_paise BIGINT  NOT NULL DEFAULT 0 CHECK (career_revenue_paise >= 0),
    total_revenue_paise  BIGINT  NOT NULL DEFAULT 0 CHECK (total_revenue_paise  >= 0),

    -- Soft cross-check: total must cover the component plans.
    -- Uses >= rather than = so that future plan types (enterprise, etc.)
    -- contribute to total without requiring this constraint to change.
    CONSTRAINT total_gte_components CHECK (
        total_revenue_paise >= pro_revenue_paise + career_revenue_paise
    ),

    last_payment_date TIMESTAMPTZ,

    -- current_subscription_status mirrors profiles.subscription_status for
    -- quick "active payer" vs "churned" segmentation in revenue reports
    -- without joining back to the profiles table.
    current_subscription_status TEXT NOT NULL DEFAULT 'none',

    -- updated_at is maintained by the trigger below — never set manually.
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- 2. PII documentation (DPDP Act 2023 / GDPR Art. 30 record-of-processing)
-- ---------------------------------------------------------------------------

COMMENT ON TABLE user_revenue_analytics IS
    'Aggregated revenue analytics per user. Contains PII (email, full_name). '
    'Must be included in user data-deletion and data-export pipelines. '
    'Populated and updated by the payment-webhook handler and nightly sync job. '
    'Direct client SDK access is blocked by RLS — backend service role only.';

COMMENT ON COLUMN user_revenue_analytics.email IS
    'PII — denormalised from profiles for BI performance. '
    'Must be cleared or pseudonymised on user data-deletion requests.';

COMMENT ON COLUMN user_revenue_analytics.full_name IS
    'PII — denormalised from profiles for BI performance. '
    'Must be cleared or pseudonymised on user data-deletion requests.';

COMMENT ON COLUMN user_revenue_analytics.total_revenue_paise IS
    'Sum of all verified payments in paise (₹1 = 100 paise). '
    'Must be >= pro_revenue_paise + career_revenue_paise (enforced by constraint). '
    'Refunds are NOT subtracted here — tracked in a separate refunds table.';

COMMENT ON COLUMN user_revenue_analytics.current_subscription_status IS
    'Mirrors profiles.subscription_status at last sync. '
    'Values: none | active | cancelled | expired | past_due.';


-- ---------------------------------------------------------------------------
-- 3. updated_at auto-maintenance trigger
-- ---------------------------------------------------------------------------
-- Without this trigger, updated_at reflects only the INSERT time or the last
-- explicit SET in an UPDATE.  Application-level updates that omit the column
-- leave it permanently stale, making change-detection queries unreliable.

CREATE OR REPLACE FUNCTION _set_updated_at_user_revenue_analytics()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_revenue_analytics_updated_at
    ON user_revenue_analytics;

CREATE TRIGGER trg_user_revenue_analytics_updated_at
    BEFORE UPDATE ON user_revenue_analytics
    FOR EACH ROW
    EXECUTE FUNCTION _set_updated_at_user_revenue_analytics();


-- ---------------------------------------------------------------------------
-- 4. Row-Level Security — blocks all Supabase client SDK access
-- ---------------------------------------------------------------------------
-- The Supabase service role (used by the backend) bypasses RLS automatically.
-- Enabling RLS with no permissive policies for anon/authenticated roles means
-- direct queries from client SDKs or the Supabase REST API return zero rows
-- rather than exposing revenue and PII data.
-- Belt-and-suspenders: REVOKE below removes the permission even if RLS
-- were accidentally disabled.

ALTER TABLE user_revenue_analytics ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policy for anon or authenticated roles
-- is intentional.  The absence of a permissive policy is the RLS block.


-- ---------------------------------------------------------------------------
-- 5. Permission hardening (belt-and-suspenders alongside RLS)
-- ---------------------------------------------------------------------------

REVOKE ALL ON user_revenue_analytics FROM PUBLIC;
REVOKE ALL ON user_revenue_analytics FROM anon;
REVOKE ALL ON user_revenue_analytics FROM authenticated;

-- If your backend connects via a dedicated role (not service_role), replace
-- 'service_role' with that role name below.
GRANT SELECT, INSERT, UPDATE, DELETE ON user_revenue_analytics TO service_role;


-- ---------------------------------------------------------------------------
-- 6. Backfill from verified payments
-- ---------------------------------------------------------------------------
-- Design note: this is an INNER JOIN (profiles JOIN payments), so only users
-- who have at least one payment record receive a row.  Users with no payments
-- are excluded intentionally — a revenue analytics table for zero-revenue
-- users has no utility and would bloat the table.  Application code that
-- queries this table must handle the missing-row case (no row = £0 revenue)
-- rather than relying on a 0-row being present.

INSERT INTO user_revenue_analytics (
    user_id,
    email,
    full_name,
    free_purchase_count,
    pro_purchase_count,
    career_purchase_count,
    pro_revenue_paise,
    career_revenue_paise,
    total_revenue_paise,
    last_payment_date,
    current_subscription_status
)
SELECT
    p.id                                                                AS user_id,
    p.email,
    p.full_name,
    -- free_purchase_count: promo/trial activations logged as plan = 'free'
    -- in the payments table.  Zero for most deployments where free plans
    -- produce no payment record, but included for completeness.
    COUNT(pay.id) FILTER (WHERE pay.plan NOT IN ('pro', 'career')
                               AND pay.status = 'verified')            AS free_purchase_count,
    COUNT(pay.id) FILTER (WHERE pay.plan = 'pro'
                               AND pay.status = 'verified')            AS pro_purchase_count,
    COUNT(pay.id) FILTER (WHERE pay.plan = 'career'
                               AND pay.status = 'verified')            AS career_purchase_count,
    COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.plan = 'pro'
                                                AND pay.status = 'verified'), 0)   AS pro_revenue_paise,
    COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.plan = 'career'
                                                AND pay.status = 'verified'), 0)   AS career_revenue_paise,
    -- total is the sum of ALL verified payments regardless of plan, so that
    -- future plan types are automatically included without schema changes.
    COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.status = 'verified'), 0)      AS total_revenue_paise,
    MAX(pay.created_at) FILTER (WHERE pay.status = 'verified')         AS last_payment_date,
    COALESCE(p.subscription_status, 'none')                            AS current_subscription_status
FROM profiles p
JOIN payments pay ON pay.user_id = p.id
GROUP BY p.id, p.email, p.full_name, p.subscription_status

ON CONFLICT (user_id) DO UPDATE SET
    -- Use COALESCE to protect against overwriting a known-good value with
    -- NULL if profiles data is momentarily inconsistent during migration.
    email                       = COALESCE(EXCLUDED.email,     user_revenue_analytics.email),
    full_name                   = COALESCE(EXCLUDED.full_name, user_revenue_analytics.full_name),
    free_purchase_count         = EXCLUDED.free_purchase_count,
    pro_purchase_count          = EXCLUDED.pro_purchase_count,
    career_purchase_count       = EXCLUDED.career_purchase_count,
    pro_revenue_paise           = EXCLUDED.pro_revenue_paise,
    career_revenue_paise        = EXCLUDED.career_revenue_paise,
    total_revenue_paise         = EXCLUDED.total_revenue_paise,
    last_payment_date           = EXCLUDED.last_payment_date,
    current_subscription_status = EXCLUDED.current_subscription_status,
    updated_at                  = NOW();


-- ---------------------------------------------------------------------------
-- 7. Indexes
-- ---------------------------------------------------------------------------

-- Case-insensitive email lookup — used for "find revenue for user@example.com"
-- searches in the admin dashboard.
CREATE INDEX IF NOT EXISTS idx_ura_email
    ON user_revenue_analytics (LOWER(email));

-- Top-revenue sort — used for "show highest-value customers" reports.
-- DESC order matches the most common query pattern (ORDER BY total DESC).
CREATE INDEX IF NOT EXISTS idx_ura_total_revenue_desc
    ON user_revenue_analytics (total_revenue_paise DESC);

-- Recency sort — used for "recently converted" and "lapsed payer" reports.
CREATE INDEX IF NOT EXISTS idx_ura_last_payment_date_desc
    ON user_revenue_analytics (last_payment_date DESC NULLS LAST);

-- Subscription status — used for "active subscribers" vs "churned" segments.
CREATE INDEX IF NOT EXISTS idx_ura_subscription_status
    ON user_revenue_analytics (current_subscription_status)
    WHERE current_subscription_status != 'none';