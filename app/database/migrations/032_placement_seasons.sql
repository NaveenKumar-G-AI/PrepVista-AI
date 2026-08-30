-- Authoritative placement seasons used by offers, training, assessments, and
-- readiness records. This replaces free-form/unvalidated season UUIDs.

CREATE TABLE placement_seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT placement_seasons_dates_valid CHECK (ends_on >= starts_on),
    UNIQUE (organization_id, name)
);

CREATE INDEX idx_placement_seasons_org_status
    ON placement_seasons (organization_id, status, starts_on DESC);

ALTER TABLE placement_seasons
    ADD CONSTRAINT placement_seasons_organization_and_id_unique
    UNIQUE (organization_id, id);

-- Backfill IDs written by the pre-season APIs before adding the foreign keys.
-- New installations have no rows here; existing installations retain their
-- historical UUIDs and receive an explicitly closed imported season.
WITH season_candidates AS (
    SELECT season_id, institution_id AS organization_id FROM offers
    UNION
    SELECT season_id, institution_id FROM institution_offer_policy WHERE season_id IS NOT NULL
    UNION
    SELECT season_id, institution_id FROM training_cohort
    UNION
    SELECT season_id, institution_id FROM training_program
    UNION
    SELECT season_id, institution_id FROM intervention
    UNION
    SELECT rs.season_id, p.organization_id
      FROM readiness_snapshot rs
      JOIN profiles p ON p.id = rs.student_id
     WHERE p.organization_id IS NOT NULL
    UNION
    SELECT spo.season_id, COALESCE(o.institution_id, p.organization_id)
      FROM student_placement_outcomes spo
      LEFT JOIN offers o ON o.id = spo.offer_id
      JOIN profiles p ON p.id = spo.student_id
     WHERE COALESCE(o.institution_id, p.organization_id) IS NOT NULL
), canonical_seasons AS (
    SELECT DISTINCT ON (season_id) season_id, organization_id
      FROM season_candidates
     WHERE season_id IS NOT NULL AND organization_id IS NOT NULL
     ORDER BY season_id, organization_id
)
INSERT INTO placement_seasons (id, organization_id, name, starts_on, ends_on, status)
SELECT season_id,
       organization_id,
       'Imported season ' || season_id::text,
       CURRENT_DATE,
       CURRENT_DATE,
       'CLOSED'
  FROM canonical_seasons
ON CONFLICT (id) DO NOTHING;

ALTER TABLE offers
    ADD CONSTRAINT offers_season_fk
    FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE RESTRICT;

ALTER TABLE offers
    ADD CONSTRAINT offers_season_same_organization_fk
    FOREIGN KEY (institution_id, season_id)
    REFERENCES placement_seasons(organization_id, id) ON DELETE RESTRICT;

ALTER TABLE student_placement_outcomes
    ADD CONSTRAINT student_placement_outcomes_season_fk
    FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE RESTRICT;

ALTER TABLE institution_offer_policy
    ADD CONSTRAINT institution_offer_policy_season_fk
    FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE CASCADE;

ALTER TABLE institution_offer_policy
    ADD CONSTRAINT institution_offer_policy_season_same_organization_fk
    FOREIGN KEY (institution_id, season_id)
    REFERENCES placement_seasons(organization_id, id) ON DELETE CASCADE;

ALTER TABLE training_cohort
    ADD CONSTRAINT training_cohort_season_fk
    FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE RESTRICT;

ALTER TABLE training_cohort
    ADD CONSTRAINT training_cohort_season_same_organization_fk
    FOREIGN KEY (institution_id, season_id)
    REFERENCES placement_seasons(organization_id, id) ON DELETE RESTRICT;

ALTER TABLE training_program
    ADD CONSTRAINT training_program_season_fk
    FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE RESTRICT;

ALTER TABLE training_program
    ADD CONSTRAINT training_program_season_same_organization_fk
    FOREIGN KEY (institution_id, season_id)
    REFERENCES placement_seasons(organization_id, id) ON DELETE RESTRICT;

ALTER TABLE readiness_snapshot
    ADD CONSTRAINT readiness_snapshot_season_fk
    FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE RESTRICT;

ALTER TABLE intervention
    ADD CONSTRAINT intervention_season_fk
    FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE RESTRICT;

ALTER TABLE intervention
    ADD CONSTRAINT intervention_season_same_organization_fk
    FOREIGN KEY (institution_id, season_id)
    REFERENCES placement_seasons(organization_id, id) ON DELETE RESTRICT;
