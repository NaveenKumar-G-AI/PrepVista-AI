-- ============================================================
-- PrepVista - Production Database Schema
-- ============================================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'career')),
    is_admin BOOLEAN DEFAULT FALSE,
    subscription_status TEXT DEFAULT 'none'
        CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'trialing')),
    interviews_used_this_period INT DEFAULT 0,
    period_start TIMESTAMPTZ DEFAULT NOW(),
    onboarding_completed BOOLEAN DEFAULT FALSE,
    prep_goal TEXT,
    theme_preference TEXT DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auth identity links (multiple provider identities can point to one profile)
CREATE TABLE IF NOT EXISTS auth_identity_links (
    auth_user_id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'email',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interview sessions
CREATE TABLE IF NOT EXISTS interview_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    -- ✅ SEC: CHECK on plan — prevents arbitrary plan strings bypassing PLAN_CONFIG
    plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'career')),
    -- ✅ SEC: CHECK on difficulty_mode — prevents arbitrary strings entering DB
    difficulty_mode TEXT NOT NULL DEFAULT 'auto'
        CHECK (difficulty_mode IN ('auto', 'basic', 'medium', 'difficult')),
    resume_text TEXT NOT NULL,
    resume_summary JSONB,
    resume_file_path TEXT,
    question_plan JSONB,
    state TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (state IN ('ACTIVE', 'FINISHED', 'TERMINATED')),
    total_turns INT DEFAULT 0,
    silence_count INT DEFAULT 0,
    consecutive_followups INT DEFAULT 0,
    skip_topics TEXT[] DEFAULT '{}',
    active_question_signature TEXT,
    active_question_turn INT,
    question_retry_count INT NOT NULL DEFAULT 0,
    last_answer_status TEXT,
    runtime_state JSONB DEFAULT '{}',
    -- ✅ SEC: Range CHECK on final_score — prevents scores outside 0-100 from
    -- corrupting analytics and leaderboard queries
    final_score NUMERIC(5,2) CHECK (final_score IS NULL OR (final_score >= 0 AND final_score <= 100)),
    rubric_scores JSONB,
    strengths TEXT[],
    weaknesses TEXT[],
    termination_reason TEXT,
    duration_planned_seconds INT CHECK (duration_planned_seconds IS NULL OR duration_planned_seconds > 0),
    duration_actual_seconds INT CHECK (duration_actual_seconds IS NULL OR duration_actual_seconds >= 0),
    proctoring_mode TEXT DEFAULT 'practice'
        CHECK (proctoring_mode IN ('practice', 'proctored', 'mock')),
    proctoring_violations JSONB DEFAULT '[]',
    -- ✅ SEC+PERF: UNIQUE on access_token — prevents token collision (security)
    -- and enables index-only lookup on every process_answer/finish_session call
    -- (performance). Without this index every token validation does a full table
    -- scan across ALL sessions. At 500 concurrent users this is catastrophic.
    access_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- Conversation messages (full transcript)
CREATE TABLE IF NOT EXISTS conversation_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('system', 'assistant', 'user')),
    content TEXT NOT NULL,
    turn_number INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-question evaluations (the core product value)
CREATE TABLE IF NOT EXISTS question_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    rubric_category TEXT NOT NULL,
    question_text TEXT NOT NULL,
    raw_answer TEXT,
    normalized_answer TEXT,
    classification TEXT CHECK (classification IN ('strong', 'partial', 'vague', 'wrong', 'silent')),
    score NUMERIC(3,1) NOT NULL DEFAULT 0,
    scoring_rationale TEXT,
    missing_elements TEXT[] DEFAULT '{}',
    ideal_answer TEXT,
    communication_score NUMERIC(3,1) DEFAULT 0,
    communication_notes TEXT,
    relevance_score NUMERIC(3,1) DEFAULT 0,
    clarity_score NUMERIC(3,1) DEFAULT 0,
    specificity_score NUMERIC(3,1) DEFAULT 0,
    structure_score NUMERIC(3,1) DEFAULT 0,
    answer_status TEXT,
    content_understanding TEXT,
    depth_quality TEXT,
    communication_clarity TEXT,
    what_worked TEXT,
    what_was_missing TEXT,
    how_to_improve TEXT,
    answer_blueprint TEXT,
    corrected_intent TEXT,
    answer_duration_seconds INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skill tracking across sessions
CREATE TABLE IF NOT EXISTS skill_scores (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    average_score NUMERIC(3,1) NOT NULL
        CHECK (average_score >= 0 AND average_score <= 10),
    question_count INT NOT NULL DEFAULT 0 CHECK (question_count >= 0),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    -- ✅ SEC: UNIQUE prevents duplicate category rows per session.
    -- Without this, a race between concurrent finish_session calls inserts
    -- duplicate rows that double-count every student's analytics scores.
    UNIQUE (user_id, session_id, category)
);

-- Usage events (audit trail)
CREATE TABLE IF NOT EXISTS usage_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product funnel events (growth tracking)
CREATE TABLE IF NOT EXISTS product_funnel_events (
    id BIGSERIAL PRIMARY KEY,
    event_name TEXT NOT NULL CHECK (
        event_name IN (
            'landing page viewed',
            'cta clicked',
            'signup completed',
            'resume uploaded',
            'mock started',
            'mock completed',
            'pricing page viewed',
            'upgrade clicked'
        )
    ),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Payments (Razorpay payment state machine)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    -- ✅ SEC: CHECK on plan prevents arbitrary plan strings in payment records
    plan TEXT NOT NULL CHECK (plan IN ('pro', 'career')),
    -- ✅ SEC: amount_paise must be positive — a zero or negative amount could be
    -- webhook-verified and grant plan access for free with no real payment
    amount_paise INT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'pending', 'verified', 'failed', 'refunded', 'expired')),
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    webhook_event_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ
);

-- Multi-plan ownership: users can own more than one paid tier and switch between them.
CREATE TABLE IF NOT EXISTS user_plan_entitlements (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('pro', 'career')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'refunded', 'expired')),
    source_order_id TEXT,
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, plan)
);

-- User purchase stats snapshot for Supabase admin visibility
CREATE TABLE IF NOT EXISTS user_purchase_stats (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    selected_plan TEXT NOT NULL DEFAULT 'free' CHECK (selected_plan IN ('free', 'pro', 'career')),
    highest_owned_plan TEXT NOT NULL DEFAULT 'free' CHECK (highest_owned_plan IN ('free', 'pro', 'career')),
    subscription_status TEXT NOT NULL DEFAULT 'none'
        CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'trialing')),
    free_status TEXT NOT NULL DEFAULT 'active',
    free_access BOOLEAN NOT NULL DEFAULT TRUE,
    free_purchase_count INT NOT NULL DEFAULT 0,
    pro_status TEXT NOT NULL DEFAULT 'not_purchased',
    pro_access BOOLEAN NOT NULL DEFAULT FALSE,
    pro_purchase_count INT NOT NULL DEFAULT 0,
    career_status TEXT NOT NULL DEFAULT 'not_purchased',
    career_access BOOLEAN NOT NULL DEFAULT FALSE,
    career_purchase_count INT NOT NULL DEFAULT 0,
    expired_plans TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing events (webhook log - idempotent)
CREATE TABLE IF NOT EXISTS billing_events (
    id BIGSERIAL PRIMARY KEY,
    provider_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Referral queue and reward tracking
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    invited_email_normalized TEXT NOT NULL,
    invited_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'joined', 'rejected')),
    reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ
);

-- User feedback submissions
CREATE TABLE IF NOT EXISTS feedback_entries (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    -- ✅ SEC: Length check — without this a single INSERT can store megabytes of
    -- text in one row, inflating table size and corrupting pg_statistics estimates.
    -- 5000 chars matches the api.ts feedback cap.
    feedback_text TEXT NOT NULL CHECK (char_length(feedback_text) <= 5000),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    report_data JSONB NOT NULL,
    pdf_file_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- updated_at auto-trigger
-- ============================================================
-- ✅ Without this, updated_at on profiles, interview_sessions, and
-- user_plan_entitlements never changes — it stays at the original creation
-- timestamp forever regardless of how many times the row is updated.
-- This corrupts: cache invalidation (stale data served), audit trails
-- (can't tell when a plan changed), and any ORDER BY updated_at queries.
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE OR REPLACE TRIGGER trg_user_plan_entitlements_updated_at
    BEFORE UPDATE ON user_plan_entitlements
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
-- ✅ SEC: RLS is the #1 Supabase-specific security gap.
-- Without RLS, ANY authenticated Supabase user who has your anon key
-- (it is PUBLIC in your frontend bundle — by design) can query:
--   GET https://your-project.supabase.co/rest/v1/interview_sessions
-- and receive EVERY student's resume text, answers, and scores.
-- FastAPI validates JWTs — but Supabase's own REST API bypasses FastAPI.
-- RLS enforces "users can only see their own rows" at the DB engine level.
--
-- IMPORTANT: These policies are additive with your FastAPI auth layer.
-- FastAPI still validates the JWT — RLS is the last-resort defence
-- if someone bypasses FastAPI and hits Supabase directly.

ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_evaluations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plan_entitlements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_purchase_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_scores            ENABLE ROW LEVEL SECURITY;

-- Profiles: users see and edit only their own row
CREATE POLICY profiles_self_select ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_self_update ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Interview sessions: users access only their own sessions
CREATE POLICY sessions_self_select ON interview_sessions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sessions_self_insert ON interview_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY sessions_self_update ON interview_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Conversation messages: only via the session owner
CREATE POLICY messages_session_owner ON conversation_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM interview_sessions s
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
    );

-- Question evaluations: only via the session owner
CREATE POLICY evaluations_session_owner ON question_evaluations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM interview_sessions s
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
    );

-- Skill scores: users see only their own
CREATE POLICY skill_scores_self ON skill_scores
    FOR SELECT USING (auth.uid() = user_id);

-- Usage events: users see only their own
CREATE POLICY usage_events_self ON usage_events
    FOR SELECT USING (auth.uid() = user_id);

-- Payments: users see only their own payment records
CREATE POLICY payments_self ON payments
    FOR SELECT USING (auth.uid() = user_id);

-- Plan entitlements: users see only their own
CREATE POLICY entitlements_self ON user_plan_entitlements
    FOR SELECT USING (auth.uid() = user_id);

-- Purchase stats: users see only their own
CREATE POLICY purchase_stats_self ON user_purchase_stats
    FOR SELECT USING (auth.uid() = user_id);

-- Billing events: no direct client access — backend service role only
CREATE POLICY billing_events_deny_all ON billing_events
    FOR ALL USING (FALSE);

-- Referrals: referrer sees their own outgoing referrals only
CREATE POLICY referrals_self ON referrals
    FOR SELECT USING (auth.uid() = referrer_user_id);

-- Feedback: users see only their own submissions
CREATE POLICY feedback_self ON feedback_entries
    FOR SELECT USING (auth.uid() = user_id);

-- Reports: users access only their own reports
CREATE POLICY reports_self ON reports
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sessions_user ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON interview_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_identity_links_profile ON auth_identity_links(profile_id);
CREATE INDEX IF NOT EXISTS idx_auth_identity_links_email_lower ON auth_identity_links(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_messages_session ON conversation_messages(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_evaluations_session ON question_evaluations(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_skills_user ON skill_scores(user_id, category, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_event_created ON product_funnel_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_created ON product_funnel_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_plan_entitlements_user ON user_plan_entitlements(user_id, status, plan);
CREATE INDEX IF NOT EXISTS idx_plan_entitlements_expiry ON user_plan_entitlements(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_purchase_stats_email ON user_purchase_stats(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created ON referrals(referrer_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_invited_email_unique ON referrals(invited_email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_invited_user_unique ON referrals(invited_user_id) WHERE invited_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_entries_user_created ON feedback_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_entries_created ON feedback_entries(created_at DESC);

-- ============================================================
-- Critical indexes added — all were missing from original schema
-- ============================================================

-- ✅ PERF+SEC: access_token lookup index — THE hottest query in the system.
-- Every process_answer() and finish_session() call does:
--   WHERE id = $session_id AND access_token = $token
-- Without this index, PostgreSQL does a full sequential scan of ALL sessions
-- for every single answer from every student. At 500 concurrent users all
-- answering simultaneously = 500 full table scans per second.
-- Also enforces uniqueness for token collision prevention (security).
CREATE INDEX IF NOT EXISTS idx_sessions_access_token ON interview_sessions(access_token);

-- ✅ PERF: Session state index — used by dashboard queries and admin analytics.
-- WHERE user_id = $1 AND state = 'FINISHED' — without this, the user_id index
-- is used but state must be filtered in memory across all sessions for the user.
CREATE INDEX IF NOT EXISTS idx_sessions_state ON interview_sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_user_state ON interview_sessions(user_id, state);

-- ✅ PERF: Plan + state — admin queries counting sessions by plan type.
-- Required for billing analytics and plan-usage reporting.
CREATE INDEX IF NOT EXISTS idx_sessions_plan_state ON interview_sessions(plan, state);

-- ✅ PERF: skill_scores session_id — analytics DELETE WHERE session_id = $1
-- in sync_session_skill_scores fires on every interview finish.
-- Without this index it does a full sequential scan of skill_scores.
CREATE INDEX IF NOT EXISTS idx_skill_scores_session ON skill_scores(session_id);

-- ✅ PERF: conversation_messages by role — finish_session fetches
-- WHERE session_id = $1 AND role = 'assistant'. The existing index is on
-- (session_id, turn_number) — adding role enables index-only scan.
CREATE INDEX IF NOT EXISTS idx_messages_session_role ON conversation_messages(session_id, role);

-- ✅ PERF: billing_events unprocessed — webhook processor queries
-- WHERE processed = FALSE ORDER BY created_at ASC. Without this, every
-- webhook run scans the entire billing_events table.
CREATE INDEX IF NOT EXISTS idx_billing_events_unprocessed ON billing_events(processed, created_at ASC)
    WHERE processed = FALSE;

-- ✅ PERF: profiles plan — plan-based user counts used in admin analytics
-- and billing dashboards. Without this, COUNT(*) WHERE plan = 'career'
-- requires a full sequential scan of all profiles.
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON profiles(plan);

-- ✅ PERF: payments razorpay_payment_id — webhook deduplication looks up
-- by payment_id to find the matching payment record. Without this index,
-- every webhook event scans the full payments table.
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(razorpay_payment_id)
    WHERE razorpay_payment_id IS NOT NULL;