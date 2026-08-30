-- PART 6: Offers, Joining, Placement Outcome
-- Executed by the application migration runner. The offer-domain placement
-- outcome table is deliberately named student_placement_outcomes because
-- migration 022 already owns placement_outcomes for model calibration.
--
-- Deliberately does NOT create: students, companies, drives,
-- applications, institutions, seasons, users, documents, or a generic
-- audit_log table - those belong to Parts 1-5 and this migration only
-- references them by id (spec section 6/9: "do not duplicate
-- authoritative company/student/drive records").

BEGIN;

CREATE TYPE offer_status AS ENUM (
  'DRAFT', 'RECEIVED', 'UNDER_VERIFICATION', 'VERIFIED', 'PUBLISHED',
  'ACCEPTANCE_PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'CANCELLED'
);

CREATE TYPE offer_source AS ENUM (
  'TPO_ENTERED', 'IMPORTED', 'ADMIN_IMPORTED', 'DOCUMENT_EXTRACTED', 'OTHER_APPROVED_SOURCE'
);

CREATE TYPE offer_verification_status AS ENUM (
  'NOT_STARTED', 'IN_PROGRESS', 'CONFLICT', 'VERIFIED'
);

CREATE TYPE employment_type AS ENUM (
  'FULL_TIME', 'INTERNSHIP', 'INTERN_TO_FULL_TIME', 'CONTRACT', 'OTHER'
);

CREATE TYPE work_mode AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

CREATE TYPE joining_status AS ENUM (
  'PENDING', 'CONFIRMED', 'UNVERIFIED', 'JOINED', 'DELAYED', 'DID_NOT_JOIN', 'CANCELLED'
);

CREATE TYPE placement_outcome_type AS ENUM (
  'PLACED_JOINED', 'PLACED_OFFER_ACCEPTED_JOINING_PENDING', 'SELECTED_NOT_OFFERED',
  'OFFER_DECLINED', 'OFFER_EXPIRED', 'DID_NOT_JOIN', 'UNPLACED',
  'HIGHER_STUDIES', 'ENTREPRENEURSHIP', 'NOT_SEEKING'
);

-- Current/authoritative row per offer. Full history lives in offer_versions.
CREATE TABLE offers (
  id                  UUID PRIMARY KEY,
  institution_id      UUID NOT NULL,
  season_id           UUID NOT NULL,
  student_id          UUID NOT NULL,
  application_id      UUID,
  drive_id            UUID NOT NULL,
  company_id          UUID NOT NULL,
  role_id             UUID,               -- FK into Part 3's role entity, if it maps 1:1
  role_title          TEXT NOT NULL,       -- denormalized snapshot, always populated
  employment_type     employment_type NOT NULL,
  work_mode           work_mode NOT NULL,
  location            TEXT NOT NULL,
  offer_date          DATE NOT NULL,
  acceptance_deadline TIMESTAMPTZ NOT NULL,
  joining_date        DATE NOT NULL,
  currency            CHAR(3) NOT NULL DEFAULT 'INR',
  ctc_total_minor     BIGINT NOT NULL,
  ctc_fixed_minor     BIGINT NOT NULL,
  ctc_variable_minor  BIGINT,
  stipend_minor       BIGINT,
  probation_info      TEXT,
  status              offer_status NOT NULL DEFAULT 'DRAFT',
  source              offer_source NOT NULL,
  verification_status offer_verification_status NOT NULL DEFAULT 'NOT_STARTED',
  has_final_selection BOOLEAN NOT NULL DEFAULT FALSE,
  current_version     INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ctc_non_negative CHECK (
    ctc_total_minor >= 0 AND ctc_fixed_minor >= 0
    AND COALESCE(ctc_variable_minor, 0) >= 0 AND COALESCE(stipend_minor, 0) >= 0
  ),
  CONSTRAINT joining_not_before_offer CHECK (joining_date >= offer_date)
);

CREATE INDEX idx_offers_student ON offers (student_id);
CREATE INDEX idx_offers_institution_season ON offers (institution_id, season_id);
CREATE INDEX idx_offers_status ON offers (status);
CREATE INDEX idx_offers_deadline ON offers (acceptance_deadline) WHERE status = 'ACCEPTANCE_PENDING';
-- Guards the DUPLICATE_OFFER conflict check at the DB layer too, not just in app code.
CREATE UNIQUE INDEX uq_offers_active_student_company_drive
  ON offers (student_id, company_id, drive_id)
  WHERE status NOT IN ('DECLINED', 'EXPIRED', 'WITHDRAWN', 'CANCELLED');

-- Append-only version history (spec section 12). Never update this table, only insert.
CREATE TABLE offer_versions (
  id              UUID PRIMARY KEY,
  offer_id        UUID NOT NULL REFERENCES offers (id),
  version_number  INTEGER NOT NULL,
  snapshot        JSONB NOT NULL,
  reason          TEXT,
  changed_by      UUID,
  source          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offer_id, version_number)
);

CREATE TABLE offer_documents (
  id                  UUID PRIMARY KEY,
  offer_id            UUID NOT NULL REFERENCES offers (id),
  document_type       TEXT NOT NULL, -- OFFER_LETTER | APPOINTMENT_DOCUMENT | EMPLOYMENT_CONFIRMATION | JOINING_LETTER | OTHER
  document_ref_id     UUID NOT NULL, -- points into Part 1's shared document store
  uploaded_by         UUID NOT NULL,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_status offer_verification_status NOT NULL DEFAULT 'NOT_STARTED'
);

CREATE INDEX idx_offer_documents_offer ON offer_documents (offer_id);

CREATE TABLE joining_records (
  id                     UUID PRIMARY KEY,
  offer_id               UUID NOT NULL UNIQUE REFERENCES offers (id),
  student_id             UUID NOT NULL,
  expected_joining_date  DATE NOT NULL,
  confirmed_joining_date DATE,
  status                 joining_status NOT NULL DEFAULT 'PENDING',
  evidence_document_id   UUID,
  verified_by            UUID,
  verified_at            TIMESTAMPTZ,
  remarks                TEXT,
  reason                 TEXT, -- populated for DID_NOT_JOIN
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mirrors assertJoinedHasEvidence() in application code - belt and braces.
  CONSTRAINT joined_requires_verification CHECK (
    status <> 'JOINED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

CREATE INDEX idx_joining_student ON joining_records (student_id);
CREATE INDEX idx_joining_status ON joining_records (status);

CREATE TABLE student_placement_outcomes (
  id           UUID PRIMARY KEY,
  student_id   UUID NOT NULL,
  season_id    UUID NOT NULL,
  offer_id     UUID REFERENCES offers (id), -- null for outcomes with no offer at all (e.g. UNPLACED, NOT_SEEKING)
  outcome      placement_outcome_type NOT NULL,
  verified     BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by  UUID,
  verified_at  TIMESTAMPTZ,
  source       TEXT NOT NULL, -- 'DERIVED' | 'TPO_OVERRIDE'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One current outcome per student per season - corrections update this row
  -- and are themselves audited via the shared audit service, not a new table.
  UNIQUE (student_id, season_id)
);

CREATE INDEX idx_student_placement_outcomes_season ON student_placement_outcomes (season_id);
CREATE INDEX idx_student_placement_outcomes_outcome ON student_placement_outcomes (outcome);

-- Institution-configurable policy (multiple-offer rules + which outcomes
-- count toward the "Verified Placement" KPI - spec sections 29 and 70).
-- Kept as JSONB rather than fully normalized columns: the rule set is
-- expected to evolve, and this is exactly the kind of config that should
-- not require a migration every time an institution's policy changes.
CREATE TABLE institution_offer_policy (
  id              UUID PRIMARY KEY,
  institution_id  UUID NOT NULL,
  season_id       UUID, -- null = applies to all seasons unless a season-specific row overrides it
  policy          JSONB NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, season_id)
);

COMMIT;
