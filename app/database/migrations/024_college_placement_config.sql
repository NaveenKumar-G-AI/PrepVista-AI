-- ============================================================================
-- 024_college_placement_config.sql
--
-- Fix 9 - TPO placement-config screen.
--
-- One row per college (organization) holding the placement targets a TPO sets
-- for their students: which company archetypes matter for this college, the
-- readiness score the college treats as "placement ready" on cohort dashboards,
-- the competency pillars they want emphasised, and free-text notes.
--
-- The placement readiness engine (app/services/placement_readiness.py) exposes
-- a fixed set of company archetypes and 5 competency pillars; the values stored
-- here are validated against those at write time in app/routers/tpo_config.py.
--
-- Additive and idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS college_placement_config (
    organization_id     UUID PRIMARY KEY
                            REFERENCES organizations(id) ON DELETE CASCADE,
    -- Company archetype names the TPO wants surfaced for their students
    -- (subset of placement_readiness.COMPANY_PROFILES names).
    target_companies    JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 0-100 readiness score this college treats as "placement ready".
    readiness_threshold INTEGER NOT NULL DEFAULT 70
                            CHECK (readiness_threshold BETWEEN 0 AND 100),
    -- Competency pillar keys the college prioritises (subset of the engine's
    -- 5 pillars). Advisory: surfaced in the UI / future emphasis tuning.
    focus_pillars       JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes               TEXT,
    updated_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
