-- REVIEW ONLY. DO NOT COPY THIS FILE INTO app/database/migrations OR EXECUTE IT.
-- Proposed additive migration after 035_org_report_schedules.sql.
-- Requires schema, security, privacy, performance, and rollback review.

BEGIN;

CREATE TYPE unified_taxonomy_status AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE unified_evidence_state AS ENUM ('VALID', 'INVALIDATED', 'CORRECTION');
CREATE TYPE unified_capability_level AS ENUM ('UNKNOWN', 'WEAK', 'DEVELOPING', 'COMPETENT', 'STRONG', 'MASTERED');
CREATE TYPE unified_readiness_band AS ENUM ('INSUFFICIENT_EVIDENCE', 'AT_RISK', 'DEVELOPING', 'ALMOST_READY', 'READY');
CREATE TYPE unified_nba_status AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'DISMISSED', 'EXPIRED');

-- Enables composite FKs below to prove that membership, organization, and
-- student profile belong together. The key is redundant with id uniqueness
-- but is necessary as an explicit referenced key.
ALTER TABLE organization_students
    ADD CONSTRAINT organization_students_identity_scope_unique
    UNIQUE (id, organization_id, user_id);

CREATE TABLE capability_taxonomy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stable_key TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    parent_id UUID REFERENCES capability_taxonomy(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    status unified_taxonomy_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_at TIMESTAMPTZ,
    UNIQUE (stable_key, version),
    UNIQUE (parent_id, slug, version),
    CHECK ((status = 'RETIRED') = (retired_at IS NOT NULL))
);

CREATE TABLE capability_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    graph_version INTEGER NOT NULL CHECK (graph_version > 0),
    prerequisite_capability_id UUID NOT NULL REFERENCES capability_taxonomy(id) ON DELETE RESTRICT,
    dependent_capability_id UUID NOT NULL REFERENCES capability_taxonomy(id) ON DELETE RESTRICT,
    edge_type TEXT NOT NULL CHECK (edge_type IN ('REQUIRED', 'SUPPORTING')),
    minimum_level unified_capability_level NOT NULL,
    weight NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (graph_version, prerequisite_capability_id, dependent_capability_id),
    CHECK (prerequisite_capability_id <> dependent_capability_id)
);

CREATE TABLE target_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stable_key TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status unified_taxonomy_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_at TIMESTAMPTZ,
    UNIQUE (stable_key, version),
    UNIQUE (slug, version),
    CHECK ((status = 'RETIRED') = (retired_at IS NOT NULL))
);

CREATE TABLE role_capability_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_role_id UUID NOT NULL REFERENCES target_roles(id) ON DELETE CASCADE,
    capability_id UUID NOT NULL REFERENCES capability_taxonomy(id) ON DELETE RESTRICT,
    target_score NUMERIC(5,2) NOT NULL CHECK (target_score BETWEEN 0 AND 100),
    role_weight NUMERIC(7,6) NOT NULL CHECK (role_weight > 0 AND role_weight <= 1),
    is_core BOOLEAN NOT NULL DEFAULT false,
    minimum_evidence_count INTEGER NOT NULL DEFAULT 3 CHECK (minimum_evidence_count > 0),
    minimum_distinct_contexts INTEGER NOT NULL DEFAULT 2 CHECK (minimum_distinct_contexts > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (target_role_id, capability_id)
);

CREATE TABLE technical_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    organization_student_id UUID REFERENCES organization_students(id) ON DELETE CASCADE,
    assessment_attempt_id UUID REFERENCES assessment_attempt(id) ON DELETE SET NULL,
    language TEXT NOT NULL,
    parser_version TEXT,
    content_hash TEXT NOT NULL,
    encrypted_object_key TEXT,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0 AND byte_size <= 131072),
    retention_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CHECK ((organization_id IS NULL) = (organization_student_id IS NULL))
);

CREATE TABLE technical_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID NOT NULL REFERENCES technical_artifacts(id) ON DELETE CASCADE,
    engine_version TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    result_schema_version INTEGER NOT NULL CHECK (result_schema_version > 0),
    result JSONB NOT NULL,
    deterministic BOOLEAN NOT NULL,
    input_hash TEXT NOT NULL,
    output_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (artifact_id, engine_version, policy_version, input_hash)
);

CREATE TABLE evidence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    occurred_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    student_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    organization_student_id UUID REFERENCES organization_students(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    capability_id UUID NOT NULL REFERENCES capability_taxonomy(id) ON DELETE RESTRICT,
    observation_kind TEXT NOT NULL,
    value NUMERIC(10,6),
    value_scale TEXT NOT NULL,
    confidence NUMERIC(7,6) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    difficulty NUMERIC(7,6) CHECK (difficulty BETWEEN 0 AND 1),
    assistance_level TEXT NOT NULL,
    independence_class TEXT NOT NULL,
    context_type TEXT NOT NULL,
    transfer_group TEXT,
    language TEXT,
    artifact_id UUID REFERENCES technical_artifacts(id) ON DELETE SET NULL,
    evaluation_policy_version TEXT NOT NULL,
    evaluator_type TEXT NOT NULL CHECK (evaluator_type IN ('DETERMINISTIC', 'HUMAN', 'AI', 'IMPORTED')),
    evaluator_version TEXT NOT NULL,
    state unified_evidence_state NOT NULL DEFAULT 'VALID',
    correction_of_event_id UUID REFERENCES evidence_events(id) ON DELETE RESTRICT,
    supersedes_event_id UUID REFERENCES evidence_events(id) ON DELETE RESTRICT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CHECK ((organization_id IS NULL) = (organization_student_id IS NULL)),
    CHECK ((state = 'CORRECTION') = (correction_of_event_id IS NOT NULL))
);

CREATE TABLE evidence_outbox (
    id BIGSERIAL PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_payload JSONB NOT NULL,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE capability_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    organization_student_id UUID REFERENCES organization_students(id) ON DELETE CASCADE,
    capability_id UUID NOT NULL REFERENCES capability_taxonomy(id) ON DELETE RESTRICT,
    level unified_capability_level NOT NULL,
    score NUMERIC(5,2) CHECK (score BETWEEN 0 AND 100),
    confidence NUMERIC(7,6) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
    independent_evidence_count INTEGER NOT NULL CHECK (independent_evidence_count >= 0),
    distinct_context_count INTEGER NOT NULL CHECK (distinct_context_count >= 0),
    is_stale BOOLEAN NOT NULL DEFAULT false,
    has_contradiction BOOLEAN NOT NULL DEFAULT false,
    projection_version TEXT NOT NULL,
    evidence_high_water_at TIMESTAMPTZ,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((level = 'UNKNOWN') = (score IS NULL)),
    CHECK ((organization_id IS NULL) = (organization_student_id IS NULL)),
    UNIQUE NULLS NOT DISTINCT (student_profile_id, organization_id, capability_id, projection_version)
);

CREATE TABLE readiness_snapshots_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    organization_student_id UUID REFERENCES organization_students(id) ON DELETE CASCADE,
    target_role_id UUID NOT NULL REFERENCES target_roles(id) ON DELETE RESTRICT,
    band unified_readiness_band NOT NULL,
    overall_score NUMERIC(5,2) CHECK (overall_score BETWEEN 0 AND 100),
    evidence_coverage NUMERIC(7,6) NOT NULL CHECK (evidence_coverage BETWEEN 0 AND 1),
    momentum TEXT NOT NULL CHECK (momentum IN ('RISING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA')),
    blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
    capability_summary JSONB NOT NULL,
    taxonomy_version INTEGER NOT NULL,
    graph_version INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    evidence_high_water_at TIMESTAMPTZ,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    shadow_only BOOLEAN NOT NULL DEFAULT true,
    CHECK ((band = 'INSUFFICIENT_EVIDENCE') OR overall_score IS NOT NULL),
    CHECK ((organization_id IS NULL) = (organization_student_id IS NULL))
);

CREATE TABLE next_best_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    organization_student_id UUID REFERENCES organization_students(id) ON DELETE CASCADE,
    capability_id UUID REFERENCES capability_taxonomy(id) ON DELETE RESTRICT,
    action_type TEXT NOT NULL,
    target_ref_type TEXT,
    target_ref_id TEXT,
    ranking_score NUMERIC(8,6) NOT NULL CHECK (ranking_score BETWEEN 0 AND 1),
    ranking_breakdown JSONB NOT NULL,
    evidence_snapshot_id UUID REFERENCES readiness_snapshots_v2(id) ON DELETE SET NULL,
    selector_version TEXT NOT NULL,
    status unified_nba_status NOT NULL DEFAULT 'PENDING',
    stable_until TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK ((organization_id IS NULL) = (organization_student_id IS NULL))
);

CREATE TABLE entitlement_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type TEXT NOT NULL CHECK (subject_type IN ('PROFILE', 'ORGANIZATION', 'ORGANIZATION_STUDENT')),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    organization_student_id UUID REFERENCES organization_students(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    allowance INTEGER CHECK (allowance IS NULL OR allowance >= 0),
    consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed >= 0),
    policy_version TEXT NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    granted_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at IS NULL OR expires_at > effective_at),
    CHECK ((subject_type = 'PROFILE') = (profile_id IS NOT NULL)),
    CHECK ((subject_type IN ('ORGANIZATION', 'ORGANIZATION_STUDENT')) = (organization_id IS NOT NULL)),
    CHECK ((subject_type = 'ORGANIZATION_STUDENT') = (organization_student_id IS NOT NULL))
);

CREATE TABLE report_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    organization_student_id UUID REFERENCES organization_students(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    input_snapshot JSONB NOT NULL,
    deterministic_output JSONB NOT NULL,
    interpretive_output JSONB,
    taxonomy_version INTEGER NOT NULL,
    graph_version INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    artifact_checksum TEXT,
    supersedes_report_id UUID REFERENCES report_snapshots(id) ON DELETE SET NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    retention_expires_at TIMESTAMPTZ NOT NULL,
    CHECK ((organization_id IS NULL) = (organization_student_id IS NULL))
);

CREATE INDEX evidence_events_student_capability_time_idx ON evidence_events(student_profile_id, capability_id, occurred_at DESC);
CREATE INDEX evidence_events_org_student_time_idx ON evidence_events(organization_id, organization_student_id, occurred_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX evidence_outbox_pending_idx ON evidence_outbox(available_at, id) WHERE published_at IS NULL;
CREATE INDEX capability_states_student_idx ON capability_states(student_profile_id, computed_at DESC);
CREATE INDEX capability_states_org_idx ON capability_states(organization_id, organization_student_id, computed_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX readiness_v2_student_time_idx ON readiness_snapshots_v2(student_profile_id, calculated_at DESC);
CREATE INDEX readiness_v2_org_band_idx ON readiness_snapshots_v2(organization_id, band, calculated_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX nba_active_student_idx ON next_best_actions(student_profile_id, status, expires_at) WHERE status = 'PENDING';
CREATE INDEX entitlement_active_subject_idx ON entitlement_grants(feature_key, effective_at, expires_at);
CREATE INDEX report_snapshots_student_time_idx ON report_snapshots(student_profile_id, generated_at DESC);

ALTER TABLE technical_artifacts ADD CONSTRAINT technical_artifacts_membership_scope_fk
    FOREIGN KEY (organization_student_id, organization_id, student_profile_id)
    REFERENCES organization_students(id, organization_id, user_id) ON DELETE CASCADE;
ALTER TABLE evidence_events ADD CONSTRAINT evidence_events_membership_scope_fk
    FOREIGN KEY (organization_student_id, organization_id, student_profile_id)
    REFERENCES organization_students(id, organization_id, user_id) ON DELETE CASCADE;
ALTER TABLE capability_states ADD CONSTRAINT capability_states_membership_scope_fk
    FOREIGN KEY (organization_student_id, organization_id, student_profile_id)
    REFERENCES organization_students(id, organization_id, user_id) ON DELETE CASCADE;
ALTER TABLE readiness_snapshots_v2 ADD CONSTRAINT readiness_v2_membership_scope_fk
    FOREIGN KEY (organization_student_id, organization_id, student_profile_id)
    REFERENCES organization_students(id, organization_id, user_id) ON DELETE CASCADE;
ALTER TABLE next_best_actions ADD CONSTRAINT nba_membership_scope_fk
    FOREIGN KEY (organization_student_id, organization_id, student_profile_id)
    REFERENCES organization_students(id, organization_id, user_id) ON DELETE CASCADE;
ALTER TABLE report_snapshots ADD CONSTRAINT report_snapshots_membership_scope_fk
    FOREIGN KEY (organization_student_id, organization_id, student_profile_id)
    REFERENCES organization_students(id, organization_id, user_id) ON DELETE CASCADE;

-- Resolve auth identity through the canonical bridge. SECURITY DEFINER ownership
-- and execute grants require explicit review in the real migration.
CREATE FUNCTION unified_current_profile_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT profile_id FROM auth_identity_links WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE FUNCTION unified_can_view_org_student(p_org UUID, p_membership UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM organization_admins a
        JOIN organization_students s ON s.id = p_membership AND s.organization_id = p_org
        WHERE a.organization_id = p_org
          AND a.user_id = unified_current_profile_id()
          AND a.status = 'active'
          AND (
            a.role IN ('org_admin', 'placement_officer')
            OR (a.role = 'dept_admin' AND a.department_id = s.department_id)
          )
    )
$$;

REVOKE ALL ON FUNCTION unified_current_profile_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION unified_can_view_org_student(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unified_current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION unified_can_view_org_student(UUID, UUID) TO authenticated;

ALTER TABLE capability_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_capability_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_snapshots_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_best_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY capability_taxonomy_authenticated_read ON capability_taxonomy FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'ACTIVE');
CREATE POLICY capability_edges_authenticated_read ON capability_edges FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY target_roles_authenticated_read ON target_roles FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'ACTIVE');
CREATE POLICY role_requirements_authenticated_read ON role_capability_requirements FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY technical_artifacts_subject_read ON technical_artifacts FOR SELECT USING (
    student_profile_id = unified_current_profile_id()
    OR (organization_id IS NOT NULL AND unified_can_view_org_student(organization_id, organization_student_id))
);
CREATE POLICY technical_results_subject_read ON technical_analysis_results FOR SELECT USING (
    EXISTS (SELECT 1 FROM technical_artifacts a WHERE a.id = artifact_id)
);
CREATE POLICY evidence_subject_read ON evidence_events FOR SELECT USING (
    student_profile_id = unified_current_profile_id()
    OR (organization_id IS NOT NULL AND unified_can_view_org_student(organization_id, organization_student_id))
);
CREATE POLICY capability_states_subject_read ON capability_states FOR SELECT USING (
    student_profile_id = unified_current_profile_id()
    OR (organization_id IS NOT NULL AND unified_can_view_org_student(organization_id, organization_student_id))
);
CREATE POLICY readiness_v2_subject_read ON readiness_snapshots_v2 FOR SELECT USING (
    student_profile_id = unified_current_profile_id()
    OR (organization_id IS NOT NULL AND unified_can_view_org_student(organization_id, organization_student_id))
);
CREATE POLICY nba_subject_read ON next_best_actions FOR SELECT USING (student_profile_id = unified_current_profile_id());
CREATE POLICY entitlements_subject_read ON entitlement_grants FOR SELECT USING (
    profile_id = unified_current_profile_id()
    OR (organization_student_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM organization_students s
        WHERE s.id = organization_student_id AND s.user_id = unified_current_profile_id()
    ))
);
CREATE POLICY report_snapshots_subject_read ON report_snapshots FOR SELECT USING (
    student_profile_id = unified_current_profile_id()
    OR (organization_id IS NOT NULL AND unified_can_view_org_student(organization_id, organization_student_id))
);

-- Intentionally no authenticated INSERT/UPDATE/DELETE policies. Backend service
-- role performs validated writes. evidence_outbox has no client read policy.

COMMIT;
