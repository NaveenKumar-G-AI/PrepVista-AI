-- ================================================================================
-- 025_recruiter_companies.sql
-- Part 2 Integration - Companies & Recruiters CRM
-- Additive and idempotent.
-- ================================================================================

-- Configurable industry taxonomy per organization
CREATE TABLE IF NOT EXISTS recruiter_industries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS idx_recruiter_industries_org ON recruiter_industries (organization_id);

-- Company (recruiter CRM record)
CREATE TABLE IF NOT EXISTS recruiter_companies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    normalized_name       TEXT NOT NULL,
    legal_name            TEXT,
    brand_name            TEXT,
    website               TEXT,
    website_domain        TEXT,
    industry_id           UUID REFERENCES recruiter_industries(id) ON DELETE SET NULL,
    sector                TEXT,
    company_size          TEXT,
    headquarters_city     TEXT,
    headquarters_state    TEXT,
    headquarters_country  TEXT,
    description           TEXT,
    status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
    relationship_stage    TEXT NOT NULL DEFAULT 'PROSPECT'
                              CHECK (relationship_stage IN (
                                  'PROSPECT','CONTACTED','INTERESTED','REQUIREMENT_RECEIVED',
                                  'DRIVE_SCHEDULED','DRIVE_COMPLETED','HIRING','REPEAT_RECRUITER','INACTIVE'
                              )),
    relationship_owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_repeat_recruiter   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rc_org       ON recruiter_companies (organization_id);
CREATE INDEX IF NOT EXISTS idx_rc_org_stage ON recruiter_companies (organization_id, relationship_stage);
CREATE INDEX IF NOT EXISTS idx_rc_norm_name ON recruiter_companies (organization_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_rc_domain    ON recruiter_companies (organization_id, website_domain) WHERE website_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rc_status    ON recruiter_companies (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_rc_repeat    ON recruiter_companies (organization_id, is_repeat_recruiter) WHERE is_repeat_recruiter = TRUE;

-- Recruiter contacts (multiple per company)
CREATE TABLE IF NOT EXISTS recruiter_contacts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id        UUID NOT NULL REFERENCES recruiter_companies(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    designation       TEXT,
    department        TEXT,
    email             TEXT,
    phone             TEXT,
    alternate_phone   TEXT,
    linkedin_url      TEXT,
    preferred_channel TEXT CHECK (preferred_channel IN ('EMAIL','PHONE','WHATSAPP','LINKEDIN','OTHER')),
    notes             TEXT,
    status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rcon_org     ON recruiter_contacts (organization_id);
CREATE INDEX IF NOT EXISTS idx_rcon_company ON recruiter_contacts (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rcon_primary ON recruiter_contacts (company_id) WHERE is_primary = TRUE AND status = 'ACTIVE';

-- Activity timeline
CREATE TABLE IF NOT EXISTS recruiter_activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id      UUID NOT NULL REFERENCES recruiter_companies(id) ON DELETE CASCADE,
    contact_id      UUID REFERENCES recruiter_contacts(id) ON DELETE SET NULL,
    actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    type            TEXT NOT NULL CHECK (type IN (
                        'CALL','EMAIL','MEETING','VISIT','RECRUITER_REQUEST',
                        'REQUIREMENT_RECEIVED','DRIVE_DISCUSSION','FOLLOWUP','NOTE','OTHER'
                    )),
    subject         TEXT,
    summary         TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    next_action     TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ract_company_time ON recruiter_activities (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ract_org_time     ON recruiter_activities (organization_id, occurred_at DESC);

-- Follow-ups (OVERDUE computed at read time, never stored)
CREATE TABLE IF NOT EXISTS recruiter_followups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id      UUID NOT NULL REFERENCES recruiter_companies(id) ON DELETE CASCADE,
    contact_id      UUID REFERENCES recruiter_contacts(id) ON DELETE SET NULL,
    owner_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    priority        TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    due_at          TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
    completed_at    TIMESTAMPTZ,
    completed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rfu_org_status_due ON recruiter_followups (organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_rfu_owner_status   ON recruiter_followups (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_rfu_company        ON recruiter_followups (company_id, status);

-- Notes
CREATE TABLE IF NOT EXISTS recruiter_company_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id      UUID NOT NULL REFERENCES recruiter_companies(id) ON DELETE CASCADE,
    author_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rnote_company ON recruiter_company_notes (company_id, created_at DESC);

-- Stage transition history (immutable audit)
CREATE TABLE IF NOT EXISTS recruiter_status_history (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES recruiter_companies(id) ON DELETE CASCADE,
    old_stage  TEXT,
    new_stage  TEXT NOT NULL,
    actor_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reason     TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rsh_company ON recruiter_status_history (company_id, changed_at DESC);
