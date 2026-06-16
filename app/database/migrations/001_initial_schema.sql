-- ============================================================
-- PrepVista-AI — Production Database Schema
-- File   : 001_initial_schema.sql
-- Version: 2.0 — B2B Cohort Intelligence Layer
--
-- Rewritten per MBP-1 Phase 3.
-- Adds full B2B institutional analytics foundation on top of
-- the original B2C schema. All original functionality preserved.
--
-- BREAKING CHANGE (1): reports.session_id is now NULLABLE.
--   Original: UUID UNIQUE NOT NULL
--   New     : UUID (nullable, non-unique)
--   Uniqueness for individual reports is enforced by partial index
--   idx_reports_session_unique (WHERE session_id IS NOT NULL).
--   → Fix: make session_id Optional[UUID] in the Report Pydantic model.
--     Always pass report_type='individual' on existing inserts.
--
-- BREAKING CHANGE (2): rubric category strings are now CHECK-constrained.
--   question_evaluations.rubric_category and skill_scores.category
--   now accept ONLY the 14 lowercase_underscore canonical strings
--   listed in those table definitions. Any legacy strings using spaces
--   or hyphens will fail on INSERT.
--   → Fix: audit all rubric_category= and category= write paths.
--
-- If this migration has already been applied to a live database,
-- extract only the new DDL into 002_b2b_cohort_layer.sql instead
-- of re-running this file.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- SECTION 1: B2B FOUNDATION
-- Must precede profiles because profiles.institution_id
-- holds a FK reference into this table.
-- ─────────────────────────────────────────────────────────────

-- Institution master record.
-- One row per college / university that has purchased seats.
-- Every B2B feature (cohort dashboards, TPO reports, RLS scope) keys
-- off institution_id from this table.
CREATE TABLE IF NOT EXISTS institutions (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT         NOT NULL,
    -- URL-safe slug for routing and report filenames.
    -- e.g. 'vit-vellore', 'srm-chennai', 'iit-madras'
    short_code    TEXT         NOT NULL UNIQUE,
    contact_email TEXT         NOT NULL,
    contact_phone TEXT,
    -- Contracted seat count; used for seat-utilisation reporting (Q6).
    seat_count    INT          NOT NULL DEFAULT 500
                  CHECK (seat_count > 0),
    plan          TEXT         NOT NULL DEFAULT 'basic'
                  CHECK (plan IN ('basic', 'enterprise')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    logo_url      TEXT,
    address       TEXT,
    city          TEXT,
    -- 'state_name' avoids implicit collision with the reserved keyword
    -- 'state' in some ORM and tooling contexts.
    state_name    TEXT,
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 2: CORE USER TABLE
-- ─────────────────────────────────────────────────────────────

-- User profiles (extends Supabase auth.users via id FK).
-- B2B columns (institution_id onward) are NULL for B2C users.
-- Performance snapshot columns (readiness_tier onward) are maintained
-- automatically by trg_session_finished — never update manually.
CREATE TABLE IF NOT EXISTS profiles (
    id                           UUID         PRIMARY KEY,
    email                        TEXT         UNIQUE NOT NULL,
    full_name                    TEXT,
    avatar_url                   TEXT,
    plan                         TEXT         NOT NULL DEFAULT 'free'
                                 CHECK (plan IN ('free', 'pro', 'career')),
    -- is_admin = PrepVista platform super-admin.
    -- Institution TPO admin roles live in institution_admins, not here.
    is_admin                     BOOLEAN      DEFAULT FALSE,
    subscription_status          TEXT         DEFAULT 'none'
                                 CHECK (subscription_status IN (
                                     'none', 'active', 'past_due', 'canceled', 'trialing'
                                 )),
    interviews_used_this_period  INT          DEFAULT 0,
    period_start                 TIMESTAMPTZ  DEFAULT NOW(),
    onboarding_completed         BOOLEAN      DEFAULT FALSE,
    prep_goal                    TEXT,
    theme_preference             TEXT         DEFAULT 'system'
                                 CHECK (theme_preference IN ('light', 'dark', 'system')),

    -- ── B2B COHORT FIELDS ──────────────────────────────────────────────────
    -- NULL for B2C individual users.
    -- Populated by a TPO admin batch-import or enrollment API.
    institution_id               UUID         REFERENCES institutions(id) ON DELETE SET NULL,
    department                   TEXT,        -- e.g. 'CSE', 'ECE', 'MECH', 'MBA'
    batch                        TEXT,        -- e.g. '2022-2026'
    graduation_year              INT
                                 CHECK (graduation_year IS NULL
                                     OR (graduation_year >= 2000 AND graduation_year <= 2100)),
    student_roll_number          TEXT,
    -- Queryable target_role extracted from resume_summary at session creation.
    -- Powers the Sankey role-fit visualisation (Q1).
    target_role                  TEXT,

    -- ── DENORMALISED PERFORMANCE SNAPSHOT ─────────────────────────────────
    -- Maintained by trg_session_finished (BEFORE UPDATE on interview_sessions).
    -- Enables O(1) TPO dashboard queries over 500-seat cohorts instead of
    -- re-aggregating thousands of skill_scores rows on every page load.
    --
    -- Readiness tier thresholds (compute_readiness_tier formula):
    --   score >= 75 → 'ready'        (top ~25%; placement-ready NOW)
    --   score >= 60 → 'almost_ready' (above cohort mean; targeted improvement needed)
    --   score >= 40 → 'developing'   (below mean; systematic training required)
    --   score <  40 → 'at_risk'      (significant intervention; zero-offer risk)
    readiness_tier               TEXT         NOT NULL DEFAULT 'developing'
                                 CHECK (readiness_tier IN (
                                     'ready', 'almost_ready', 'developing', 'at_risk'
                                 )),
    -- TRUE when ANY risk criterion fires:
    --   (a) tier='at_risk' AND total_sessions_completed >= 3
    --       (avoids flagging brand-new students after one bad session)
    --   (b) sessions_without_improvement >= 5  (completely stuck)
    --   (c) latest_overall_score < 30          (critically low)
    is_zero_offer_risk           BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Updated on every FINISHED session by trg_session_finished.
    latest_overall_score         NUMERIC(5,2)
                                 CHECK (latest_overall_score IS NULL
                                     OR (latest_overall_score >= 0 AND latest_overall_score <= 100)),
    -- Set exactly once on the first FINISHED session; never modified after.
    -- Growth delta = latest_overall_score - first_overall_score.
    first_overall_score          NUMERIC(5,2)
                                 CHECK (first_overall_score IS NULL
                                     OR (first_overall_score >= 0 AND first_overall_score <= 100)),
    total_sessions_completed     INT          NOT NULL DEFAULT 0
                                 CHECK (total_sessions_completed >= 0),
    -- Consecutive sessions with score_delta <= 0.
    -- Resets to 0 on any positive delta. Triggers zero-offer risk at >= 5.
    sessions_without_improvement INT          NOT NULL DEFAULT 0
                                 CHECK (sessions_without_improvement >= 0),
    -- Set when readiness_tier moves to a higher tier (e.g. developing → almost_ready).
    -- NULL = tier has never improved.
    last_improvement_at          TIMESTAMPTZ,
    -- Target score used by compute_time_to_threshold(). Default = 'ready' floor.
    target_score                 NUMERIC(5,2) NOT NULL DEFAULT 75.0
                                 CHECK (target_score >= 0 AND target_score <= 100),

    -- ── TIMESTAMPS ────────────────────────────────────────────────────────
    created_at                   TIMESTAMPTZ  DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ  DEFAULT NOW()
);

-- Auth identity links (multiple provider identities → one profile).
CREATE TABLE IF NOT EXISTS auth_identity_links (
    auth_user_id UUID         PRIMARY KEY,
    profile_id   UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email        TEXT         NOT NULL,
    provider     TEXT         NOT NULL DEFAULT 'email',
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 3: B2B ADMIN LAYER
-- ─────────────────────────────────────────────────────────────

-- Maps PrepVista users to their institution admin role.
-- tpo_admin  → full institution-wide read access (all departments).
-- dept_admin → read access scoped to their `department` column value.
-- viewer     → read-only institution-wide (principals, NAAC/NIRF auditors).
--
-- The `department` column is meaningful only for dept_admin rows;
-- tpo_admin and viewer rows should leave it NULL (= all departments).
CREATE TABLE IF NOT EXISTS institution_admins (
    id             BIGSERIAL    PRIMARY KEY,
    institution_id UUID         NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    user_id        UUID         NOT NULL REFERENCES profiles(id)     ON DELETE CASCADE,
    role           TEXT         NOT NULL DEFAULT 'tpo_admin'
                   CHECK (role IN ('tpo_admin', 'dept_admin', 'viewer')),
    -- dept_admin only: restricts RLS visibility to this department.
    -- NULL = all departments (used for tpo_admin / viewer rows).
    department     TEXT,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (institution_id, user_id)
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 4: INTERVIEW CORE
-- ─────────────────────────────────────────────────────────────

-- Interview sessions (one row per mock interview).
CREATE TABLE IF NOT EXISTS interview_sessions (
    id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    -- ✅ SEC: CHECK on plan prevents arbitrary strings bypassing PLAN_CONFIG.
    plan                      TEXT         NOT NULL
                              CHECK (plan IN ('free', 'pro', 'career')),
    -- ✅ SEC: CHECK on difficulty_mode.
    difficulty_mode           TEXT         NOT NULL DEFAULT 'auto'
                              CHECK (difficulty_mode IN ('auto', 'basic', 'medium', 'difficult')),
    resume_text               TEXT         NOT NULL,
    resume_summary            JSONB,
    resume_file_path          TEXT,
    question_plan             JSONB,
    state                     TEXT         NOT NULL DEFAULT 'ACTIVE'
                              CHECK (state IN ('ACTIVE', 'FINISHED', 'TERMINATED')),
    total_turns               INT          DEFAULT 0,
    silence_count             INT          DEFAULT 0,
    consecutive_followups     INT          DEFAULT 0,
    skip_topics               TEXT[]       DEFAULT '{}',
    active_question_signature TEXT,
    active_question_turn      INT,
    question_retry_count      INT          NOT NULL DEFAULT 0,
    last_answer_status        TEXT,
    runtime_state             JSONB        DEFAULT '{}',
    -- ✅ SEC: Range CHECK prevents scores outside 0–100 corrupting analytics.
    final_score               NUMERIC(5,2)
                              CHECK (final_score IS NULL
                                  OR (final_score >= 0 AND final_score <= 100)),
    rubric_scores             JSONB,
    strengths                 TEXT[]       DEFAULT '{}',
    weaknesses                TEXT[]       DEFAULT '{}',
    termination_reason        TEXT,
    duration_planned_seconds  INT
                              CHECK (duration_planned_seconds IS NULL
                                  OR duration_planned_seconds > 0),
    duration_actual_seconds   INT
                              CHECK (duration_actual_seconds IS NULL
                                  OR duration_actual_seconds >= 0),
    proctoring_mode           TEXT         DEFAULT 'practice'
                              CHECK (proctoring_mode IN ('practice', 'proctored', 'mock')),
    proctoring_violations     JSONB        DEFAULT '[]',
    -- ✅ SEC+PERF: UNIQUE guards against token collision; enables index-only
    -- lookup on every process_answer / finish_session call.
    access_token              TEXT         NOT NULL UNIQUE,

    -- ── GROWTH & B2B FIELDS ──────────────────────────────────────────────
    -- Ordinal position in this user's session history (1 = first ever, 2 = second…).
    -- Set at INSERT by trg_sessions_assign_number.
    -- Used as the x-axis (independent variable) in OLS slope calculations (Q4).
    session_number            INT
                              CHECK (session_number IS NULL OR session_number > 0),
    -- Score change vs. the user's most recent prior FINISHED session.
    -- Positive = improved. Negative = regressed. 0 = first session (no baseline).
    -- Set at FINISH by trg_session_finished.
    score_delta               NUMERIC(5,2),
    -- Denormalised from profiles.institution_id at INSERT time by
    -- trg_sessions_assign_number. Enables institution-scoped session queries
    -- without JOINing profiles — critical for cohort analytics at 500+ seats.
    institution_id            UUID         REFERENCES institutions(id) ON DELETE SET NULL,

    -- ── TIMESTAMPS ──────────────────────────────────────────────────────
    created_at                TIMESTAMPTZ  DEFAULT NOW(),
    finished_at               TIMESTAMPTZ
);

-- Conversation messages (full transcript per session).
CREATE TABLE IF NOT EXISTS conversation_messages (
    id          BIGSERIAL    PRIMARY KEY,
    session_id  UUID         NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    role        TEXT         NOT NULL CHECK (role IN ('system', 'assistant', 'user')),
    content     TEXT         NOT NULL,
    turn_number INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Per-question evaluations (the core product value unit).
--
-- ✅ NEW: rubric_category now has an explicit CHECK against all 14
-- canonical category strings (lowercase_underscore).
-- Without this, a single inconsistency (e.g. 'technical depth' vs
-- 'technical_depth') silently splits GROUP BY aggregations and
-- undercounts cohort skill gaps (Q3). Effort: near-zero. Impact: all
-- Q3 queries become trustworthy.
CREATE TABLE IF NOT EXISTS question_evaluations (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            UUID         NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    turn_number           INT          NOT NULL,
    rubric_category       TEXT         NOT NULL
                          CHECK (rubric_category IN (
                              'communication',   'technical_depth', 'problem_solving',
                              'confidence',      'structure_star',  'vocabulary',
                              'vocal_delivery',  'leadership',      'teamwork',
                              'adaptability',    'reasoning',       'conciseness',
                              'professionalism', 'role_fit'
                          )),
    question_text         TEXT         NOT NULL,
    raw_answer            TEXT,
    normalized_answer     TEXT,
    classification        TEXT
                          CHECK (classification IN (
                              'strong', 'partial', 'vague', 'wrong', 'silent'
                          )),
    score                 NUMERIC(3,1) NOT NULL DEFAULT 0,
    scoring_rationale     TEXT,
    missing_elements      TEXT[]       DEFAULT '{}',
    ideal_answer          TEXT,
    communication_score   NUMERIC(3,1) DEFAULT 0,
    communication_notes   TEXT,
    relevance_score       NUMERIC(3,1) DEFAULT 0,
    clarity_score         NUMERIC(3,1) DEFAULT 0,
    specificity_score     NUMERIC(3,1) DEFAULT 0,
    structure_score       NUMERIC(3,1) DEFAULT 0,
    answer_status         TEXT,
    content_understanding TEXT,
    depth_quality         TEXT,
    communication_clarity TEXT,
    what_worked           TEXT,
    what_was_missing      TEXT,
    how_to_improve        TEXT,
    answer_blueprint      TEXT,
    corrected_intent      TEXT,
    answer_duration_seconds INT,
    created_at            TIMESTAMPTZ  DEFAULT NOW()
);

-- Skill score tracking across sessions (per-category, per-session).
--
-- ✅ NEW: category is CHECK-constrained to the same 14 canonical values
-- as question_evaluations.rubric_category. JOINs between these two tables
-- are now guaranteed to be consistent. Without this, JOIN conditions
-- silently produce empty or under-counted result sets for Q3 analysis.
CREATE TABLE IF NOT EXISTS skill_scores (
    id            BIGSERIAL    PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES profiles(id)          ON DELETE CASCADE,
    session_id    UUID         NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    category      TEXT         NOT NULL
                  CHECK (category IN (
                      'communication',   'technical_depth', 'problem_solving',
                      'confidence',      'structure_star',  'vocabulary',
                      'vocal_delivery',  'leadership',      'teamwork',
                      'adaptability',    'reasoning',       'conciseness',
                      'professionalism', 'role_fit'
                  )),
    -- 0–10 scale. Multiply × 10 when comparing with final_score (0–100).
    average_score NUMERIC(3,1) NOT NULL
                  CHECK (average_score >= 0 AND average_score <= 10),
    question_count INT         NOT NULL DEFAULT 0
                  CHECK (question_count >= 0),
    recorded_at   TIMESTAMPTZ  DEFAULT NOW(),
    -- ✅ SEC: Prevents duplicate category rows per session under concurrent
    -- finish_session calls (race guard).
    UNIQUE (user_id, session_id, category)
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 5: ANALYTICS TABLES (NEW)
-- ─────────────────────────────────────────────────────────────

-- Per-session answer quality pattern flags.
-- Surfaces the ~9 flags (currently buried in opaque runtime_state JSONB)
-- as queryable NUMERIC columns, enabling cohort-wide softskill analysis
-- that rubric category scores alone cannot reveal (Q3).
--
-- Written by the backend at session finish alongside skill_scores.
-- UNIQUE(session_id) — exactly one row per completed session.
CREATE TABLE IF NOT EXISTS answer_quality_flags (
    id                        BIGSERIAL    PRIMARY KEY,
    session_id                UUID         NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    user_id                   UUID         NOT NULL REFERENCES profiles(id)           ON DELETE CASCADE,
    -- Filler words (um/uh/like/you know) ÷ total word count. Range [0,1].
    filler_word_ratio         NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (filler_word_ratio >= 0 AND filler_word_ratio <= 1),
    -- STAR method adherence aggregated across all structured answers. Range [0,10].
    star_usage_score          NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (star_usage_score >= 0 AND star_usage_score <= 10),
    -- Tendency to dodge or deflect direct questions. Range [0,10] (higher = more evasive).
    evasiveness_score         NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (evasiveness_score >= 0 AND evasiveness_score <= 10),
    -- Professional warmth vs. robotic/negative register. Range [0,10].
    tone_score                NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (tone_score >= 0 AND tone_score <= 10),
    -- Cross-question answer content duplication. Range [0,1].
    repetition_ratio          NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (repetition_ratio >= 0 AND repetition_ratio <= 1),
    -- Assertive language, declarative phrasing, minimal hedging. Range [0,10].
    confidence_signal_score   NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (confidence_signal_score >= 0 AND confidence_signal_score <= 10),
    -- Grammatical correctness index. Range [0,10].
    grammar_score             NUMERIC(3,1) NOT NULL DEFAULT 0
                              CHECK (grammar_score >= 0 AND grammar_score <= 10),
    -- Type-Token Ratio = unique_words / total_words. Range [0,1].
    vocabulary_richness       NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (vocabulary_richness >= 0 AND vocabulary_richness <= 1),
    -- Fraction of questions with complete answers (strong or partial,
    -- not vague/wrong/silent). Range [0,1].
    answer_completeness_ratio NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (answer_completeness_ratio >= 0 AND answer_completeness_ratio <= 1),
    created_at                TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (session_id)
);

-- Pre-computed cohort-level snapshots.
-- Written by a backend scheduled job (nightly) or on-demand after a
-- significant batch of sessions finishes.
--
-- Prevents re-aggregating thousands of skill_scores rows on every TPO
-- dashboard load. All 14 category averages are stored so radar-overlay
-- and department-comparison charts are instant reads (Q4, Q6).
--
-- department / batch default to '' (empty string) for the institution-wide
-- slice. This avoids NULL equality issues in the UNIQUE constraint
-- (PostgreSQL treats NULL != NULL in UNIQUE checks, which would allow
-- unlimited duplicate institution-wide snapshots for the same date).
CREATE TABLE IF NOT EXISTS cohort_snapshots (
    id                   BIGSERIAL    PRIMARY KEY,
    institution_id       UUID         NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    snapshot_date        DATE         NOT NULL,
    -- '' = institution-wide; 'CSE' / 'ECE' / etc. = department slice.
    department           TEXT         NOT NULL DEFAULT '',
    -- '' = all batches; '2022-2026' = specific batch slice.
    batch                TEXT         NOT NULL DEFAULT '',
    -- Optional further dimension; not included in the unique key.
    graduation_year      INT,
    -- ── HEADCOUNTS ───────────────────────────────────────────────────────
    total_students       INT          NOT NULL DEFAULT 0,
    -- active_students: had >= 1 FINISHED session in this snapshot period.
    active_students      INT          NOT NULL DEFAULT 0,
    total_sessions       INT          NOT NULL DEFAULT 0,
    -- ── OVERALL SCORE ────────────────────────────────────────────────────
    avg_overall_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- ── ALL 14 RUBRIC CATEGORY AVERAGES (0–10 scale, matching skill_scores) ──
    avg_communication    NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_technical_depth  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_problem_solving  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_confidence       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_structure_star   NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_vocabulary       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_vocal_delivery   NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_leadership       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_teamwork         NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_adaptability     NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_reasoning        NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_conciseness      NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_professionalism  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_role_fit         NUMERIC(4,2) NOT NULL DEFAULT 0,
    -- ── READINESS TIER DISTRIBUTION ──────────────────────────────────────
    ready_count          INT          NOT NULL DEFAULT 0,
    almost_ready_count   INT          NOT NULL DEFAULT 0,
    developing_count     INT          NOT NULL DEFAULT 0,
    at_risk_count        INT          NOT NULL DEFAULT 0,
    -- ── GROWTH METRICS ────────────────────────────────────────────────────
    -- avg_score_delta: mean score_delta across active students this period.
    -- Positive = cohort is improving; near-zero or negative = training not
    -- working (Q4).
    avg_score_delta      NUMERIC(5,2),
    -- avg_slope: mean OLS regression slope across active students.
    -- Units: score-points per session. Populated by the backend snapshot
    -- job after calling compute_score_slope() for each active student.
    avg_slope            NUMERIC(5,3),
    created_at           TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (institution_id, snapshot_date, department, batch)
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 6: EVENTS & PAYMENTS
-- ─────────────────────────────────────────────────────────────

-- Usage events (audit trail).
CREATE TABLE IF NOT EXISTS usage_events (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    UUID         REFERENCES profiles(id) ON DELETE CASCADE,
    event_type TEXT         NOT NULL,
    metadata   JSONB        DEFAULT '{}',
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- Product funnel events (growth tracking).
-- ✅ NEW: institution_id added for B2B vs. B2C funnel separation (Q6).
-- ✅ NEW: Two institution-specific event names added to the CHECK constraint.
CREATE TABLE IF NOT EXISTS product_funnel_events (
    id             BIGSERIAL    PRIMARY KEY,
    event_name     TEXT         NOT NULL
                   CHECK (event_name IN (
                       'landing page viewed',
                       'cta clicked',
                       'signup completed',
                       'resume uploaded',
                       'mock started',
                       'mock completed',
                       'pricing page viewed',
                       'upgrade clicked',
                       -- B2B events (new in v2):
                       'institution registered',
                       'tpo dashboard viewed'
                   )),
    user_id        UUID         REFERENCES profiles(id)     ON DELETE SET NULL,
    -- NULL for B2C events. Populated for institution-specific events.
    institution_id UUID         REFERENCES institutions(id) ON DELETE SET NULL,
    metadata       JSONB        NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- Payments (Razorpay payment state machine).
CREATE TABLE IF NOT EXISTS payments (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider            TEXT         NOT NULL DEFAULT 'razorpay',
    -- ✅ SEC: CHECK on plan prevents arbitrary strings in payment records.
    plan                TEXT         NOT NULL
                        CHECK (plan IN ('pro', 'career')),
    -- ✅ SEC: amount_paise must be positive — a zero or negative amount could
    -- be webhook-verified and grant plan access for free with no real payment.
    amount_paise        INT          NOT NULL CHECK (amount_paise > 0),
    currency            TEXT         NOT NULL DEFAULT 'INR',
    status              TEXT         NOT NULL DEFAULT 'created'
                        CHECK (status IN (
                            'created', 'pending', 'verified', 'failed', 'refunded', 'expired'
                        )),
    razorpay_order_id   TEXT         UNIQUE,
    razorpay_payment_id TEXT,
    razorpay_signature  TEXT,
    webhook_event_id    TEXT,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    verified_at         TIMESTAMPTZ,
    refunded_at         TIMESTAMPTZ
);

-- Multi-plan ownership: a user can own more than one paid tier.
CREATE TABLE IF NOT EXISTS user_plan_entitlements (
    id              BIGSERIAL    PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan            TEXT         NOT NULL CHECK (plan IN ('pro', 'career')),
    status          TEXT         NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'refunded', 'expired')),
    source_order_id TEXT,
    activated_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (user_id, plan)
);

-- User purchase stats snapshot (Supabase admin visibility).
CREATE TABLE IF NOT EXISTS user_purchase_stats (
    user_id               UUID    PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    email                 TEXT    NOT NULL,
    selected_plan         TEXT    NOT NULL DEFAULT 'free'
                          CHECK (selected_plan     IN ('free', 'pro', 'career')),
    highest_owned_plan    TEXT    NOT NULL DEFAULT 'free'
                          CHECK (highest_owned_plan IN ('free', 'pro', 'career')),
    subscription_status   TEXT    NOT NULL DEFAULT 'none'
                          CHECK (subscription_status IN (
                              'none', 'active', 'past_due', 'canceled', 'trialing'
                          )),
    free_status           TEXT    NOT NULL DEFAULT 'active',
    free_access           BOOLEAN NOT NULL DEFAULT TRUE,
    free_purchase_count   INT     NOT NULL DEFAULT 0,
    pro_status            TEXT    NOT NULL DEFAULT 'not_purchased',
    pro_access            BOOLEAN NOT NULL DEFAULT FALSE,
    pro_purchase_count    INT     NOT NULL DEFAULT 0,
    career_status         TEXT    NOT NULL DEFAULT 'not_purchased',
    career_access         BOOLEAN NOT NULL DEFAULT FALSE,
    career_purchase_count INT     NOT NULL DEFAULT 0,
    expired_plans         TEXT[]  NOT NULL DEFAULT '{}',
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Billing events (webhook log — idempotent processing via provider_event_id).
CREATE TABLE IF NOT EXISTS billing_events (
    id                BIGSERIAL    PRIMARY KEY,
    provider_event_id TEXT         UNIQUE NOT NULL,
    event_type        TEXT         NOT NULL,
    provider          TEXT         NOT NULL DEFAULT 'razorpay',
    user_id           UUID         REFERENCES profiles(id) ON DELETE CASCADE,
    payload           JSONB        NOT NULL,
    processed         BOOLEAN      DEFAULT FALSE,
    created_at        TIMESTAMPTZ  DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 7: ENGAGEMENT & REPORTS
-- ─────────────────────────────────────────────────────────────

-- Referral queue and reward tracking.
CREATE TABLE IF NOT EXISTS referrals (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invited_email            TEXT         NOT NULL,
    invited_email_normalized TEXT         NOT NULL,
    invited_user_id          UUID         REFERENCES profiles(id) ON DELETE SET NULL,
    status                   TEXT         NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'joined', 'rejected')),
    reward_granted           BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMPTZ  DEFAULT NOW(),
    joined_at                TIMESTAMPTZ
);

-- User feedback submissions.
CREATE TABLE IF NOT EXISTS feedback_entries (
    id            BIGSERIAL    PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email         TEXT         NOT NULL,
    full_name     TEXT,
    -- ✅ SEC: Length check prevents megabyte-scale single inserts.
    feedback_text TEXT         NOT NULL CHECK (char_length(feedback_text) <= 5000),
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Generated reports.
--
-- BREAKING CHANGE: session_id is now NULLABLE to support cohort,
-- department, batch, and annual report types. The original UNIQUE NOT NULL
-- constraint is replaced by partial unique index idx_reports_session_unique
-- (WHERE session_id IS NOT NULL) which enforces per-session uniqueness for
-- individual reports without blocking cohort report rows.
--
-- A CHECK constraint enforces mutual exclusivity:
--   individual reports  → session_id IS NOT NULL, user_id IS NOT NULL,
--                         institution_id IS NULL
--   all other types     → institution_id IS NOT NULL, session_id IS NULL
CREATE TABLE IF NOT EXISTS reports (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- BREAKING: was UUID UNIQUE NOT NULL. Now nullable.
    -- Individual reports: always provide session_id.
    -- Cohort / dept / batch / annual reports: leave NULL.
    session_id     UUID         REFERENCES interview_sessions(id) ON DELETE CASCADE,
    -- NULL for cohort-level reports (no single owning user).
    user_id        UUID         REFERENCES profiles(id) ON DELETE CASCADE,
    -- NULL for individual reports; required for all non-individual types.
    institution_id UUID         REFERENCES institutions(id) ON DELETE CASCADE,
    -- Discriminator that enables Q6 cohort reporting.
    report_type    TEXT         NOT NULL DEFAULT 'individual'
                   CHECK (report_type IN (
                       'individual', 'cohort', 'department', 'batch', 'annual'
                   )),
    -- Populated for department and batch report types.
    department     TEXT,
    batch          TEXT,
    report_data    JSONB        NOT NULL,
    pdf_file_path  TEXT,
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    -- Data-integrity gate: enforces the individual vs. cohort split.
    CONSTRAINT chk_report_scope CHECK (
        (
            report_type = 'individual'
            AND session_id     IS NOT NULL
            AND user_id        IS NOT NULL
            AND institution_id IS NULL
        )
        OR
        (
            report_type IN ('cohort', 'department', 'batch', 'annual')
            AND institution_id IS NOT NULL
            AND session_id     IS NULL
        )
    )
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 8: UTILITY FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- ── updated_at auto-trigger ────────────────────────────────────────────────
-- ✅ Without this trigger, updated_at stays frozen at the creation timestamp
-- regardless of how many times a row is updated. Called by multiple triggers.
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- ── Readiness tier classifier ──────────────────────────────────────────────
-- Maps a 0–100 final_score to a readiness tier string.
-- IMMUTABLE: identical inputs always produce identical output.
-- The query planner can inline this function and fold it into index scans.
--
-- Tier thresholds:
--   >= 75 → 'ready'        (~top 25% of a typical campus placement cohort)
--   >= 60 → 'almost_ready' (above cohort mean; 1–2 targeted improvements needed)
--   >= 40 → 'developing'   (below mean; systematic coaching required)
--   <  40 → 'at_risk'      (significant intervention; zero-offer risk candidate)
CREATE OR REPLACE FUNCTION compute_readiness_tier(p_score NUMERIC)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_score IS NULL       THEN RETURN 'developing';  END IF;
    IF p_score >= 75.0       THEN RETURN 'ready';        END IF;
    IF p_score >= 60.0       THEN RETURN 'almost_ready'; END IF;
    IF p_score >= 40.0       THEN RETURN 'developing';   END IF;
    RETURN 'at_risk';
END;
$$;


-- ── OLS linear regression slope ───────────────────────────────────────────
-- Returns the Ordinary Least Squares slope of a student's score progression,
-- using session_number as the x-axis (ordinal) and score as y-axis.
--
-- Formula (closed-form OLS slope):
--   slope = ( n·Σ(xᵢ·yᵢ) − Σxᵢ·Σyᵢ ) / ( n·Σ(xᵢ²) − (Σxᵢ)² )
--
-- where:
--   xᵢ = session_number (ordinal: 1, 2, 3, …)
--   yᵢ = score for session i
--   n  = number of FINISHED sessions with valid scores and ordinals
--
-- Parameters:
--   p_user_id  → student UUID.
--   p_category → one of the 14 rubric categories for category-level slope.
--                NULL (default) → overall slope using final_score (0–100).
--
-- Returns NUMERIC(5,3) in units of score-points per session.
--   Positive  → student is improving            (Q4: training is working).
--   Negative  → student is regressing           (Q4/Q5: stuck detection).
--   NULL      → fewer than 2 data points        (slope undefined).
--
-- STABLE: no side effects; result may change between transactions as
-- new sessions are added.
CREATE OR REPLACE FUNCTION compute_score_slope(
    p_user_id  UUID,
    p_category TEXT DEFAULT NULL
)
RETURNS NUMERIC(5,3) LANGUAGE sql STABLE AS $$
WITH session_scores AS (
    SELECT
        is2.session_number::NUMERIC  AS x,
        CASE
            WHEN p_category IS NULL THEN is2.final_score
            -- Category scores are 0–10; multiply × 10 to normalise to
            -- the 0–100 scale so slopes are directly comparable with
            -- overall final_score slopes.
            ELSE ss.average_score * 10.0
        END                          AS y
    FROM  interview_sessions is2
    LEFT  JOIN skill_scores ss
           ON  ss.session_id  = is2.id
           AND ss.category    = p_category
    WHERE is2.user_id          = p_user_id
      AND is2.state            = 'FINISHED'
      AND is2.final_score     IS NOT NULL
      AND is2.session_number  IS NOT NULL
      -- Exclude sessions where the requested category score is absent.
      AND (p_category IS NULL OR ss.average_score IS NOT NULL)
),
ols AS (
    SELECT
        COUNT(*)    AS n,
        SUM(x)      AS sum_x,
        SUM(y)      AS sum_y,
        SUM(x * y)  AS sum_xy,
        SUM(x * x)  AS sum_x2
    FROM session_scores
)
SELECT
    CASE
        -- Slope undefined with fewer than 2 observations.
        WHEN n < 2                                    THEN NULL
        -- Zero x-variance guard: all session_numbers are identical.
        -- Impossible with our ordinal trigger but handled defensively.
        WHEN (n * sum_x2 - sum_x * sum_x) = 0        THEN 0
        ELSE ROUND(
            (n * sum_xy - sum_x * sum_y)
            /
            (n * sum_x2 - sum_x * sum_x),
            3
        )
    END
FROM ols;
$$;


-- ── Time-to-threshold estimator ────────────────────────────────────────────
-- Estimates additional sessions needed to reach a target score, given
-- current score and the OLS trend slope.
--
-- Formula:
--   sessions_needed = CEIL( (target_score − latest_overall_score) / slope )
--
-- Returns:
--   0    → student is already at or above target (Q1: placement-ready NOW).
--   NULL → slope <= 0 (diverging, not converging toward target) OR
--          fewer than 2 sessions (slope unknown).
--   INT  → estimated additional sessions needed (linear extrapolation).
--
-- Caveat: linear extrapolation assumes constant improvement rate.
-- Real improvement typically plateaus — treat this as a lower-bound estimate.
CREATE OR REPLACE FUNCTION compute_time_to_threshold(
    p_user_id      UUID,
    -- Explicit override; NULL → uses profiles.target_score (default 75.0).
    p_target_score NUMERIC DEFAULT NULL
)
RETURNS INT LANGUAGE sql STABLE AS $$
SELECT
    CASE
        WHEN slope IS NULL OR slope <= 0        THEN NULL
        WHEN latest_overall_score >= eff_target THEN 0
        ELSE CEIL((eff_target - latest_overall_score) / slope)::INT
    END
FROM (
    SELECT
        COALESCE(p_target_score, p.target_score, 75.0) AS eff_target,
        COALESCE(p.latest_overall_score, 0)            AS latest_overall_score,
        compute_score_slope(p_user_id, NULL)            AS slope
    FROM  profiles p
    WHERE p.id = p_user_id
) sub;
$$;


-- ── Cohort percentile rank ─────────────────────────────────────────────────
-- Returns the student's PERCENT_RANK within their institution cohort
-- based on latest_overall_score.
--
-- Formula (PostgreSQL window function):
--   PERCENT_RANK() = (rank - 1) / (cohort_size - 1)
--
-- Range: [0, 1] — 0 = lowest score in cohort, 1 = highest.
-- NULL if: student has no institution_id, or fewer than 2 members with
--          a non-NULL latest_overall_score exist in the cohort.
CREATE OR REPLACE FUNCTION compute_cohort_percentile(p_user_id UUID)
RETURNS NUMERIC(5,4) LANGUAGE sql STABLE AS $$
WITH inst AS (
    SELECT institution_id
    FROM   profiles
    WHERE  id              = p_user_id
      AND  institution_id IS NOT NULL
),
cohort AS (
    SELECT
        p.id,
        PERCENT_RANK() OVER (
            PARTITION BY p.institution_id
            ORDER BY     p.latest_overall_score ASC NULLS FIRST
        ) AS prank
    FROM  profiles  p
    JOIN  inst      i ON i.institution_id = p.institution_id
    WHERE p.latest_overall_score IS NOT NULL
)
SELECT ROUND(prank::NUMERIC, 4)
FROM   cohort
WHERE  id = p_user_id;
$$;


-- ── RLS helper functions ───────────────────────────────────────────────────
-- All three are SECURITY DEFINER so they execute as the function owner and
-- can read institution_admins without granting SELECT on that table to the
-- authenticated role. This is the standard Supabase RLS helper pattern.

-- Returns the institution_id of the current user's active admin membership.
-- NULL if the current user is not an institution admin.
CREATE OR REPLACE FUNCTION get_admin_institution_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT institution_id
    FROM   institution_admins
    WHERE  user_id   = auth.uid()
      AND  is_active = TRUE
    ORDER  BY id      -- deterministic if somehow two rows exist
    LIMIT  1;
$$;

-- Returns TRUE if the current user is an active admin (any role) for the
-- specified institution. Used in RLS policies on institutions,
-- cohort_snapshots, and reports.
CREATE OR REPLACE FUNCTION is_institution_admin(p_institution_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   institution_admins
        WHERE  user_id        = auth.uid()
          AND  institution_id = p_institution_id
          AND  is_active      = TRUE
    );
$$;

-- Returns TRUE if the current user can view data for the given
-- institution + department combination, respecting dept_admin scope.
--
-- Role semantics:
--   tpo_admin / viewer → full institution access regardless of p_department.
--   dept_admin         → access only when their department column matches
--                        p_department, or their department column IS NULL
--                        (which grants all-department access).
--
-- Used in profiles and interview_sessions RLS policies.
CREATE OR REPLACE FUNCTION admin_can_view_department(
    p_institution_id UUID,
    p_department     TEXT
)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   institution_admins
        WHERE  user_id        = auth.uid()
          AND  institution_id = p_institution_id
          AND  is_active      = TRUE
          AND  (
              -- tpo_admin and viewer: unrestricted institution-wide access.
              role IN ('tpo_admin', 'viewer')
              OR
              -- dept_admin: match on department; NULL dept = all departments.
              (role       = 'dept_admin'
               AND (department IS NULL OR department = p_department))
          )
    );
$$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 9: SESSION LIFECYCLE TRIGGER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- ── _assign_session_number ─────────────────────────────────────────────────
-- BEFORE INSERT on interview_sessions.
--
-- 1. Sets session_number = MAX(existing) + 1 for this user.
--    COALESCE handles the first-ever session case (MAX = NULL → 0 + 1 = 1).
-- 2. Denormalises institution_id from profiles onto the session row, so
--    institution-scoped cohort queries never need a JOIN to profiles.
--
-- Known concurrency limitation: if two sessions for the same user are INSERTed
-- in separate concurrent transactions within the same millisecond, both could
-- receive the same session_number. This cannot occur in PrepVista's current
-- architecture, which enforces one ACTIVE session per user at the API layer.
CREATE OR REPLACE FUNCTION _assign_session_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.session_number := COALESCE(
        (SELECT MAX(session_number)
         FROM   interview_sessions
         WHERE  user_id = NEW.user_id),
        0
    ) + 1;

    -- Honour any institution_id already set by the caller; only auto-fill
    -- when the column is NULL (the normal case for B2C sessions too).
    IF NEW.institution_id IS NULL THEN
        SELECT institution_id
        INTO   NEW.institution_id
        FROM   profiles
        WHERE  id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$;


-- ── _session_finished_sync ─────────────────────────────────────────────────
-- BEFORE UPDATE on interview_sessions.
-- Fires only when state transitions TO 'FINISHED' (WHEN clause on trigger).
--
-- Responsibilities (all within one ACID transaction):
--   1. Compute score_delta vs. the most recent prior FINISHED session.
--   2. Write score_delta back into NEW (BEFORE trigger can modify NEW).
--   3. Update the denormalised performance snapshot on profiles:
--        latest_overall_score  — always updated.
--        total_sessions_completed — incremented.
--        first_overall_score   — set once on session 1, never changed.
--        readiness_tier        — recomputed via compute_readiness_tier().
--        is_zero_offer_risk    — recomputed from tier + stuck counter + score.
--        sessions_without_improvement — reset on delta>0, incremented otherwise.
--        last_improvement_at   — set when tier moves to a higher tier.
--        updated_at            — always set to NOW().
--
-- Why BEFORE and not AFTER: BEFORE UPDATE triggers can modify NEW and have
-- that value committed atomically with the UPDATE. AFTER triggers cannot
-- modify the row being updated.
CREATE OR REPLACE FUNCTION _session_finished_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_prev_score             NUMERIC(5,2);
    v_score_delta            NUMERIC(5,2);
    v_new_tier               TEXT;
    v_old_tier               TEXT;
    v_old_sessions_no_improv INT;
    v_total_completed        INT;
    v_new_no_improv          INT;
    v_is_risk                BOOLEAN;
BEGIN
    -- Guard: skip if final_score is NULL (session FINISHED without scoring,
    -- e.g. early TERMINATION with no evaluated questions).
    -- Prevents NULL writes to the performance snapshot.
    IF NEW.final_score IS NULL THEN
        RETURN NEW;
    END IF;

    -- ── Step 1: Most recent prior FINISHED session score ──────────────────
    -- Since this is a BEFORE trigger, the current row still shows OLD.state
    -- in the table; id <> NEW.id is a defensive guard for re-entrant calls.
    -- ORDER BY session_number DESC for determinism; finished_at as tiebreaker.
    SELECT final_score
    INTO   v_prev_score
    FROM   interview_sessions
    WHERE  user_id         = NEW.user_id
      AND  state           = 'FINISHED'
      AND  id             <> NEW.id
    ORDER  BY session_number DESC NULLS LAST,
              finished_at   DESC NULLS LAST
    LIMIT  1;

    -- ── Step 2: Score delta ────────────────────────────────────────────────
    -- delta = new_score − prev_score.
    -- First session: COALESCE(NULL, new_score) → delta = 0 (no baseline).
    -- Positive = improvement. Negative = regression.
    v_score_delta   := NEW.final_score - COALESCE(v_prev_score, NEW.final_score);
    NEW.score_delta := v_score_delta;   -- write back into the session row

    -- ── Step 3: Read current profile snapshot ─────────────────────────────
    -- Capture before overwriting so arithmetic below uses consistent values.
    SELECT readiness_tier,
           COALESCE(sessions_without_improvement, 0),
           COALESCE(total_sessions_completed, 0)
    INTO   v_old_tier, v_old_sessions_no_improv, v_total_completed
    FROM   profiles
    WHERE  id = NEW.user_id;

    -- ── Step 4: New readiness tier ────────────────────────────────────────
    v_new_tier := compute_readiness_tier(NEW.final_score);

    -- ── Step 5: Consecutive sessions without improvement ──────────────────
    -- Reset to 0 on any positive delta; increment on flat or regression.
    v_new_no_improv := CASE
        WHEN v_score_delta > 0 THEN 0
        ELSE v_old_sessions_no_improv + 1
    END;

    -- ── Step 6: Zero-offer risk flag ──────────────────────────────────────
    -- Risk fires on ANY of three criteria:
    --   (a) Persistently at-risk: tier=at_risk AND >= 3 completed sessions.
    --       (Not flagging after just 1 bad session protects new students.)
    --   (b) Completely stuck: >= 5 consecutive sessions with no improvement.
    --   (c) Critically low score: final_score < 30 regardless of sessions.
    v_is_risk := (
        v_new_tier = 'at_risk' AND (v_total_completed + 1) >= 3
    ) OR (
        v_new_no_improv >= 5
    ) OR (
        NEW.final_score < 30.0
    );

    -- ── Step 7: Update denormalised profile snapshot ──────────────────────
    UPDATE profiles
    SET
        latest_overall_score         = NEW.final_score,
        -- Use captured v_total_completed + 1 to avoid stale-read race in
        -- concurrent transactions (extremely unlikely but defensive).
        total_sessions_completed     = v_total_completed + 1,
        -- first_overall_score: set only when this is the very first
        -- completed session. COALESCE handles the edge case where the
        -- column is NULL due to a pre-v2 schema data migration.
        first_overall_score          = CASE
                                           WHEN v_total_completed = 0
                                             OR first_overall_score IS NULL
                                           THEN NEW.final_score
                                           ELSE first_overall_score
                                       END,
        readiness_tier               = v_new_tier,
        is_zero_offer_risk           = v_is_risk,
        sessions_without_improvement = v_new_no_improv,
        -- last_improvement_at: set when tier moves strictly upward.
        -- Tier ordering (ascending readiness):
        --   at_risk < developing < almost_ready < ready
        last_improvement_at          = CASE
            WHEN (v_old_tier = 'at_risk'     AND v_new_tier IN ('developing', 'almost_ready', 'ready'))
              OR (v_old_tier = 'developing'   AND v_new_tier IN ('almost_ready', 'ready'))
              OR (v_old_tier = 'almost_ready' AND v_new_tier  = 'ready')
            THEN NOW()
            ELSE last_improvement_at
        END,
        updated_at                   = NOW()
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 10: TRIGGER BINDINGS
-- ─────────────────────────────────────────────────────────────

-- updated_at maintenance on profiles (original — unchanged).
CREATE OR REPLACE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- updated_at maintenance on user_plan_entitlements (original — unchanged).
CREATE OR REPLACE TRIGGER trg_user_plan_entitlements_updated_at
    BEFORE UPDATE ON user_plan_entitlements
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- updated_at maintenance on institutions (new in v2).
CREATE OR REPLACE TRIGGER trg_institutions_updated_at
    BEFORE UPDATE ON institutions
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- Assign session_number ordinal and denormalise institution_id at INSERT time.
CREATE OR REPLACE TRIGGER trg_sessions_assign_number
    BEFORE INSERT ON interview_sessions
    FOR EACH ROW EXECUTE FUNCTION _assign_session_number();

-- Sync denormalised profile snapshot when a session reaches FINISHED.
-- WHEN clause fires ONLY on state transitions TO 'FINISHED', not on every
-- UPDATE. This keeps the trigger effectively free for the hot-path
-- process_answer updates that do not change session state.
CREATE OR REPLACE TRIGGER trg_session_finished
    BEFORE UPDATE ON interview_sessions
    FOR EACH ROW
    WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state = 'FINISHED')
    EXECUTE FUNCTION _session_finished_sync();


-- ─────────────────────────────────────────────────────────────
-- SECTION 11: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
-- ✅ SEC: RLS is the critical Supabase security layer.
-- The anon key is PUBLIC in the frontend bundle (by design). Without RLS,
-- any authenticated user can call:
--   GET https://<project>.supabase.co/rest/v1/interview_sessions
-- and receive every student's resume text, answers, and scores.
-- FastAPI validates JWTs — but Supabase's PostgREST API bypasses FastAPI.
-- RLS enforces access control at the Postgres engine level as the last line.

ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_identity_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_admins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_evaluations    ENABLE ROW LEVEL SECURITY;
-- ✅ FIX: original schema had a duplicate ENABLE for skill_scores.
-- Deduplicated here — safe to run twice (idempotent).
ALTER TABLE skill_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_quality_flags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_snapshots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events            ENABLE ROW LEVEL SECURITY;
-- ✅ FIX: product_funnel_events had NO RLS in original schema.
-- Without this, all funnel rows are readable by every authenticated user.
ALTER TABLE product_funnel_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plan_entitlements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_purchase_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                 ENABLE ROW LEVEL SECURITY;


-- ── ORIGINAL B2C POLICIES (preserved, unchanged) ──────────────────────────

-- Profiles: each user sees and edits only their own row.
CREATE POLICY profiles_self_select ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_self_update ON profiles
    FOR UPDATE USING  (auth.uid() = id);

-- Interview sessions: users access only their own sessions.
CREATE POLICY sessions_self_select ON interview_sessions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sessions_self_insert ON interview_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY sessions_self_update ON interview_sessions
    FOR UPDATE USING  (auth.uid() = user_id);

-- Conversation messages: only readable via the session owner check.
CREATE POLICY messages_session_owner ON conversation_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM interview_sessions s
            WHERE  s.id      = session_id
              AND  s.user_id = auth.uid()
        )
    );

-- Question evaluations: only readable via the session owner check.
CREATE POLICY evaluations_session_owner ON question_evaluations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM interview_sessions s
            WHERE  s.id      = session_id
              AND  s.user_id = auth.uid()
        )
    );

-- Skill scores: users see only their own.
CREATE POLICY skill_scores_self ON skill_scores
    FOR SELECT USING (auth.uid() = user_id);

-- Usage events: users see only their own.
CREATE POLICY usage_events_self ON usage_events
    FOR SELECT USING (auth.uid() = user_id);

-- Payments: users see only their own payment records.
CREATE POLICY payments_self ON payments
    FOR SELECT USING (auth.uid() = user_id);

-- Plan entitlements: users see only their own.
CREATE POLICY entitlements_self ON user_plan_entitlements
    FOR SELECT USING (auth.uid() = user_id);

-- Purchase stats: users see only their own snapshot.
CREATE POLICY purchase_stats_self ON user_purchase_stats
    FOR SELECT USING (auth.uid() = user_id);

-- Billing events: no direct client access — backend service role only.
CREATE POLICY billing_events_deny_all ON billing_events
    FOR ALL USING (FALSE);

-- Referrals: referrers see only their own outgoing referrals.
CREATE POLICY referrals_self ON referrals
    FOR SELECT USING (auth.uid() = referrer_user_id);

-- Feedback: users see only their own submissions.
CREATE POLICY feedback_self ON feedback_entries
    FOR SELECT USING (auth.uid() = user_id);

-- Reports: users access only their own individual reports.
CREATE POLICY reports_self ON reports
    FOR SELECT USING (auth.uid() = user_id);


-- ── NEW POLICIES FOR auth_identity_links AND product_funnel_events ─────────

-- ✅ FIX: auth_identity_links had no RLS policies in the original schema.
-- Users can now see their own identity provider links via Supabase client.
CREATE POLICY auth_identity_links_self ON auth_identity_links
    FOR SELECT USING (auth.uid() = auth_user_id);

-- ✅ FIX: product_funnel_events is analytics-only.
-- No authenticated client should read or write these rows directly.
-- Backend service role bypasses RLS entirely (standard Supabase behaviour).
CREATE POLICY product_funnel_events_deny_all ON product_funnel_events
    FOR ALL USING (FALSE);


-- ── NEW B2B INSTITUTION ADMIN POLICIES ────────────────────────────────────
-- These are PERMISSIVE policies (the PostgreSQL default).
-- Multiple permissive policies are OR'd: B2C students still satisfy the
-- self-select policies above; institution admins additionally satisfy
-- the institution-scoped policies below.

-- institutions: admins can SELECT their own institution record.
-- INSERT / UPDATE are managed via service role only.
CREATE POLICY institutions_admin_select ON institutions
    FOR SELECT USING (is_institution_admin(id));

-- institution_admins: each admin user can SELECT their own membership row.
-- Lets the frontend check the current user's role without exposing other
-- admins' memberships.
CREATE POLICY institution_admins_self ON institution_admins
    FOR SELECT USING (user_id = auth.uid());

-- profiles: institution admins can SELECT student profiles in their institution.
-- admin_can_view_department() enforces dept_admin scope restrictions.
CREATE POLICY profiles_institution_admin_select ON profiles
    FOR SELECT USING (
        institution_id IS NOT NULL
        AND admin_can_view_department(institution_id, department)
    );

-- interview_sessions: institution admins can SELECT sessions in their cohort.
-- Joins to profiles only to resolve the student's department for dept_admin
-- scoping; the denormalised institution_id on sessions makes this efficient.
CREATE POLICY sessions_institution_admin_select ON interview_sessions
    FOR SELECT USING (
        institution_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE  p.id = interview_sessions.user_id
              AND  admin_can_view_department(
                       interview_sessions.institution_id,
                       p.department
                   )
        )
    );

-- skill_scores: institution admins can SELECT scores for students in their cohort.
CREATE POLICY skill_scores_institution_admin ON skill_scores
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE  p.id             = skill_scores.user_id
              AND  p.institution_id IS NOT NULL
              AND  admin_can_view_department(p.institution_id, p.department)
        )
    );

-- question_evaluations: institution admins can SELECT evaluations for their cohort.
CREATE POLICY evaluations_institution_admin ON question_evaluations
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM   interview_sessions s
            JOIN   profiles p ON p.id = s.user_id
            WHERE  s.id              = question_evaluations.session_id
              AND  p.institution_id IS NOT NULL
              AND  admin_can_view_department(p.institution_id, p.department)
        )
    );

-- answer_quality_flags: students see their own session flags.
CREATE POLICY aqf_self ON answer_quality_flags
    FOR SELECT USING (user_id = auth.uid());

-- answer_quality_flags: institution admins see their cohort's flags.
CREATE POLICY aqf_institution_admin ON answer_quality_flags
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE  p.id             = answer_quality_flags.user_id
              AND  p.institution_id IS NOT NULL
              AND  admin_can_view_department(p.institution_id, p.department)
        )
    );

-- cohort_snapshots: institution admins can SELECT, INSERT, and UPDATE
-- snapshots for their institution. The backend snapshot job uses service
-- role which bypasses RLS, but these policies allow direct admin queries
-- via the Supabase client as well.
CREATE POLICY cohort_snapshots_admin_select ON cohort_snapshots
    FOR SELECT USING (is_institution_admin(institution_id));

CREATE POLICY cohort_snapshots_admin_insert ON cohort_snapshots
    FOR INSERT WITH CHECK (is_institution_admin(institution_id));

CREATE POLICY cohort_snapshots_admin_update ON cohort_snapshots
    FOR UPDATE USING (is_institution_admin(institution_id));

-- reports: institution admins can SELECT cohort/batch/dept/annual reports.
CREATE POLICY reports_institution_admin_select ON reports
    FOR SELECT USING (
        institution_id IS NOT NULL
        AND is_institution_admin(institution_id)
    );

-- reports: institution admins can INSERT non-individual reports.
-- Individual reports (session_id IS NOT NULL) are written only by the
-- backend service role and must not be creatable via the Supabase client.
CREATE POLICY reports_institution_admin_insert ON reports
    FOR INSERT WITH CHECK (
        report_type       <> 'individual'
        AND institution_id IS NOT NULL
        AND is_institution_admin(institution_id)
    );


-- ─────────────────────────────────────────────────────────────
-- SECTION 12: INDEXES
-- ─────────────────────────────────────────────────────────────

-- ── ORIGINAL INDEXES (preserved, unchanged) ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sessions_user
    ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_created
    ON interview_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_identity_links_profile
    ON auth_identity_links(profile_id);
CREATE INDEX IF NOT EXISTS idx_auth_identity_links_email_lower
    ON auth_identity_links(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_messages_session
    ON conversation_messages(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_evaluations_session
    ON question_evaluations(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_skills_user
    ON skill_scores(user_id, category, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user
    ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_event_created
    ON product_funnel_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_created
    ON product_funnel_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user
    ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order
    ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_plan_entitlements_user
    ON user_plan_entitlements(user_id, status, plan);
CREATE INDEX IF NOT EXISTS idx_plan_entitlements_expiry
    ON user_plan_entitlements(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_purchase_stats_email
    ON user_purchase_stats(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created
    ON referrals(referrer_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_invited_email_unique
    ON referrals(invited_email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_invited_user_unique
    ON referrals(invited_user_id) WHERE invited_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_entries_user_created
    ON feedback_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_entries_created
    ON feedback_entries(created_at DESC);
-- ✅ PERF+SEC: access_token — hottest lookup in the system (every API call).
CREATE INDEX IF NOT EXISTS idx_sessions_access_token
    ON interview_sessions(access_token);
-- ✅ PERF: session state filtering.
CREATE INDEX IF NOT EXISTS idx_sessions_state
    ON interview_sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_user_state
    ON interview_sessions(user_id, state);
-- ✅ PERF: plan + state — billing analytics.
CREATE INDEX IF NOT EXISTS idx_sessions_plan_state
    ON interview_sessions(plan, state);
-- ✅ PERF: skill_scores by session — analytics and DELETE WHERE session_id=$1.
CREATE INDEX IF NOT EXISTS idx_skill_scores_session
    ON skill_scores(session_id);
-- ✅ PERF: conversation_messages by role — finish_session fetch.
CREATE INDEX IF NOT EXISTS idx_messages_session_role
    ON conversation_messages(session_id, role);
-- ✅ PERF: billing_events unprocessed — webhook processor ascending queue.
CREATE INDEX IF NOT EXISTS idx_billing_events_unprocessed
    ON billing_events(processed, created_at ASC) WHERE processed = FALSE;
-- ✅ PERF: profiles plan — plan-based user counts and admin dashboard.
CREATE INDEX IF NOT EXISTS idx_profiles_plan
    ON profiles(plan);
-- ✅ PERF: payments by razorpay_payment_id — webhook deduplication.
CREATE INDEX IF NOT EXISTS idx_payments_payment_id
    ON payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;


-- ── NEW: REPORTS BREAKING CHANGE REPLACEMENT INDEX ────────────────────────

-- ✅ Replaces the dropped UNIQUE NOT NULL constraint on reports.session_id.
-- Partial index enforces uniqueness for individual reports only
-- (WHERE session_id IS NOT NULL), without blocking cohort report rows
-- where session_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_session_unique
    ON reports(session_id) WHERE session_id IS NOT NULL;


-- ── NEW: B2B COHORT ANALYTICS INDEXES ────────────────────────────────────
-- Without these, every TPO dashboard load performs a full-table scan across
-- ALL B2C and B2B users combined. At 500 enrolled students + thousands of
-- B2C users, this is unusable. These indexes make all institution-scoped
-- queries O(log n) on the relevant subset.

-- ✅ PERF: institution entry-point — all cohort queries start here.
CREATE INDEX IF NOT EXISTS idx_profiles_institution
    ON profiles(institution_id);

-- ✅ PERF: department-level dashboard (Q2).
CREATE INDEX IF NOT EXISTS idx_profiles_institution_dept
    ON profiles(institution_id, department);

-- ✅ PERF: readiness tier grid (Q1) — filter and sort by tier in O(log n).
CREATE INDEX IF NOT EXISTS idx_profiles_institution_tier
    ON profiles(institution_id, readiness_tier);

-- ✅ PERF: batch cohort queries (Q2, Q6).
CREATE INDEX IF NOT EXISTS idx_profiles_institution_batch
    ON profiles(institution_id, batch);

-- ✅ PERF: graduation year slice (Q6).
CREATE INDEX IF NOT EXISTS idx_profiles_graduation_year
    ON profiles(institution_id, graduation_year);

-- ✅ PERF+Q5: zero-offer risk list (Q5).
-- Partial index: only indexes the ~10% of students who carry this flag.
-- The at-risk dashboard widget resolves in microseconds, not milliseconds.
CREATE INDEX IF NOT EXISTS idx_profiles_institution_risk
    ON profiles(institution_id) WHERE is_zero_offer_risk = TRUE;

-- ✅ PERF: institution-scoped session timeline (Q4, Q6).
CREATE INDEX IF NOT EXISTS idx_sessions_institution
    ON interview_sessions(institution_id, created_at DESC);

-- ✅ PERF: cohort FINISHED session analytics (Q4).
-- Partial index keeps it lean — only the FINISHED rows that matter for analytics.
CREATE INDEX IF NOT EXISTS idx_sessions_institution_finished
    ON interview_sessions(institution_id, finished_at DESC)
    WHERE state = 'FINISHED';

-- ✅ PERF: state filter within institution (Q2, Q4).
CREATE INDEX IF NOT EXISTS idx_sessions_institution_state
    ON interview_sessions(institution_id, state);

-- ✅ PERF: per-student growth queries (Q4).
-- Enables "give me sessions 1 and N for this student" as an index-only scan.
CREATE INDEX IF NOT EXISTS idx_sessions_user_number
    ON interview_sessions(user_id, session_number);

-- ✅ PERF: skill gap aggregation by rubric category (Q3).
-- Enables GROUP BY rubric_category on question_evaluations efficiently.
CREATE INDEX IF NOT EXISTS idx_evaluations_rubric_category
    ON question_evaluations(session_id, rubric_category);

-- ✅ PERF: cohort snapshot trend chart (Q4, Q6) — ordered time series read.
CREATE INDEX IF NOT EXISTS idx_cohort_snapshots_institution_date
    ON cohort_snapshots(institution_id, snapshot_date DESC);

-- ✅ PERF: department-level snapshot comparison (Q2, Q6).
CREATE INDEX IF NOT EXISTS idx_cohort_snapshots_dept
    ON cohort_snapshots(institution_id, department, snapshot_date DESC);

-- ✅ PERF: answer quality flags per user — cross-session flag trend queries.
CREATE INDEX IF NOT EXISTS idx_answer_quality_user
    ON answer_quality_flags(user_id, created_at DESC);

-- ✅ PERF: cohort / batch reports lookup (Q6).
CREATE INDEX IF NOT EXISTS idx_reports_institution
    ON reports(institution_id, report_type, created_at DESC);

-- ✅ PERF: B2B vs. B2C funnel separation (Q6).
-- Partial index — only B2B events (institution_id IS NOT NULL) are indexed here.
CREATE INDEX IF NOT EXISTS idx_funnel_events_institution
    ON product_funnel_events(institution_id, created_at DESC)
    WHERE institution_id IS NOT NULL;

-- ✅ PERF: active institution lookup for platform-level analytics.
CREATE INDEX IF NOT EXISTS idx_institutions_active
    ON institutions(is_active, created_at DESC) WHERE is_active = TRUE;

-- ── END OF SCHEMA ──────────────────────────────────────────────────────────