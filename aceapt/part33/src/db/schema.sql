-- ACEAPT Feature 33 -- Opportunity-to-Action Engine
-- Reference PostgreSQL schema (spec sections 71-75).
--
-- This is NOT executed by this build (no live database was available in
-- this session) -- it's the reference for wiring Feature 33 into a real
-- database. student_id and capability_id are left as TEXT so they can point
-- at whatever the real ACEAPT Student/Capability primary keys look like;
-- tighten these to real foreign keys once you plug this in.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS opportunities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT NOT NULL,
    organization        TEXT NOT NULL,
    location            TEXT,
    work_mode           TEXT,
    opportunity_type    TEXT NOT NULL DEFAULT 'other',
    description         TEXT,
    eligibility_text    TEXT,
    deadline            TIMESTAMPTZ,
    application_method  TEXT,
    source              TEXT NOT NULL DEFAULT 'manual_entry',
    source_url          TEXT,
    observed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    status              TEXT NOT NULL DEFAULT 'ACTIVE', -- NEW/ACTIVE/AGING/EXPIRING/EXPIRED/UNKNOWN
    duplicate_of_id     UUID REFERENCES opportunities(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunity_requirements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id      UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    capability_id       TEXT, -- references the real ACEAPT capability table
    requirement_type    TEXT NOT NULL, -- required | preferred | eligibility | evidence
    importance          TEXT NOT NULL, -- critical | important | nice_to_have
    source_text         TEXT NOT NULL,
    confidence          TEXT NOT NULL DEFAULT 'low' -- high | medium | low
);

CREATE TABLE IF NOT EXISTS opportunity_analyses (
    opportunity_id          UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    student_id              TEXT NOT NULL, -- references the real ACEAPT student table
    eligibility_state       TEXT NOT NULL,
    eligibility_reasons     JSONB NOT NULL DEFAULT '[]',
    dimensions              JSONB NOT NULL, -- targetAlignment/capabilityMatch/evidenceMatch/readiness/timelineFit
    overall_fit_score       NUMERIC,
    overall_fit_band        TEXT,
    recommendation          TEXT NOT NULL,
    recommendation_reasons  JSONB NOT NULL DEFAULT '[]',
    confidence              TEXT NOT NULL DEFAULT 'MEDIUM',
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (opportunity_id, student_id)
);

CREATE TABLE IF NOT EXISTS opportunity_action_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id      UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    student_id          TEXT NOT NULL,
    items               JSONB NOT NULL, -- ordered [{order,title,description,estMinutes,type,status}]
    total_est_minutes   INTEGER,
    budget_minutes      INTEGER,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (opportunity_id, student_id)
);

CREATE TABLE IF NOT EXISTS opportunity_applications (
    opportunity_id      UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    student_id          TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'DISCOVERED',
    applied_at          TIMESTAMPTZ,
    history             JSONB NOT NULL DEFAULT '[]',
    last_updated        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (opportunity_id, student_id)
);

CREATE TABLE IF NOT EXISTS opportunity_outcomes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id      UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    student_id          TEXT NOT NULL,
    stage_reached       TEXT NOT NULL,
    outcome             TEXT NOT NULL, -- selected | rejected | withdrawn | unknown
    skill_tag           TEXT,
    feedback            TEXT,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status_deadline ON opportunities(status, deadline);
CREATE INDEX IF NOT EXISTS idx_requirements_opportunity ON opportunity_requirements(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_analyses_student ON opportunity_analyses(student_id);
CREATE INDEX IF NOT EXISTS idx_applications_student ON opportunity_applications(student_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_student ON opportunity_outcomes(student_id);
