-- =============================================================================
-- Migration 012 — admin_bonus_interviews column + audit log
-- Grants platform admins the ability to extend a user's interview quota.
--
-- SECURITY POLICY:
--   • Only authenticated platform admins (profiles.is_admin = true) may
--     increment admin_bonus_interviews.  This must be enforced at the
--     application layer (admin-only API endpoint) and is NOT enforced here
--     by RLS because RLS on profiles is managed in a separate migration.
--   • The column is bounded: 0 ≤ value ≤ 1000.  This caps the blast radius
--     if an admin account is compromised — a rogue actor cannot silently
--     grant millions of free interviews.
--   • Every change is recorded in admin_bonus_grants (created below) for
--     a full audit trail: who granted how many, to whom, and why.
--
-- QUOTA INTEGRATION:
--   The quota enforcement layer (app/services/quota.py) adds this value to
--   the plan-based monthly interview limit:
--       effective_limit = plan_limit + admin_bonus_interviews
--   This column is never decremented by interview consumption — it is a
--   one-time grant, not a balance.  The quota service computes usage
--   independently from interviews_used_this_period.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add column to profiles
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS admin_bonus_interviews INT NOT NULL DEFAULT 0;


-- ---------------------------------------------------------------------------
-- 2. Constraints — enforce data integrity at the DB layer
-- ---------------------------------------------------------------------------

-- Non-negative: bonus count can never be negative.
-- A bug that subtracts instead of adds must not produce -50 bonus interviews
-- that corrupt the effective quota calculation.
ALTER TABLE profiles
    ADD CONSTRAINT chk_profiles_admin_bonus_non_negative
    CHECK (admin_bonus_interviews >= 0);

-- Upper bound: caps blast radius of a compromised admin account.
-- An attacker who gains admin API access cannot silently grant 10,000,000
-- interviews to an account.  1000 is intentionally generous (covering any
-- legitimate institutional arrangement) while still being auditable.
-- Raise this limit via a new migration if a genuine business need arises.
ALTER TABLE profiles
    ADD CONSTRAINT chk_profiles_admin_bonus_max
    CHECK (admin_bonus_interviews <= 1000);


-- ---------------------------------------------------------------------------
-- 3. Column documentation
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN profiles.admin_bonus_interviews IS
    'Additional interview sessions granted to this user by a platform admin. '
    'Added to the plan-based monthly quota by the quota enforcement layer. '
    'Constraints: 0 ≤ value ≤ 1000. '
    'NEVER modified directly — always via the admin bonus grant API which '
    'also writes to admin_bonus_grants for a full audit trail. '
    'Not self-serviceable: users cannot modify their own value. '
    'See migration 012 and app/services/quota.py for full context.';


-- ---------------------------------------------------------------------------
-- 4. Partial index — fast lookup of users who have bonus interviews
-- ---------------------------------------------------------------------------
-- Queries such as "show all users with admin-granted bonus" or
-- "find users whose bonus is about to expire" scan only the small
-- subset of rows where admin_bonus_interviews > 0, not the full profiles
-- table (which may have tens of thousands of free-plan users with value 0).

CREATE INDEX IF NOT EXISTS idx_profiles_has_admin_bonus
    ON profiles (id, admin_bonus_interviews)
    WHERE admin_bonus_interviews > 0;


-- ---------------------------------------------------------------------------
-- 5. Admin bonus audit log table
-- ---------------------------------------------------------------------------
-- The profiles column stores the CURRENT total bonus count.
-- This table records every individual grant event so that:
--   • Grants by a compromised admin account are detectable (unusual volume,
--     unusual recipient, unusual time-of-day).
--   • Support can explain to a user exactly when and why they received extra
--     interviews.
--   • The grant can be reversed by decrementing profiles.admin_bonus_interviews
--     and recording a reversal row here.
--   • Compliance audits have a complete trail of admin actions on user quotas.

CREATE TABLE IF NOT EXISTS admin_bonus_grants (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    granted_by     UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    granted_to     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    -- Amount granted in this event (positive = grant, negative = reversal).
    -- Bounded to match the column constraint: a single grant cannot exceed
    -- the column maximum, and reversals cannot exceed what was granted.
    amount         INT         NOT NULL
                               CHECK (amount BETWEEN -1000 AND 1000)
                               CHECK (amount != 0),
    reason         TEXT,
    -- The profiles.admin_bonus_interviews value AFTER this grant was applied.
    -- Allows detection of inconsistency: sum(amount) should equal snapshot.
    snapshot_after INT         NOT NULL CHECK (snapshot_after >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admin_bonus_grants IS
    'Immutable audit log of every admin_bonus_interviews change. '
    'One row per grant or reversal event. '
    'granted_by must have profiles.is_admin = true (enforced by application layer). '
    'Do NOT delete rows from this table — use amount < 0 for reversals.';

COMMENT ON COLUMN admin_bonus_grants.amount IS
    'Positive = additional interviews granted. '
    'Negative = reversal/correction. '
    'Zero is rejected by constraint (a no-op grant is a data quality error).';

COMMENT ON COLUMN admin_bonus_grants.snapshot_after IS
    'Value of profiles.admin_bonus_interviews immediately after this grant. '
    'Used for consistency validation: SELECT SUM(amount) should equal the '
    'current snapshot_after for the most recent row per granted_to.';


-- ---------------------------------------------------------------------------
-- 6. Audit log indexes
-- ---------------------------------------------------------------------------

-- Look up all grants for a specific recipient (most common query: "why does
-- this user have 50 bonus interviews?").
CREATE INDEX IF NOT EXISTS idx_admin_bonus_grants_recipient
    ON admin_bonus_grants (granted_to, created_at DESC);

-- Look up all grants made by a specific admin (security query: "what did
-- this admin account do after it was potentially compromised?").
CREATE INDEX IF NOT EXISTS idx_admin_bonus_grants_grantor
    ON admin_bonus_grants (granted_by, created_at DESC);


-- ---------------------------------------------------------------------------
-- 7. Row-Level Security on the audit log
-- ---------------------------------------------------------------------------
-- The grants table contains admin activity data.
-- Client SDK access is blocked entirely — only the backend service role
-- may read or write.  This prevents a student from querying the table
-- to discover who the admin accounts are (via granted_by UUIDs).

ALTER TABLE admin_bonus_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON admin_bonus_grants FROM PUBLIC;
REVOKE ALL ON admin_bonus_grants FROM anon;
REVOKE ALL ON admin_bonus_grants FROM authenticated;
GRANT SELECT, INSERT ON admin_bonus_grants TO service_role;
-- UPDATE and DELETE intentionally NOT granted — audit logs are append-only.
-- Reversals use INSERT with a negative amount, not UPDATE/DELETE.