-- =============================================================================
-- 027_placement_interviews.sql   (Part 5 Integration — Interviews & Results)
-- =============================================================================
-- Adds the placement company interview domain on top of Part 3's
-- placement_drives.  Completely separate from interview_sessions
-- (PrepVista's AI mock-interview table).
--
-- New tables:
--   drive_round_executions       -- a named round within a drive
--   placement_interviews         -- one scheduled interview per student per round
--   placement_interview_results  -- versioned results (never in-place updated)
--   placement_interview_issues   -- student-reported issues
--   placement_interview_audit    -- append-only audit log
--   placement_interview_events   -- event stream (18 event types)
--
-- All additive & idempotent.
-- =============================================================================

-- ── 1. Round executions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drive_round_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id        UUID NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,          -- "Technical Round 1", "HR", etc.
    sequence        INTEGER NOT NULL,       -- ordering within drive
    status          TEXT NOT NULL DEFAULT 'PLANNED'
                        CHECK (status IN ('PLANNED','SCHEDULED','PUBLISHED',
                                          'IN_PROGRESS','RESULT_PENDING',
                                          'COMPLETED','CANCELLED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (drive_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_dre_drive ON drive_round_executions (drive_id);
CREATE INDEX IF NOT EXISTS idx_dre_org   ON drive_round_executions (organization_id);

-- ── 2. Placement interviews ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_interviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    drive_id            UUID NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    round_execution_id  UUID REFERENCES drive_round_executions(id) ON DELETE SET NULL,
    student_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    scheduled_at        TIMESTAMPTZ,
    interview_status    TEXT NOT NULL DEFAULT 'SCHEDULED'
                            CHECK (interview_status IN (
                                'SCHEDULED','CONFIRMED','ATTENDED','COMPLETED',
                                'NO_SHOW','CANCELLED','RESCHEDULED',
                                'RESULT_PENDING','RESULT_PUBLISHED'
                            )),
    attendance_status   TEXT NOT NULL DEFAULT 'NOT_RECORDED'
                            CHECK (attendance_status IN (
                                'NOT_RECORDED','PRESENT','LATE','ABSENT','EXCUSED'
                            )),
    location_or_link    TEXT,
    interviewer_notes   TEXT,
    created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    version             INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pi_org     ON placement_interviews (organization_id);
CREATE INDEX IF NOT EXISTS idx_pi_drive   ON placement_interviews (drive_id);
CREATE INDEX IF NOT EXISTS idx_pi_student ON placement_interviews (student_id);
CREATE INDEX IF NOT EXISTS idx_pi_status  ON placement_interviews (organization_id, interview_status);
CREATE INDEX IF NOT EXISTS idx_pi_sched   ON placement_interviews (organization_id, scheduled_at DESC)
    WHERE scheduled_at IS NOT NULL;

-- Prevent scheduling the same student twice in the same round
CREATE UNIQUE INDEX IF NOT EXISTS idx_pi_student_round_uniq
    ON placement_interviews (student_id, round_execution_id)
    WHERE round_execution_id IS NOT NULL
      AND interview_status NOT IN ('CANCELLED','RESCHEDULED');

-- ── 3. Versioned results (never in-place updated) ─────────────────────────────
CREATE TABLE IF NOT EXISTS placement_interview_results (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id      UUID NOT NULL REFERENCES placement_interviews(id) ON DELETE CASCADE,
    version           INTEGER NOT NULL DEFAULT 1,
    result            TEXT NOT NULL
                          CHECK (result IN ('PASS','FAIL','HOLD','NO_SHOW','DISQUALIFIED','PENDING')),
    publication_state TEXT NOT NULL DEFAULT 'INTERNAL_RESULT'
                          CHECK (publication_state IN (
                              'INTERNAL_RESULT','TPO_REVIEWED','PUBLISHED_TO_STUDENT'
                          )),
    result_source     TEXT NOT NULL DEFAULT 'TPO_ENTERED'
                          CHECK (result_source IN (
                              'TPO_ENTERED','IMPORTED','ADMIN_IMPORTED',
                              'SYSTEM_GENERATED','OTHER_APPROVED_SOURCE'
                          )),
    remarks           TEXT,
    is_current        BOOLEAN NOT NULL DEFAULT TRUE,
    entered_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ,
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (interview_id, version)
);
CREATE INDEX IF NOT EXISTS idx_pir_interview ON placement_interview_results (interview_id);
CREATE INDEX IF NOT EXISTS idx_pir_current   ON placement_interview_results (interview_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_pir_pending   ON placement_interview_results (publication_state) WHERE is_current = TRUE;

-- ── 4. Student-reported issues ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_interview_issues (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID NOT NULL REFERENCES placement_interviews(id) ON DELETE CASCADE,
    student_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    issue_type   TEXT NOT NULL
                     CHECK (issue_type IN (
                         'WRONG_SCHEDULE','CANNOT_ACCESS_LINK',
                         'SCHEDULING_CONFLICT','TECHNICAL_ISSUE','OTHER'
                     )),
    description  TEXT,
    status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
    resolution   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pii_interview ON placement_interview_issues (interview_id);
CREATE INDEX IF NOT EXISTS idx_pii_student   ON placement_interview_issues (student_id);

-- ── 5. Audit log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_interview_audit (
    id           BIGSERIAL PRIMARY KEY,
    actor_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor_label  TEXT,
    action       TEXT NOT NULL,
    entity_type  TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    old_value    JSONB,
    new_value    JSONB,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pia_entity ON placement_interview_audit (entity_type, entity_id, occurred_at DESC);

-- ── 6. Event log (18 event types, all emitted at right points) ───────────────
CREATE TABLE IF NOT EXISTS placement_interview_events (
    id           BIGSERIAL PRIMARY KEY,
    event_type   TEXT NOT NULL,
    interview_id UUID REFERENCES placement_interviews(id) ON DELETE CASCADE,
    drive_id     UUID REFERENCES placement_drives(id) ON DELETE CASCADE,
    student_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pie_interview ON placement_interview_events (interview_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pie_drive     ON placement_interview_events (drive_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pie_student   ON placement_interview_events (student_id, occurred_at DESC);