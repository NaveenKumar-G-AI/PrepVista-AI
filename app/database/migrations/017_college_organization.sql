-- ============================================================
-- PrepVista-AI — 017_college_organization.sql
-- Version: 2.0 — Extreme B2B Cohort Intelligence Build
--
-- Rewritten per MBP-1 Phase 3.
--
-- PREREQUISITE: 001_initial_schema.sql (v2) must be applied first.
-- PREREQUISITE: migrations 002–016 must be applied (creates support_messages).
--
-- ARCHITECTURAL DECISION (ARCHON):
-- `organizations` supersedes `institutions` from 001_initial_schema.sql.
-- `institutions` is now DEPRECATED. Run 018_consolidate_b2b.sql after
-- this migration to migrate data and drop deprecated tables. Until then,
-- both FKs coexist on profiles:
--   profiles.institution_id  → institutions   (DEPRECATED — do not use)
--   profiles.organization_id → organizations  (CANONICAL — use this)
--
-- BREAKING (from 017 original):
--   1. organization_admins.role now has CHECK constraint.
--      Valid values: 'org_admin','dept_admin','viewer','placement_officer'
--   2. organizations.plan now has CHECK constraint.
--      Valid values: 'college_standard','college_pro','college_enterprise'
--   3. org_payments.amount_paise now has CHECK(amount_paise > 0).
--   4. webhook_events.payload is now NOT NULL; processed BOOLEAN added.
--   5. college_batches.year_id changed from ON DELETE SET NULL to
--      ON DELETE RESTRICT to prevent silent batch orphaning.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. ORGANIZATIONS
-- The canonical B2B institution entity for PrepVista.
-- Supersedes `institutions` from 001_initial_schema.sql.
-- One row per college / university that has purchased seats.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT         NOT NULL,
    -- Only 'college' for this build; enum expands when non-college
    -- institutions are onboarded (constraint updated at that point).
    category            TEXT         NOT NULL DEFAULT 'college'
                        CHECK (category IN ('college')),
    -- Format: COL-NNNN+ (enforced by chk_org_code_format constraint below).
    org_code            TEXT         NOT NULL UNIQUE,
    contact_name        TEXT,
    contact_email       TEXT,
    contact_phone       TEXT,
    address             TEXT,
    city                TEXT,
    -- state_name avoids implicit collision with the 'state' keyword in
    -- some ORM and tooling contexts.
    state_name          TEXT,
    logo_url            TEXT,
    placement_cell_name TEXT,
    branch_code         TEXT,
    -- ✅ NEW: CHECK on plan — prevents arbitrary plan strings bypassing
    -- plan-based feature gating at the application layer.
    plan                TEXT         DEFAULT 'college_standard'
                        CHECK (plan IN (
                            'college_standard', 'college_pro', 'college_enterprise'
                        )),
    seat_limit          INT          DEFAULT 50  CHECK (seat_limit > 0),
    -- seats_used is maintained by trg_org_students_seats trigger.
    -- NEVER update manually — use the trigger to prevent drift.
    seats_used          INT          DEFAULT 0   CHECK (seats_used >= 0),
    access_expiry       TIMESTAMPTZ,
    status              TEXT         DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'expired', 'pending')),
    notes               TEXT,
    -- ✅ NEW: FK enforces referential integrity on the creator reference.
    -- Previously a bare UUID with no REFERENCES clause.
    created_by_admin_id UUID         REFERENCES profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- org_code must match COL-NNNN+ format.
-- Application layer enforces; DB constraint is the safety net.
--
-- NOTE: PostgreSQL does NOT support `ADD CONSTRAINT IF NOT EXISTS`
-- (unlike ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS — that
-- syntax does not exist in the grammar and would raise a syntax error).
-- The DO block below is the idiomatic idempotent equivalent: it checks
-- pg_constraint before adding, so re-running this migration is safe.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_code_format'
    ) THEN
        ALTER TABLE organizations
            ADD CONSTRAINT chk_org_code_format
            CHECK (org_code ~ '^COL-[0-9]{4,}$');
    END IF;
END;
$$;

CREATE INDEX        IF NOT EXISTS idx_organizations_category
    ON organizations(category);
CREATE INDEX        IF NOT EXISTS idx_organizations_status
    ON organizations(status);
-- UNIQUE column already has implicit index; explicit here for clarity.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_org_code
    ON organizations(org_code);
-- ✅ NEW: active org lookup for platform admin dashboards.
CREATE INDEX        IF NOT EXISTS idx_organizations_active
    ON organizations(status, created_at DESC) WHERE status = 'active';


-- ─────────────────────────────────────────────────────────────
-- 2. ORGANIZATION ADMINS
-- ─────────────────────────────────────────────────────────────
-- Maps PrepVista users to their organization admin role.
-- org_admin:          full organization-wide access (analogous to tpo_admin in 001).
-- dept_admin:         read access scoped to department_id column.
-- viewer:             read-only, organization-wide (principals, NAAC/NIRF auditors).
-- placement_officer:  read + export access; cannot modify students or settings.
CREATE TABLE IF NOT EXISTS organization_admins (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
    user_id         UUID         NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
    email           TEXT         NOT NULL,
    full_name       TEXT,
    phone           TEXT,
    -- ✅ NEW: CHECK on role — prevents arbitrary strings from reaching
    -- role-based access control checks.
    role            TEXT         DEFAULT 'org_admin'
                    CHECK (role IN (
                        'org_admin', 'dept_admin', 'viewer', 'placement_officer'
                    )),
    status          TEXT         DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'suspended')),
    -- department_id is added via ALTER TABLE after college_departments
    -- is created below (section 3) — see "department_id backfill" comment.
    -- A FK to college_departments cannot appear in this CREATE TABLE
    -- because college_departments does not exist yet at this point in
    -- the script (PostgreSQL requires referenced tables to pre-exist).
    last_login      TIMESTAMPTZ,
    -- invite_token / invite_sent_at: kept for backward compatibility.
    -- Prefer org_admin_invites for all new invite flows.
    invite_token    TEXT,
    invite_sent_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);

CREATE INDEX        IF NOT EXISTS idx_org_admins_org
    ON organization_admins(organization_id);
CREATE INDEX        IF NOT EXISTS idx_org_admins_user
    ON organization_admins(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_admins_org_user
    ON organization_admins(organization_id, user_id);
-- NOTE: idx_org_admins_dept (department_id scope lookup) is created
-- after college_departments below, once department_id exists on this table.


-- ─────────────────────────────────────────────────────────────
-- 3. COLLEGE DEPARTMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_departments (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_name  TEXT         NOT NULL,
    department_code  TEXT,
    notes            TEXT,
    status           TEXT         DEFAULT 'active'
                     CHECK (status IN ('active', 'inactive')),
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (organization_id, department_name)
);

-- NULL department_code is allowed; uniqueness enforced only when non-NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dept_org_code
    ON college_departments(organization_id, department_code)
    WHERE department_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_org
    ON college_departments(organization_id);
-- ✅ NEW: active department list — most common dashboard query.
CREATE INDEX IF NOT EXISTS idx_departments_org_active
    ON college_departments(organization_id) WHERE status = 'active';

-- ── department_id backfill for organization_admins ───────────────────────
-- Deferred from section 2: college_departments must exist before this FK
-- can be declared. Meaningful only for dept_admin role rows; NULL = all
-- departments (org_admin / viewer / placement_officer).
ALTER TABLE organization_admins
    ADD COLUMN IF NOT EXISTS department_id UUID
        REFERENCES college_departments(id) ON DELETE SET NULL;

-- ✅ NEW: dept_admin scope lookup for RLS and permission checks.
CREATE INDEX IF NOT EXISTS idx_org_admins_dept
    ON organization_admins(organization_id, department_id)
    WHERE department_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 4. COLLEGE YEARS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_years (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    year_name       TEXT         NOT NULL,
    display_order   INT          DEFAULT 1 CHECK (display_order > 0),
    notes           TEXT,
    status          TEXT         DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (organization_id, year_name)
);

-- Include display_order in index so ORDER BY display_order is index-only.
CREATE INDEX IF NOT EXISTS idx_years_org
    ON college_years(organization_id, display_order);


-- ─────────────────────────────────────────────────────────────
-- 5. COLLEGE BATCHES
-- BREAKING vs original: year_id is now ON DELETE RESTRICT instead of
-- ON DELETE SET NULL. Deleting a college_year with active batches now
-- fails with a FK violation rather than silently orphaning batches.
-- The application must explicitly move or delete batches first.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_batches (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- BREAKING: ON DELETE RESTRICT (was SET NULL in original 017).
    -- Prevents silent batch orphaning when a college_year is removed.
    year_id         UUID         REFERENCES college_years(id) ON DELETE RESTRICT,
    batch_name      TEXT         NOT NULL,
    batch_code      TEXT,
    notes           TEXT,
    status          TEXT         DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (organization_id, batch_name)
);

-- NULL batch_code allowed; uniqueness enforced only when non-NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_org_code
    ON college_batches(organization_id, batch_code)
    WHERE batch_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_batches_org  ON college_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_batches_year ON college_batches(year_id);


-- ─────────────────────────────────────────────────────────────
-- 6. ORGANIZATION STUDENTS
-- Enrollment junction table (organization ↔ student).
-- This is the TPO dashboard's primary query target.
--
-- ✅ NEW: Performance snapshot columns (readiness_tier through score_delta)
-- are maintained by two triggers:
--   trg_org_student_init_perf      — copies from profiles on INSERT.
--   trg_sync_org_student_performance — syncs from profiles on every
--   performance-relevant UPDATE (fires when trg_session_finished from
--   001 writes through to profiles).
-- Never write these columns directly from application code.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_students (
    id                           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id              UUID         NOT NULL REFERENCES organizations(id)      ON DELETE CASCADE,
    user_id                      UUID         NOT NULL REFERENCES profiles(id)           ON DELETE CASCADE,
    student_code                 TEXT,
    department_id                UUID         REFERENCES college_departments(id) ON DELETE SET NULL,
    year_id                      UUID         REFERENCES college_years(id)       ON DELETE SET NULL,
    batch_id                     UUID         REFERENCES college_batches(id)     ON DELETE SET NULL,
    section                      TEXT,
    has_career_access            BOOLEAN      DEFAULT FALSE,
    access_granted_at            TIMESTAMPTZ,
    access_expires_at            TIMESTAMPTZ,
    access_granted_by            UUID         REFERENCES profiles(id) ON DELETE SET NULL,
    status                       TEXT         DEFAULT 'active'
                                 CHECK (status IN ('active', 'inactive', 'removed')),
    notes                        TEXT,

    -- ── DENORMALISED PERFORMANCE SNAPSHOT ─────────────────────────────────
    -- Maintained by trg_org_student_init_perf (on INSERT) and
    -- trg_sync_org_student_performance (AFTER UPDATE on profiles).
    -- Enables O(1) TPO dashboard queries without a 4-table JOIN.
    -- Thresholds: >=75=ready, >=60=almost_ready, >=40=developing, <40=at_risk.
    -- (Same as compute_readiness_tier() defined in 001_initial_schema.sql.)
    readiness_tier               TEXT         NOT NULL DEFAULT 'developing'
                                 CHECK (readiness_tier IN (
                                     'ready', 'almost_ready', 'developing', 'at_risk'
                                 )),
    -- TRUE when: tier=at_risk AND >=3 sessions, OR stuck >=5 sessions,
    -- OR score < 30. (Same logic as profiles.is_zero_offer_risk in 001.)
    is_zero_offer_risk           BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Updated on every FINISHED session via profile sync trigger.
    latest_overall_score         NUMERIC(5,2)
                                 CHECK (latest_overall_score IS NULL
                                     OR (latest_overall_score >= 0 AND latest_overall_score <= 100)),
    -- Set once on first session; never changed. For growth delta computation.
    first_overall_score          NUMERIC(5,2)
                                 CHECK (first_overall_score IS NULL
                                     OR (first_overall_score >= 0 AND first_overall_score <= 100)),
    total_sessions_completed     INT          NOT NULL DEFAULT 0
                                 CHECK (total_sessions_completed >= 0),
    -- Consecutive sessions with score_delta <= 0. Resets on any positive delta.
    sessions_without_improvement INT          NOT NULL DEFAULT 0
                                 CHECK (sessions_without_improvement >= 0),
    -- Set when readiness_tier moves to a strictly higher tier.
    last_improvement_at          TIMESTAMPTZ,
    -- Target score for compute_time_to_threshold(); mirrors profiles.target_score.
    target_score                 NUMERIC(5,2) NOT NULL DEFAULT 75.0
                                 CHECK (target_score >= 0 AND target_score <= 100),
    -- Most recent session's score_delta (positive = improved vs prior session).
    score_delta                  NUMERIC(5,2),

    added_at                     TIMESTAMPTZ  DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);

-- Student code uniqueness within an organization.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_students_code
    ON organization_students(organization_id, student_code)
    WHERE student_code IS NOT NULL;

-- ── Original indexes (preserved) ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_org_students_org
    ON organization_students(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_students_user
    ON organization_students(user_id);
CREATE INDEX IF NOT EXISTS idx_org_students_dept
    ON organization_students(department_id);
CREATE INDEX IF NOT EXISTS idx_org_students_year
    ON organization_students(year_id);
CREATE INDEX IF NOT EXISTS idx_org_students_batch
    ON organization_students(batch_id);
CREATE INDEX IF NOT EXISTS idx_org_students_access
    ON organization_students(organization_id, has_career_access);
CREATE INDEX IF NOT EXISTS idx_org_students_status
    ON organization_students(organization_id, status);

-- ── NEW: TPO analytics indexes ───────────────────────────────────────────
-- Readiness tier grid (Q1) — sort/filter by tier in one index scan.
CREATE INDEX IF NOT EXISTS idx_org_students_tier
    ON organization_students(organization_id, readiness_tier);
-- At-risk list (Q5) — sparse partial index; covers ~10% of rows.
CREATE INDEX IF NOT EXISTS idx_org_students_risk
    ON organization_students(organization_id) WHERE is_zero_offer_risk = TRUE;
-- Department + tier compound (Q2) — breakdown within a department.
CREATE INDEX IF NOT EXISTS idx_org_students_dept_tier
    ON organization_students(organization_id, department_id, readiness_tier);
-- Department + status (Q2) — active students per department.
CREATE INDEX IF NOT EXISTS idx_org_students_dept_status
    ON organization_students(organization_id, department_id, status);
-- Score ranking (Q1) — sorted leaderboard / score distribution.
CREATE INDEX IF NOT EXISTS idx_org_students_score
    ON organization_students(organization_id, latest_overall_score DESC NULLS LAST);


-- ─────────────────────────────────────────────────────────────
-- 7. ORGANIZATION ACCESS LOG (immutable audit trail)
-- ✅ NEW: 13 additional action types covering invite lifecycle,
-- plan changes, report generation, and org lifecycle events.
-- Append-only: no updated_at column. Rows are never modified.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_access_log (
    id              BIGSERIAL    PRIMARY KEY,
    organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_user_id UUID         REFERENCES profiles(id) ON DELETE SET NULL,
    admin_user_id   UUID         REFERENCES profiles(id) ON DELETE SET NULL,
    action          TEXT         NOT NULL
                    CHECK (action IN (
                        -- ── Original: student management ─────────────────
                        'grant_access',
                        'revoke_access',
                        'add_student',
                        'remove_student',
                        'edit_student',
                        'bulk_add',
                        'bulk_grant',
                        'bulk_revoke',
                        'admin_login',
                        -- ── Original: segment (dept/year/batch) management
                        'segment_add',
                        'segment_edit',
                        'segment_delete',
                        -- ── New: invite lifecycle ─────────────────────────
                        'invite_sent',
                        'invite_accepted',
                        'invite_revoked',
                        -- ── New: organisation lifecycle ───────────────────
                        'org_suspended',
                        'org_activated',
                        'access_expired',
                        'seat_limit_updated',
                        'plan_changed',
                        -- ── New: analytics and reporting events ───────────
                        'tier_changed',
                        'report_generated',
                        'snapshot_generated',
                        'export_generated'
                    )),
    entity_type     TEXT,
    entity_id       UUID,
    notes           TEXT,
    metadata        JSONB        DEFAULT '{}',
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_log_org
    ON organization_access_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_student
    ON organization_access_log(student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_admin
    ON organization_access_log(admin_user_id, created_at DESC);
-- ✅ NEW: action-type filter for audit report pages (Q6).
CREATE INDEX IF NOT EXISTS idx_access_log_action
    ON organization_access_log(organization_id, action, created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 8. ORGANIZATION PLAN ALLOCATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_plan_allocations (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan                     TEXT         NOT NULL
                             CHECK (plan IN (
                                 'college_standard', 'college_pro', 'college_enterprise'
                             )),
    seat_limit               INT          NOT NULL CHECK (seat_limit > 0),
    -- seats_used maintained by trg_org_students_seats trigger.
    seats_used               INT          DEFAULT 0 CHECK (seats_used >= 0),
    billing_type             TEXT         DEFAULT 'annual'
                             CHECK (billing_type IN ('monthly', 'annual', 'per_student', 'batch')),
    -- ✅ NEW: amount_paise nullable (some allocations are contract-based
    -- with no direct paise amount), but positive when provided.
    amount_paise             INT
                             CHECK (amount_paise IS NULL OR amount_paise > 0),
    razorpay_subscription_id TEXT,
    razorpay_plan_id         TEXT,
    start_date               TIMESTAMPTZ  DEFAULT NOW(),
    end_date                 TIMESTAMPTZ,
    status                   TEXT         DEFAULT 'active'
                             CHECK (status IN ('active', 'expired', 'cancelled')),
    created_at               TIMESTAMPTZ  DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_allocations_org
    ON org_plan_allocations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_allocations_status
    ON org_plan_allocations(organization_id, status);
-- ✅ NEW: active allocation lookup — covers most org billing queries.
CREATE INDEX IF NOT EXISTS idx_org_allocations_active
    ON org_plan_allocations(organization_id, end_date DESC)
    WHERE status = 'active';


-- ─────────────────────────────────────────────────────────────
-- 9. WEBHOOK EVENTS (global Razorpay idempotency table)
-- ✅ NEW: payload is now NOT NULL, processed BOOLEAN added,
-- user_id and organization_id added for debugging scope,
-- and an unprocessed-event index added for the webhook processor queue.
-- NOTE: billing_events (from 001) handles B2C individual webhooks.
-- This table handles B2B org-level Razorpay subscription webhooks.
-- They coexist intentionally with separate scopes.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
    event_id        TEXT         PRIMARY KEY,
    event_type      TEXT         NOT NULL,
    source          TEXT         NOT NULL DEFAULT 'razorpay',
    -- ✅ NEW: processed flag enables the unprocessed-event queue query
    -- (SELECT ... WHERE NOT processed ORDER BY created_at ASC).
    processed       BOOLEAN      NOT NULL DEFAULT FALSE,
    -- ✅ NEW: scope columns for debugging and audit.
    user_id         UUID         REFERENCES profiles(id)      ON DELETE SET NULL,
    organization_id UUID         REFERENCES organizations(id)  ON DELETE SET NULL,
    -- ✅ NEW: payload NOT NULL — a webhook with no payload is invalid
    -- and should be rejected at the application layer before INSERT.
    payload         JSONB        NOT NULL,
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ✅ NEW: Webhook processor queue — ascending order, unprocessed only.
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed
    ON webhook_events(created_at ASC) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_webhook_events_org
    ON webhook_events(organization_id, created_at DESC)
    WHERE organization_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 10. ALTER TABLE — existing tables
-- ─────────────────────────────────────────────────────────────

-- support_messages: soft-archive instead of hard-delete.
-- REQUIRES: support_messages table must exist (created in migrations 002–016).
-- See Phase 4 §4.4 Assumption #1 if this migration fails here.
ALTER TABLE support_messages
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- user_plan_entitlements: subscription tracking fields (original additions).
ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS subscription_id     TEXT;
ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS next_charge_at      TIMESTAMPTZ;
ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS billing_type        TEXT DEFAULT 'one_time'
        CHECK (billing_type IN ('one_time', 'subscription'));

-- profiles: org-awareness flags (original additions).
-- ┌─ DEPRECATION NOTICE ──────────────────────────────────────────────────┐
-- │ profiles.institution_id (→ institutions, added in 001_initial_schema) │
-- │ is now SUPERSEDED by profiles.organization_id (→ organizations).      │
-- │ Do NOT populate institution_id for new students; use organization_id. │
-- │ Run 018_consolidate_b2b.sql to migrate existing data, then drop       │
-- │ institution_id, the institution_admins table, and institutions table.  │
-- └───────────────────────────────────────────────────────────────────────┘
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_org_admin    BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS organization_id UUID
        REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS org_student     BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_org
    ON profiles(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_org_admin
    ON profiles(is_org_admin)    WHERE is_org_admin    = TRUE;

-- ── ANALYTICS BRIDGE: interview_sessions ─────────────────────────────────
-- ✅ NEW: Adds organization_id and department_id to interview_sessions.
-- Both are populated at INSERT time by trg_sessions_org_context (below).
-- This is the single most impactful change in this migration:
-- it makes all org-scoped cohort analytics possible without JOINing
-- through organization_students on every query.
--
-- ┌─ DEPRECATION NOTICE ──────────────────────────────────────────────────┐
-- │ interview_sessions.institution_id (→ institutions, added in 001 v2)   │
-- │ is SUPERSEDED by interview_sessions.organization_id (→ organizations). │
-- │ Run 018_consolidate_b2b.sql to backfill organization_id from         │
-- │ organization_students and drop institution_id.                        │
-- └───────────────────────────────────────────────────────────────────────┘
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS organization_id UUID
        REFERENCES organizations(id)      ON DELETE SET NULL;
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS department_id   UUID
        REFERENCES college_departments(id) ON DELETE SET NULL;

-- ✅ NEW: Indexes for org-scoped session analytics queries.
CREATE INDEX IF NOT EXISTS idx_sessions_org
    ON interview_sessions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_org_finished
    ON interview_sessions(organization_id, finished_at DESC)
    WHERE state = 'FINISHED';
CREATE INDEX IF NOT EXISTS idx_sessions_org_dept
    ON interview_sessions(organization_id, department_id);


-- ─────────────────────────────────────────────────────────────
-- 11. ORG BILLING PAYMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_payments (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider                 TEXT         NOT NULL DEFAULT 'razorpay',
    plan                     TEXT         NOT NULL
                             CHECK (plan IN (
                                 'college_standard', 'college_pro', 'college_enterprise'
                             )),
    -- ✅ NEW: CHECK(amount_paise > 0) — prevents a zero or negative paise
    -- value from being webhook-verified to grant plan access for free.
    amount_paise             INT          NOT NULL CHECK (amount_paise > 0),
    currency                 TEXT         NOT NULL DEFAULT 'INR',
    status                   TEXT         NOT NULL DEFAULT 'created'
                             CHECK (status IN (
                                 'created', 'pending', 'verified', 'failed', 'refunded', 'expired'
                             )),
    razorpay_order_id        TEXT         UNIQUE,
    razorpay_payment_id      TEXT,
    razorpay_signature       TEXT,
    razorpay_subscription_id TEXT,
    invoice_number           TEXT,
    billing_period_start     TIMESTAMPTZ,
    billing_period_end       TIMESTAMPTZ,
    seat_count               INT          CHECK (seat_count IS NULL OR seat_count > 0),
    webhook_event_id         TEXT,
    notes                    TEXT,
    created_at               TIMESTAMPTZ  DEFAULT NOW(),
    verified_at              TIMESTAMPTZ,
    refunded_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_payments_org
    ON org_payments(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_payments_order
    ON org_payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_org_payments_sub
    ON org_payments(razorpay_subscription_id)
    WHERE razorpay_subscription_id IS NOT NULL;
-- ✅ NEW: verified payments for billing history pages (Q6).
CREATE INDEX IF NOT EXISTS idx_org_payments_verified
    ON org_payments(organization_id, verified_at DESC)
    WHERE status = 'verified';


-- ─────────────────────────────────────────────────────────────
-- 12. ORG ADMIN INVITES (new)
-- Proper invitation state machine. Supersedes the two-column
-- (invite_token, invite_sent_at) approach on organization_admins.
-- Those columns are kept for backward compatibility on the old table
-- but new invite flows should INSERT here instead.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_admin_invites (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invited_email   TEXT         NOT NULL,
    invited_by      UUID         REFERENCES profiles(id) ON DELETE SET NULL,
    role            TEXT         NOT NULL DEFAULT 'org_admin'
                    CHECK (role IN (
                        'org_admin', 'dept_admin', 'viewer', 'placement_officer'
                    )),
    -- dept_admin only: scopes this invite to a specific department.
    department_id   UUID         REFERENCES college_departments(id) ON DELETE SET NULL,
    -- UNIQUE per pending invite — prevents duplicate pending tokens.
    token           TEXT         NOT NULL UNIQUE,
    status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    sent_at         TIMESTAMPTZ  DEFAULT NOW(),
    accepted_at     TIMESTAMPTZ,
    -- Default 7-day expiry. Override for longer enterprise invite windows.
    expires_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS idx_org_invites_org
    ON org_admin_invites(organization_id, status);
CREATE INDEX        IF NOT EXISTS idx_org_invites_email
    ON org_admin_invites(invited_email, status);
-- Partial: only pending tokens need fast lookup (token validation on accept).
CREATE INDEX        IF NOT EXISTS idx_org_invites_token
    ON org_admin_invites(token) WHERE status = 'pending';


-- ─────────────────────────────────────────────────────────────
-- 13. ORG COHORT SNAPSHOTS (new)
-- Organisation-keyed version of cohort_snapshots (from 001).
-- Uses normalized UUID FKs for department/year/batch instead of
-- the plain text slices in the 001 version.
-- Written by a backend scheduled job (nightly) or on-demand after
-- a significant batch of sessions finishes.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_cohort_snapshots (
    id                   BIGSERIAL    PRIMARY KEY,
    organization_id      UUID         NOT NULL REFERENCES organizations(id)      ON DELETE CASCADE,
    snapshot_date        DATE         NOT NULL,
    -- All FK slice dimensions are nullable.
    -- All NULL = organisation-wide snapshot.
    -- dept only = department-level.   dept+year = year-within-dept.
    -- dept+batch = batch-level.
    department_id        UUID         REFERENCES college_departments(id) ON DELETE SET NULL,
    year_id              UUID         REFERENCES college_years(id)       ON DELETE SET NULL,
    batch_id             UUID         REFERENCES college_batches(id)     ON DELETE SET NULL,
    -- ── HEADCOUNTS ───────────────────────────────────────────────────────
    total_students       INT          NOT NULL DEFAULT 0,
    -- active_students: enrolled with >= 1 FINISHED session this period.
    active_students      INT          NOT NULL DEFAULT 0,
    total_sessions       INT          NOT NULL DEFAULT 0,
    -- ── OVERALL SCORE ────────────────────────────────────────────────────
    avg_overall_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- ── ALL 14 RUBRIC CATEGORY AVERAGES (0–10 scale, matches skill_scores)
    avg_communication    NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_technical_depth  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_problem_solving  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_confidence       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_structure_star   NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_vocabulary       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_vocal_delivery   NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_leadership       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_teamwork         NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_adaptability     NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_reasoning        NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_conciseness      NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_professionalism  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_role_fit         NUMERIC(4,2) NOT NULL DEFAULT 0,
    -- ── READINESS TIER DISTRIBUTION ──────────────────────────────────────
    ready_count          INT          NOT NULL DEFAULT 0,
    almost_ready_count   INT          NOT NULL DEFAULT 0,
    developing_count     INT          NOT NULL DEFAULT 0,
    at_risk_count        INT          NOT NULL DEFAULT 0,
    -- ── GROWTH METRICS ────────────────────────────────────────────────────
    -- avg_score_delta: mean session score_delta across active students.
    -- avg_slope: mean OLS regression slope (score-points per session).
    avg_score_delta      NUMERIC(5,2),
    avg_slope            NUMERIC(5,3),
    created_at           TIMESTAMPTZ  DEFAULT NOW()
);

-- Expression-based unique index handles NULL FK combinations.
-- COALESCE maps NULL UUID → empty string for equality comparison in the index,
-- ensuring only one org-wide snapshot per (org, date) combination.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_cohort_snapshots_unique
    ON org_cohort_snapshots(
        organization_id,
        snapshot_date,
        COALESCE(department_id::TEXT, ''),
        COALESCE(year_id::TEXT,       ''),
        COALESCE(batch_id::TEXT,      '')
    );

-- ✅ Time-series trend chart — most common read pattern.
CREATE INDEX IF NOT EXISTS idx_org_cohort_snapshots_date
    ON org_cohort_snapshots(organization_id, snapshot_date DESC);
-- ✅ Department-level comparison chart.
CREATE INDEX IF NOT EXISTS idx_org_cohort_snapshots_dept
    ON org_cohort_snapshots(organization_id, department_id, snapshot_date DESC);


-- ─────────────────────────────────────────────────────────────
-- SECTION: RLS HELPER FUNCTIONS
-- All SECURITY DEFINER: execute as the function owner to read
-- organization_admins / organization_students without granting
-- SELECT on those tables to the authenticated role. Standard
-- Supabase RLS helper pattern.
-- ─────────────────────────────────────────────────────────────

-- Returns TRUE if the current user is an active admin (any role) for the
-- specified organization. Used in RLS policies on organizations,
-- org_cohort_snapshots, org_plan_allocations, org_payments.
CREATE OR REPLACE FUNCTION is_org_admin(p_organization_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   organization_admins
        WHERE  user_id         = auth.uid()
          AND  organization_id = p_organization_id
          AND  status          = 'active'
    );
$$;

-- Returns the organization_id of the current user's active admin membership.
-- NULL if the current user is not an org admin.
CREATE OR REPLACE FUNCTION get_admin_organization_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT organization_id
    FROM   organization_admins
    WHERE  user_id = auth.uid()
      AND  status  = 'active'
    ORDER  BY created_at
    LIMIT  1;
$$;

-- Returns TRUE if the current user is an active enrolled student in the
-- specified organization. Used in student self-select RLS policies on
-- organizations, college_departments, college_years, college_batches.
CREATE OR REPLACE FUNCTION is_student_in_org(p_organization_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   organization_students
        WHERE  user_id         = auth.uid()
          AND  organization_id = p_organization_id
          AND  status          = 'active'
    );
$$;

-- Returns the organization_id of the current user's active enrollment.
-- NULL if the current user is not an enrolled student.
CREATE OR REPLACE FUNCTION get_student_organization_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT organization_id
    FROM   organization_students
    WHERE  user_id = auth.uid()
      AND  status  = 'active'
    ORDER  BY added_at
    LIMIT  1;
$$;

-- Returns TRUE if the current user can view data for the given
-- organization + department combination, respecting dept_admin scope.
-- org_admin / viewer / placement_officer → full org access.
-- dept_admin → only their assigned department_id (or all if NULL).
-- Used in organization_students RLS policy.
CREATE OR REPLACE FUNCTION org_admin_can_view_department(
    p_organization_id UUID,
    p_department_id   UUID
)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   organization_admins
        WHERE  user_id         = auth.uid()
          AND  organization_id = p_organization_id
          AND  status          = 'active'
          AND  (
              role IN ('org_admin', 'viewer', 'placement_officer')
              OR
              (role = 'dept_admin'
               AND (department_id IS NULL OR department_id = p_department_id))
          )
    );
$$;


-- ─────────────────────────────────────────────────────────────
-- SECTION: TRIGGER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- ── _assign_session_org_context ────────────────────────────────────────────
-- BEFORE INSERT on interview_sessions.
-- Fires AFTER trg_sessions_assign_number (from 001) alphabetically,
-- since 'trg_sessions_assign_number' < 'trg_sessions_org_context'.
-- Sets organization_id and department_id from the student's active
-- enrollment in organization_students, so cohort analytics queries
-- never need to JOIN through profiles or organization_students.
CREATE OR REPLACE FUNCTION _assign_session_org_context()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Only auto-fill when not already provided by the caller.
    -- The caller may pre-populate these for admin-created sessions.
    IF NEW.organization_id IS NULL OR NEW.department_id IS NULL THEN
        SELECT os.organization_id, os.department_id
        INTO   NEW.organization_id, NEW.department_id
        FROM   organization_students os
        WHERE  os.user_id = NEW.user_id
          AND  os.status  = 'active'
        ORDER  BY os.added_at DESC
        LIMIT  1;
        -- Limit 1: one active enrollment per student is the expected invariant.
        -- If a student has multiple active enrollments (e.g., after a transfer),
        -- the newest enrollment wins.
    END IF;
    RETURN NEW;
END;
$$;


-- ── _maintain_seats_used ───────────────────────────────────────────────────
-- AFTER INSERT OR UPDATE OF status OR DELETE on organization_students.
-- Recomputes organizations.seats_used via COUNT(*) rather than increment/
-- decrement to prevent numeric drift from concurrent operations or
-- out-of-band data changes.
-- Only active + inactive students count toward seat consumption;
-- 'removed' students do not.
CREATE OR REPLACE FUNCTION _maintain_seats_used()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Determine the affected org from whichever row is available.
    -- NEW exists on INSERT and UPDATE; OLD exists on DELETE and UPDATE.
    v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);

    UPDATE organizations
    SET    seats_used = (
               SELECT COUNT(*)
               FROM   organization_students
               WHERE  organization_id = v_org_id
                 AND  status         <> 'removed'
           )
    WHERE  id = v_org_id;

    RETURN NULL;  -- AFTER trigger; return value is ignored by PostgreSQL.
END;
$$;


-- ── _init_org_student_performance ─────────────────────────────────────────
-- AFTER INSERT on organization_students.
-- Copies the student's existing performance snapshot from profiles into
-- the new enrollment row. Handles the common case where a student already
-- has completed sessions at the time of TPO enrollment.
CREATE OR REPLACE FUNCTION _init_org_student_performance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE organization_students os
    SET
        readiness_tier               = p.readiness_tier,
        is_zero_offer_risk           = p.is_zero_offer_risk,
        latest_overall_score         = p.latest_overall_score,
        first_overall_score          = p.first_overall_score,
        total_sessions_completed     = p.total_sessions_completed,
        sessions_without_improvement = p.sessions_without_improvement,
        last_improvement_at          = p.last_improvement_at,
        target_score                 = p.target_score,
        -- Backfill score_delta from the student's most recent FINISHED session.
        score_delta                  = (
            SELECT score_delta
            FROM   interview_sessions
            WHERE  user_id     = NEW.user_id
              AND  state       = 'FINISHED'
              AND  score_delta IS NOT NULL
            ORDER  BY session_number DESC NULLS LAST
            LIMIT  1
        ),
        updated_at                   = NOW()
    FROM  profiles p
    WHERE os.id = NEW.id
      AND p.id  = NEW.user_id;

    RETURN NULL;
END;
$$;


-- ── _sync_org_student_performance ─────────────────────────────────────────
-- AFTER UPDATE on profiles.
-- Fires only when performance-relevant fields actually change (WHEN clause
-- on the trigger below). This means it fires when trg_session_finished
-- (from 001_initial_schema.sql) updates profiles — not on avatar/email/theme
-- changes — keeping hot-path overhead near zero.
-- Syncs key performance fields to the student's active enrollment row.
CREATE OR REPLACE FUNCTION _sync_org_student_performance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE organization_students
    SET
        readiness_tier               = NEW.readiness_tier,
        is_zero_offer_risk           = NEW.is_zero_offer_risk,
        latest_overall_score         = NEW.latest_overall_score,
        first_overall_score          = NEW.first_overall_score,
        total_sessions_completed     = NEW.total_sessions_completed,
        sessions_without_improvement = NEW.sessions_without_improvement,
        last_improvement_at          = NEW.last_improvement_at,
        target_score                 = NEW.target_score,
        updated_at                   = NOW()
    WHERE user_id = NEW.id
      AND status  = 'active';

    RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- SECTION: TRIGGER BINDINGS
-- ─────────────────────────────────────────────────────────────

-- ── updated_at maintenance (8 new tables) ─────────────────────────────────
-- Reuses _set_updated_at() defined in 001_initial_schema.sql.
CREATE OR REPLACE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE OR REPLACE TRIGGER trg_org_admins_updated_at
    BEFORE UPDATE ON organization_admins
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE OR REPLACE TRIGGER trg_college_departments_updated_at
    BEFORE UPDATE ON college_departments
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE OR REPLACE TRIGGER trg_college_years_updated_at
    BEFORE UPDATE ON college_years
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE OR REPLACE TRIGGER trg_college_batches_updated_at
    BEFORE UPDATE ON college_batches
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE OR REPLACE TRIGGER trg_org_students_updated_at
    BEFORE UPDATE ON organization_students
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE OR REPLACE TRIGGER trg_org_allocations_updated_at
    BEFORE UPDATE ON org_plan_allocations
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE OR REPLACE TRIGGER trg_org_payments_updated_at
    BEFORE UPDATE ON org_payments
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ── Session org context (analytics bridge) ────────────────────────────────
-- Fires AFTER trg_sessions_assign_number from 001 because trigger names
-- execute alphabetically: 'trg_sessions_assign_number' < 'trg_sessions_org_context'.
CREATE OR REPLACE TRIGGER trg_sessions_org_context
    BEFORE INSERT ON interview_sessions
    FOR EACH ROW EXECUTE FUNCTION _assign_session_org_context();

-- ── Seat count maintenance ─────────────────────────────────────────────────
-- Split into two triggers to target only the relevant operations:
-- INSERT/DELETE (new enrollment or hard-remove) and status changes.
CREATE OR REPLACE TRIGGER trg_org_students_seats_iud
    AFTER INSERT OR DELETE ON organization_students
    FOR EACH ROW EXECUTE FUNCTION _maintain_seats_used();

CREATE OR REPLACE TRIGGER trg_org_students_seats_status
    AFTER UPDATE OF status ON organization_students
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION _maintain_seats_used();

-- ── Performance snapshot — init on enrollment ─────────────────────────────
CREATE OR REPLACE TRIGGER trg_org_student_init_perf
    AFTER INSERT ON organization_students
    FOR EACH ROW EXECUTE FUNCTION _init_org_student_performance();

-- ── Performance snapshot — sync on profile update ─────────────────────────
-- WHEN clause: fires only when performance-relevant fields change.
-- This precisely matches what trg_session_finished in 001 writes,
-- so the trigger overhead on the profiles hot-path is near zero.
CREATE OR REPLACE TRIGGER trg_sync_org_student_performance
    AFTER UPDATE ON profiles
    FOR EACH ROW
    WHEN (
        OLD.readiness_tier              IS DISTINCT FROM NEW.readiness_tier
        OR OLD.latest_overall_score     IS DISTINCT FROM NEW.latest_overall_score
        OR OLD.is_zero_offer_risk       IS DISTINCT FROM NEW.is_zero_offer_risk
        OR OLD.total_sessions_completed IS DISTINCT FROM NEW.total_sessions_completed
    )
    EXECUTE FUNCTION _sync_org_student_performance();


-- ─────────────────────────────────────────────────────────────
-- SECTION: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
-- NOTE: The anon key is public in the browser bundle. Without RLS,
-- any authenticated user can query organization rosters, student
-- performance data, and billing records via Supabase's REST API.
-- These policies enforce access control at the PostgreSQL engine level.

ALTER TABLE organizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_admins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_departments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_years           ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_plan_allocations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_admin_invites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_cohort_snapshots    ENABLE ROW LEVEL SECURITY;

-- ── organizations ─────────────────────────────────────────────────────────
-- Org admins can SELECT their own organization record (for dashboard header).
CREATE POLICY orgs_admin_select ON organizations
    FOR SELECT USING (is_org_admin(id));
-- Students can SELECT their enrolled organization (to display org name/logo).
CREATE POLICY orgs_student_select ON organizations
    FOR SELECT USING (is_student_in_org(id));

-- ── organization_admins ───────────────────────────────────────────────────
-- Each admin can SELECT their own membership row (to check their own role).
CREATE POLICY org_admins_self ON organization_admins
    FOR SELECT USING (user_id = auth.uid());
-- Org admins can SELECT all admin records in their organization.
CREATE POLICY org_admins_org_select ON organization_admins
    FOR SELECT USING (is_org_admin(organization_id));

-- ── college_departments ───────────────────────────────────────────────────
-- Org admins can SELECT, INSERT, UPDATE departments (org setup workflow).
CREATE POLICY depts_admin_select ON college_departments
    FOR SELECT USING (is_org_admin(organization_id));
CREATE POLICY depts_admin_insert ON college_departments
    FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY depts_admin_update ON college_departments
    FOR UPDATE USING (is_org_admin(organization_id));
-- Students can SELECT their org's active departments (profile display).
CREATE POLICY depts_student_select ON college_departments
    FOR SELECT USING (
        status = 'active' AND is_student_in_org(organization_id)
    );

-- ── college_years ─────────────────────────────────────────────────────────
CREATE POLICY years_admin_select ON college_years
    FOR SELECT USING (is_org_admin(organization_id));
CREATE POLICY years_admin_insert ON college_years
    FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY years_admin_update ON college_years
    FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY years_student_select ON college_years
    FOR SELECT USING (
        status = 'active' AND is_student_in_org(organization_id)
    );

-- ── college_batches ───────────────────────────────────────────────────────
CREATE POLICY batches_admin_select ON college_batches
    FOR SELECT USING (is_org_admin(organization_id));
CREATE POLICY batches_admin_insert ON college_batches
    FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY batches_admin_update ON college_batches
    FOR UPDATE USING (is_org_admin(organization_id));
CREATE POLICY batches_student_select ON college_batches
    FOR SELECT USING (
        status = 'active' AND is_student_in_org(organization_id)
    );

-- ── organization_students ─────────────────────────────────────────────────
-- Students can SELECT their own enrollment record (to see dept/batch/access).
CREATE POLICY org_students_self ON organization_students
    FOR SELECT USING (user_id = auth.uid());
-- Org admins see all students in their org, scoped by dept for dept_admin.
CREATE POLICY org_students_admin_select ON organization_students
    FOR SELECT USING (
        org_admin_can_view_department(organization_id, department_id)
    );
-- Org admins can INSERT new student enrollments.
CREATE POLICY org_students_admin_insert ON organization_students
    FOR INSERT WITH CHECK (is_org_admin(organization_id));
-- Org admins can UPDATE enrollment: status, access grants, batch/dept moves.
CREATE POLICY org_students_admin_update ON organization_students
    FOR UPDATE USING (is_org_admin(organization_id));

-- ── organization_access_log ───────────────────────────────────────────────
-- Org admins can SELECT their org's audit trail (read-only).
-- INSERT is backend service role only — no client-side writes.
CREATE POLICY access_log_admin_select ON organization_access_log
    FOR SELECT USING (is_org_admin(organization_id));

-- ── org_plan_allocations ──────────────────────────────────────────────────
-- Org admins can SELECT their org's active plan allocations.
CREATE POLICY allocations_admin_select ON org_plan_allocations
    FOR SELECT USING (is_org_admin(organization_id));

-- ── webhook_events ────────────────────────────────────────────────────────
-- No direct client access — backend service role only (idempotency table).
CREATE POLICY webhook_events_deny_all ON webhook_events
    FOR ALL USING (FALSE);

-- ── org_payments ──────────────────────────────────────────────────────────
-- Org admins can SELECT payment history for their organization.
CREATE POLICY org_payments_admin_select ON org_payments
    FOR SELECT USING (is_org_admin(organization_id));

-- ── org_admin_invites ─────────────────────────────────────────────────────
-- Org admins can SELECT and INSERT invites.
CREATE POLICY invites_admin_select ON org_admin_invites
    FOR SELECT USING (is_org_admin(organization_id));
CREATE POLICY invites_admin_insert ON org_admin_invites
    FOR INSERT WITH CHECK (is_org_admin(organization_id));
-- Invitee can SELECT their own pending invite (for the accept-invite page).
CREATE POLICY invites_self_select ON org_admin_invites
    FOR SELECT USING (
        status        = 'pending'
        AND invited_email = (SELECT email FROM profiles WHERE id = auth.uid())
    );

-- ── org_cohort_snapshots ──────────────────────────────────────────────────
-- Org admins can SELECT, INSERT, and UPDATE snapshots for their org.
-- INSERT and UPDATE are typically done by the backend service role, but
-- these policies allow on-demand refresh via the Supabase client as well.
CREATE POLICY cohort_snaps_admin_select ON org_cohort_snapshots
    FOR SELECT USING (is_org_admin(organization_id));
CREATE POLICY cohort_snaps_admin_insert ON org_cohort_snapshots
    FOR INSERT WITH CHECK (is_org_admin(organization_id));
CREATE POLICY cohort_snaps_admin_update ON org_cohort_snapshots
    FOR UPDATE USING (is_org_admin(organization_id));

-- ── END OF 017_college_organization.sql ───────────────────────────────────