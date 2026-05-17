-- ============================================================
-- 017 — College Organization B2B Infrastructure
-- Adds all tables required for the college secondary admin system.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Organizations (college-only for this build)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'college'
        CHECK (category IN ('college')),
    org_code TEXT UNIQUE NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    placement_cell_name TEXT,
    branch_code TEXT,
    plan TEXT DEFAULT 'college_standard',
    seat_limit INT DEFAULT 50,
    seats_used INT DEFAULT 0,
    access_expiry TIMESTAMPTZ,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'expired', 'pending')),
    notes TEXT,
    created_by_admin_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Functional check: org_code must always start with COL-
-- (enforced at application layer; DB constraint as safety net)
ALTER TABLE organizations
    ADD CONSTRAINT chk_org_code_format
    CHECK (org_code ~ '^COL-[0-9]{4,}$');

CREATE INDEX IF NOT EXISTS idx_organizations_category ON organizations(category);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_org_code ON organizations(org_code);


-- ────────────────────────────────────────────────────────────
-- 2. Organization Admins (college secondary admins)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    role TEXT DEFAULT 'org_admin',
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login TIMESTAMPTZ,
    invite_token TEXT,
    invite_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_admins_org ON organization_admins(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_admins_user ON organization_admins(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_admins_org_user ON organization_admins(organization_id, user_id);


-- ────────────────────────────────────────────────────────────
-- 3. College Departments
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_name TEXT NOT NULL,
    department_code TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, department_name)
);

-- Allow NULL department_code but enforce uniqueness when set
CREATE UNIQUE INDEX IF NOT EXISTS idx_dept_org_code
    ON college_departments(organization_id, department_code)
    WHERE department_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_org ON college_departments(organization_id);


-- ────────────────────────────────────────────────────────────
-- 4. College Years
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    year_name TEXT NOT NULL,
    display_order INT DEFAULT 1,
    notes TEXT,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, year_name)
);

CREATE INDEX IF NOT EXISTS idx_years_org ON college_years(organization_id);


-- ────────────────────────────────────────────────────────────
-- 5. College Batches
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    year_id UUID REFERENCES college_years(id) ON DELETE SET NULL,
    batch_name TEXT NOT NULL,
    batch_code TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, batch_name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_org_code
    ON college_batches(organization_id, batch_code)
    WHERE batch_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_batches_org ON college_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_batches_year ON college_batches(year_id);


-- ────────────────────────────────────────────────────────────
-- 6. Organization Students
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    student_code TEXT,
    department_id UUID REFERENCES college_departments(id) ON DELETE SET NULL,
    year_id UUID REFERENCES college_years(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES college_batches(id) ON DELETE SET NULL,
    section TEXT,
    has_career_access BOOLEAN DEFAULT FALSE,
    access_granted_at TIMESTAMPTZ,
    access_expires_at TIMESTAMPTZ,
    access_granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'removed')),
    notes TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- Student code uniqueness within an organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_students_code
    ON organization_students(organization_id, student_code)
    WHERE student_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_students_org ON organization_students(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_students_user ON organization_students(user_id);
CREATE INDEX IF NOT EXISTS idx_org_students_dept ON organization_students(department_id);
CREATE INDEX IF NOT EXISTS idx_org_students_year ON organization_students(year_id);
CREATE INDEX IF NOT EXISTS idx_org_students_batch ON organization_students(batch_id);
CREATE INDEX IF NOT EXISTS idx_org_students_access ON organization_students(organization_id, has_career_access);
CREATE INDEX IF NOT EXISTS idx_org_students_status ON organization_students(organization_id, status);


-- ────────────────────────────────────────────────────────────
-- 7. Organization Access Log (immutable audit trail)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_access_log (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    admin_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL
        CHECK (action IN (
            'grant_access',
            'revoke_access',
            'add_student',
            'remove_student',
            'edit_student',
            'bulk_add',
            'bulk_grant',
            'admin_login',
            'segment_add',
            'segment_edit',
            'segment_delete'
        )),
    entity_type TEXT,
    entity_id UUID,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_log_org ON organization_access_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_student ON organization_access_log(student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_admin ON organization_access_log(admin_user_id, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- 8. Organization Plan Allocations (billing/package tracking)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_plan_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    seat_limit INT NOT NULL,
    seats_used INT DEFAULT 0,
    billing_type TEXT DEFAULT 'annual'
        CHECK (billing_type IN ('monthly', 'annual', 'per_student', 'batch')),
    amount_paise INT,
    razorpay_subscription_id TEXT,
    razorpay_plan_id TEXT,
    start_date TIMESTAMPTZ DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_allocations_org ON org_plan_allocations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_allocations_status ON org_plan_allocations(organization_id, status);


-- ────────────────────────────────────────────────────────────
-- 9. Webhook Events (global idempotency table)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT,
    source TEXT DEFAULT 'razorpay',
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    payload JSONB
);


-- ────────────────────────────────────────────────────────────
-- 10. Additional columns on existing tables
-- ────────────────────────────────────────────────────────────

-- support_messages: soft-archive instead of hard-delete
ALTER TABLE support_messages
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- user_plan_entitlements: subscription tracking fields
ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS subscription_id TEXT;

ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS subscription_status TEXT;

ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS next_charge_at TIMESTAMPTZ;

ALTER TABLE user_plan_entitlements
    ADD COLUMN IF NOT EXISTS billing_type TEXT DEFAULT 'one_time'
        CHECK (billing_type IN ('one_time', 'subscription'));

-- profiles: org_admin role flag and organization link
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_org_admin BOOLEAN DEFAULT FALSE;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS org_student BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_org_admin ON profiles(is_org_admin) WHERE is_org_admin = TRUE;


-- ────────────────────────────────────────────────────────────
-- 11. Org billing payments (organization-level payments)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    plan TEXT NOT NULL,
    amount_paise INT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'pending', 'verified', 'failed', 'refunded', 'expired')),
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    razorpay_subscription_id TEXT,
    invoice_number TEXT,
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,
    seat_count INT,
    webhook_event_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_payments_org ON org_payments(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_payments_order ON org_payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_org_payments_sub ON org_payments(razorpay_subscription_id);
