-- ============================================================================
-- 026_placement_drives.sql  (Part 3 Integration - Smart Eligibility Engine)
-- Additive and idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS placement_drives (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    company_name    TEXT NOT NULL,
    company_id      UUID REFERENCES recruiter_companies(id) ON DELETE SET NULL,
    role            TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN (
                            'DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED',
                            'APPLICATIONS_OPEN','APPLICATIONS_CLOSED',
                            'IN_PROGRESS','SELECTION_PENDING',
                            'COMPLETED','CANCELLED','ARCHIVED'
                        )),
    active_rule_version_fk UUID,
    created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pd_org        ON placement_drives (organization_id);
CREATE INDEX IF NOT EXISTS idx_pd_org_status ON placement_drives (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_pd_company    ON placement_drives (company_id) WHERE company_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS drive_eligibility_rule_versions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id       UUID NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    rule_tree      JSONB NOT NULL,
    created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason         TEXT,
    UNIQUE (drive_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_derv_drive ON drive_eligibility_rule_versions (drive_id);

CREATE TABLE IF NOT EXISTS drive_eligibility_snapshots (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id                 UUID NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    rule_version_id          UUID NOT NULL REFERENCES drive_eligibility_rule_versions(id),
    computed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_students           INTEGER NOT NULL,
    eligible_count           INTEGER NOT NULL,
    not_eligible_count       INTEGER NOT NULL,
    category_breakdown       JSONB NOT NULL,
    eligible_student_ids     JSONB NOT NULL,
    not_eligible_student_ids JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_des_drive ON drive_eligibility_snapshots (drive_id);

CREATE TABLE IF NOT EXISTS drive_audit_log (
    id          BIGSERIAL PRIMARY KEY,
    drive_id    UUID NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor_label TEXT,
    event_type  TEXT NOT NULL,
    from_status TEXT,
    to_status   TEXT,
    detail      JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dal_drive ON drive_audit_log (drive_id, occurred_at DESC);