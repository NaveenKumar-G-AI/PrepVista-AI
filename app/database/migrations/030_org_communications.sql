-- Organization-scoped in-app communications and student issue tracking.
-- Additive, idempotent, and service-role only (RLS enabled with no public policy).

CREATE TABLE IF NOT EXISTS org_communications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    message_type      TEXT NOT NULL CHECK (message_type IN (
        'ANNOUNCEMENT', 'DRIVE_NOTIFICATION', 'DEADLINE_REMINDER',
        'INTERVIEW_NOTIFICATION', 'RESULT_NOTIFICATION', 'OFFER_NOTIFICATION',
        'JOINING_NOTIFICATION', 'TRAINING_NOTIFICATION'
    )),
    subject_template  TEXT NOT NULL CHECK (char_length(subject_template) BETWEEN 1 AND 300),
    body_template     TEXT NOT NULL CHECK (char_length(body_template) BETWEEN 1 AND 10000),
    priority          TEXT NOT NULL DEFAULT 'NORMAL'
                           CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    requires_ack      BOOLEAN NOT NULL DEFAULT FALSE,
    drive_id          UUID REFERENCES placement_drives(id) ON DELETE SET NULL,
    audience_filter   JSONB NOT NULL DEFAULT '{}',
    audience_count    INTEGER NOT NULL CHECK (audience_count > 0),
    created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_communication_recipients (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id        UUID NOT NULL REFERENCES org_communications(id) ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    delivery_status   TEXT NOT NULL DEFAULT 'DELIVERED'
                           CHECK (delivery_status IN ('DELIVERED', 'FAILED')),
    failure_reason    TEXT,
    delivered_at      TIMESTAMPTZ,
    opened_at         TIMESTAMPTZ,
    acknowledged_at   TIMESTAMPTZ,
    UNIQUE (message_id, student_id)
);

CREATE TABLE IF NOT EXISTS org_communication_issues (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category          TEXT NOT NULL CHECK (category IN (
        'INTERVIEW_INFO', 'LINK_BROKEN', 'APPLICATION', 'ELIGIBILITY',
        'OFFER', 'JOINING', 'TECHNICAL', 'GENERAL'
    )),
    priority          TEXT NOT NULL DEFAULT 'NORMAL'
                           CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status            TEXT NOT NULL DEFAULT 'OPEN'
                           CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    description       TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),
    response          TEXT,
    responded_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_comm_org_sent
    ON org_communications (organization_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_comm_recipient_inbox
    ON org_communication_recipients (student_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_comm_recipient_message
    ON org_communication_recipients (message_id);
CREATE INDEX IF NOT EXISTS idx_org_comm_issue_org_status
    ON org_communication_issues (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_comm_issue_student
    ON org_communication_issues (student_id, created_at DESC);

ALTER TABLE org_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_communication_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_communication_issues ENABLE ROW LEVEL SECURITY;
