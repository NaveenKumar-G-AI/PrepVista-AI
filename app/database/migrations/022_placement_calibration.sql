-- ════════════════════════════════════════════════════════════════════════════
-- 022_placement_calibration.sql
--
-- Fix 3 — Calibrate placement probabilities with real hiring data.
--
-- Two tables:
--   placement_outcomes   — ground-truth labels submitted by TPOs ("did this
--                          student get placed at this company?"). Each row links
--                          a real interview session to a real placement result.
--   placement_parameters — the fitted logistic curve (bar, steepness) per
--                          company, derived from >= 30 outcomes via
--                          app/services/calibration.py. Read at runtime by
--                          placement_readiness so probabilities are grounded in
--                          real outcomes instead of hand-tuned heuristics.
--
-- Additive and idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS placement_outcomes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES interview_sessions(id) ON DELETE SET NULL,
    college_id      UUID,
    company_name    TEXT NOT NULL,
    placed          BOOLEAN,
    interview_round TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- One outcome per (session, company): re-submitting the same student/company
-- pair updates the existing label rather than double-counting it in the fit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_outcomes_session_company
    ON placement_outcomes (session_id, company_name);

-- Calibration pulls every labelled outcome for a company; index the access path.
CREATE INDEX IF NOT EXISTS idx_placement_outcomes_company
    ON placement_outcomes (company_name) WHERE placed IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_placement_outcomes_college
    ON placement_outcomes (college_id);


CREATE TABLE IF NOT EXISTS placement_parameters (
    company       TEXT PRIMARY KEY,
    bar           DOUBLE PRECISION NOT NULL,
    steepness     DOUBLE PRECISION NOT NULL,
    sample_n      INTEGER NOT NULL DEFAULT 0,
    calibrated_at TIMESTAMPTZ DEFAULT now()
);
