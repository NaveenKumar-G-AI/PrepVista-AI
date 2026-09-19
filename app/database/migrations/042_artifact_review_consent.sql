-- Opt-in, named-recipient artifact feedback. No readiness/evidence triggers.
CREATE TABLE artifact_review_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL,
    reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    request_id UUID NOT NULL,
    artifact_digest TEXT NOT NULL,
    consent_version TEXT NOT NULL CHECK(consent_version='artifact-feedback-v1'),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','REVIEWED','WITHDRAWN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ,
    UNIQUE(user_id,request_id),
    FOREIGN KEY(user_id,artifact_id) REFERENCES coding_artifacts(user_id,id) ON DELETE CASCADE,
    CHECK(reviewer_id IS NULL OR reviewer_id<>user_id),
    CHECK((status='WITHDRAWN')=(withdrawn_at IS NOT NULL))
);
CREATE INDEX artifact_reviews_owner ON artifact_review_requests(user_id,created_at DESC,id);
CREATE INDEX artifact_reviews_recipient ON artifact_review_requests(reviewer_id,created_at DESC,id) WHERE status<>'WITHDRAWN';
CREATE TABLE artifact_review_feedback (
    review_id UUID PRIMARY KEY REFERENCES artifact_review_requests(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content JSONB NOT NULL CHECK(octet_length(content::text)<=20000),
    content_digest TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE artifact_review_audit (
    id BIGSERIAL PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES artifact_review_requests(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK(action IN ('CONSENT_GRANTED','FEEDBACK_SAVED','CONSENT_WITHDRAWN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(review_id,action)
);
ALTER TABLE artifact_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_review_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_review_audit ENABLE ROW LEVEL SECURITY;
