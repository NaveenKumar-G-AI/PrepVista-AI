-- Persistent scheduled CSV delivery for the college Reports module.

CREATE TABLE IF NOT EXISTS org_report_schedules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    frequency           TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
    recipient_email     TEXT NOT NULL CHECK (char_length(recipient_email) BETWEEN 3 AND 254),
    department_id       UUID REFERENCES college_departments(id) ON DELETE SET NULL,
    year_id             UUID REFERENCES college_years(id) ON DELETE SET NULL,
    batch_id            UUID REFERENCES college_batches(id) ON DELETE SET NULL,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at         TIMESTAMPTZ NOT NULL,
    last_run_at         TIMESTAMPTZ,
    last_status         TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (last_status IN ('scheduled', 'processing', 'sent', 'failed')),
    last_error          TEXT,
    lease_until         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_report_schedules_due
    ON org_report_schedules (next_run_at)
    WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_org_report_schedules_org
    ON org_report_schedules (organization_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_report_schedules_active_config
    ON org_report_schedules (
        organization_id,
        lower(recipient_email),
        frequency,
        COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(year_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE active = TRUE;

ALTER TABLE org_report_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON org_report_schedules FROM PUBLIC;
REVOKE ALL ON org_report_schedules FROM anon;
REVOKE ALL ON org_report_schedules FROM authenticated;
