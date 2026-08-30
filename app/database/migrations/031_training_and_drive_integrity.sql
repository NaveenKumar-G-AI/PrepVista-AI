-- Data-integrity constraints that require the tables introduced by migrations
-- 017, 026, and 029 to all exist. Kept in a later migration so circular drive
-- rule references can be established safely on both new and existing installs.

ALTER TABLE drive_eligibility_rule_versions
    ADD CONSTRAINT drive_rule_drive_and_id_unique UNIQUE (drive_id, id);

ALTER TABLE placement_drives
    ADD CONSTRAINT placement_drives_active_rule_belongs_to_drive_fk
    FOREIGN KEY (id, active_rule_version_fk)
    REFERENCES drive_eligibility_rule_versions(drive_id, id);

-- Enforce tenant ownership on duplicated organization/company references.
-- The application already validates these relationships, but composite FKs
-- prevent a future import or maintenance script from creating cross-tenant data.
ALTER TABLE recruiter_companies
    ADD CONSTRAINT recruiter_companies_organization_and_id_unique
    UNIQUE (organization_id, id);

ALTER TABLE placement_drives
    ADD CONSTRAINT placement_drives_organization_and_id_unique
    UNIQUE (organization_id, id);

ALTER TABLE placement_drives
    ADD CONSTRAINT placement_drives_company_same_organization_fk
    FOREIGN KEY (organization_id, company_id)
    REFERENCES recruiter_companies(organization_id, id);

ALTER TABLE recruiter_contacts
    ADD CONSTRAINT recruiter_contacts_company_same_organization_fk
    FOREIGN KEY (organization_id, company_id)
    REFERENCES recruiter_companies(organization_id, id) ON DELETE CASCADE;

ALTER TABLE recruiter_activities
    ADD CONSTRAINT recruiter_activities_company_same_organization_fk
    FOREIGN KEY (organization_id, company_id)
    REFERENCES recruiter_companies(organization_id, id) ON DELETE CASCADE;

ALTER TABLE recruiter_followups
    ADD CONSTRAINT recruiter_followups_company_same_organization_fk
    FOREIGN KEY (organization_id, company_id)
    REFERENCES recruiter_companies(organization_id, id) ON DELETE CASCADE;

ALTER TABLE recruiter_company_notes
    ADD CONSTRAINT recruiter_company_notes_company_same_organization_fk
    FOREIGN KEY (organization_id, company_id)
    REFERENCES recruiter_companies(organization_id, id) ON DELETE CASCADE;

ALTER TABLE taxonomy_term
    ADD CONSTRAINT taxonomy_term_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE training_cohort
    ADD CONSTRAINT training_cohort_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE training_program
    ADD CONSTRAINT training_program_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE assessment
    ADD CONSTRAINT assessment_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE intervention
    ADD CONSTRAINT intervention_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE student_success_event
    ADD CONSTRAINT student_success_event_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE training_attendance
    ADD CONSTRAINT training_attendance_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE training_cohort_member
    ADD CONSTRAINT training_cohort_member_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE training_enrollment
    ADD CONSTRAINT training_enrollment_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE assessment_attempt
    ADD CONSTRAINT assessment_attempt_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE skill_measurement
    ADD CONSTRAINT skill_measurement_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE readiness_snapshot
    ADD CONSTRAINT readiness_snapshot_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE intervention_assignment
    ADD CONSTRAINT intervention_assignment_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE student_success_event
    ADD CONSTRAINT student_success_event_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE training_program
    ADD CONSTRAINT training_program_category_fk
    FOREIGN KEY (category_id) REFERENCES taxonomy_term(id) ON DELETE RESTRICT;

ALTER TABLE assessment
    ADD CONSTRAINT assessment_category_fk
    FOREIGN KEY (category_id) REFERENCES taxonomy_term(id) ON DELETE RESTRICT;

ALTER TABLE training_enrollment
    ADD CONSTRAINT training_enrollment_source_cohort_fk
    FOREIGN KEY (source_cohort_id) REFERENCES training_cohort(id) ON DELETE SET NULL;

ALTER TABLE offers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE offer_versions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE offer_documents ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE joining_records ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE student_placement_outcomes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE institution_offer_policy ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE offers
    ADD CONSTRAINT offers_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE offers
    ADD CONSTRAINT offers_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE offers
    ADD CONSTRAINT offers_drive_fk
    FOREIGN KEY (drive_id) REFERENCES placement_drives(id) ON DELETE RESTRICT;

ALTER TABLE offers
    ADD CONSTRAINT offers_company_fk
    FOREIGN KEY (company_id) REFERENCES recruiter_companies(id) ON DELETE RESTRICT;

ALTER TABLE offers
    ADD CONSTRAINT offers_drive_same_organization_fk
    FOREIGN KEY (institution_id, drive_id)
    REFERENCES placement_drives(organization_id, id) ON DELETE RESTRICT;

ALTER TABLE offers
    ADD CONSTRAINT offers_company_same_organization_fk
    FOREIGN KEY (institution_id, company_id)
    REFERENCES recruiter_companies(organization_id, id) ON DELETE RESTRICT;

ALTER TABLE offers
    ADD CONSTRAINT offers_student_in_organization_fk
    FOREIGN KEY (institution_id, student_id)
    REFERENCES organization_students(organization_id, user_id) ON DELETE RESTRICT;

ALTER TABLE offers
    ADD CONSTRAINT offers_id_student_unique UNIQUE (id, student_id);

ALTER TABLE offers
    ADD CONSTRAINT offers_id_student_season_unique UNIQUE (id, student_id, season_id);

ALTER TABLE offer_versions
    ADD CONSTRAINT offer_versions_changed_by_fk
    FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE offer_documents
    ADD CONSTRAINT offer_documents_uploaded_by_fk
    FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE RESTRICT;

ALTER TABLE offer_documents
    ADD CONSTRAINT offer_documents_offer_and_id_unique UNIQUE (offer_id, id);

ALTER TABLE joining_records
    ADD CONSTRAINT joining_records_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE joining_records
    ADD CONSTRAINT joining_records_verified_by_fk
    FOREIGN KEY (verified_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE joining_records
    ADD CONSTRAINT joining_records_offer_student_match_fk
    FOREIGN KEY (offer_id, student_id) REFERENCES offers(id, student_id) ON DELETE CASCADE;

ALTER TABLE joining_records
    ADD CONSTRAINT joining_records_evidence_belongs_to_offer_fk
    FOREIGN KEY (offer_id, evidence_document_id)
    REFERENCES offer_documents(offer_id, id) ON DELETE RESTRICT;

ALTER TABLE student_placement_outcomes
    ADD CONSTRAINT student_placement_outcomes_student_fk
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE student_placement_outcomes
    ADD CONSTRAINT student_placement_outcomes_verified_by_fk
    FOREIGN KEY (verified_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE student_placement_outcomes
    ADD CONSTRAINT student_placement_outcomes_offer_student_season_match_fk
    FOREIGN KEY (offer_id, student_id, season_id)
    REFERENCES offers(id, student_id, season_id) ON DELETE RESTRICT;

ALTER TABLE institution_offer_policy
    ADD CONSTRAINT institution_offer_policy_organization_fk
    FOREIGN KEY (institution_id) REFERENCES organizations(id) ON DELETE CASCADE;
