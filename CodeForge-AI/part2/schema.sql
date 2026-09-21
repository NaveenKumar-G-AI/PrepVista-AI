-- ============================================================
-- CodeForge AI — Technical Diagnostic schema
-- Postgres / Supabase conventions (uuid pk, timestamptz, RLS).
-- Not run against a live instance from this environment — see
-- ARCHITECTURE_AND_TRUTH_TABLE.md for what's verified vs. sketched.
-- ============================================================

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ------------------------------------------------------------
-- Reference stub only. The real `roles` table is OWNED BY THE
-- ROLE CONTEXT DOMAIN (spec section 4) — this diagnostic module
-- consumes role_id/role_version, it does not define what a role
-- requires. Shown here only so the foreign keys below are valid
-- in an isolated migration; a real PR would not create this table.
-- ------------------------------------------------------------
create table if not exists roles (
  id text primary key,
  version int not null default 1,
  name text not null
);

create type task_type as enum (
  'CODING', 'DEBUGGING', 'CODE_READING', 'OUTPUT_PREDICTION',
  'CONCEPTUAL', 'COMPLEXITY_REASONING', 'TECHNICAL_REASONING', 'EXPLANATION'
);
create type difficulty_level as enum ('FOUNDATION', 'EASY', 'INTERMEDIATE', 'ADVANCED');
create type task_relationship as enum ('PRIMARY', 'SECONDARY', 'PREREQUISITE', 'CONTEXTUAL');
create type quality_status as enum ('DRAFT', 'REVIEW', 'VALIDATED', 'ACTIVE', 'DEPRECATED');
create type calibration_status as enum ('UNCALIBRATED', 'CALIBRATING', 'CALIBRATED');
create type session_status as enum ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'ABANDONED', 'EXPIRED');
create type evidence_type as enum (
  'CORRECT', 'INCORRECT', 'PARTIAL', 'EXECUTION', 'REASONING',
  'DEBUGGING', 'CODE_READING', 'HINT_DEPENDENCY', 'TIMING'
);
create type independence_signal as enum ('INDEPENDENT', 'ASSISTED');
create type confidence_level as enum ('INSUFFICIENT_EVIDENCE', 'LOW', 'MEDIUM', 'HIGH');
create type skill_level as enum ('FOUNDATION', 'DEVELOPING', 'COMPETENT', 'STRONG', 'ADVANCED');

-- ------------------------------------------------------------
-- diagnostic_blueprint — what this role's diagnostic must cover,
-- fixed before any task is ever selected (spec section 7).
-- ------------------------------------------------------------
create table diagnostic_blueprint (
  id uuid primary key default gen_random_uuid(),
  role_id text not null references roles(id),
  role_version int not null,
  version int not null default 1,
  task_budget int not null check (task_budget between 1 and 30),
  time_budget_minutes int not null check (time_budget_minutes between 1 and 120),
  coverage_rules jsonb not null,      -- required_skills, min_evidence_per_skill
  evidence_rules jsonb not null,      -- confidence thresholds, independence weighting
  stopping_rules jsonb not null,      -- budget / coverage / time precedence
  adaptive_policy_version text not null,
  status quality_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  unique (role_id, role_version, version)
);

-- ------------------------------------------------------------
-- diagnostic_task — versioned; NEVER update a row that has ever
-- been presented in a session (spec section 12). A content change
-- inserts a new version, it doesn't mutate history.
-- ------------------------------------------------------------
create table diagnostic_task (
  task_id text not null,
  version int not null default 1,
  title text not null,
  task_type task_type not null,
  difficulty difficulty_level not null,
  prompt text not null,
  constraints jsonb default '{}',
  examples jsonb default '[]',
  starter_code text,
  supported_languages text[] default array['javascript'],
  evaluation_definition jsonb not null, -- test cases / correct option / clause checks — server-side only
  expected_reasoning text,
  estimated_time_seconds int,
  quality_status quality_status not null default 'DRAFT',
  calibration_status calibration_status not null default 'UNCALIBRATED',
  exposure_count int not null default 0,
  last_exposed_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, version)
);
-- A task only becomes selectable once explicitly promoted through
-- DRAFT -> REVIEW -> VALIDATED -> ACTIVE. AI-drafted content starts
-- at DRAFT and is never auto-promoted (spec sections 14, 34, 98).
create index idx_diagnostic_task_active on diagnostic_task (task_type, difficulty) where active and quality_status = 'ACTIVE';

-- ------------------------------------------------------------
-- task_skill — the Q-matrix (spec section 13).
-- ------------------------------------------------------------
create table task_skill (
  task_id text not null,
  task_version int not null,
  skill_id text not null,
  relationship task_relationship not null,
  weight numeric(3,2) not null check (weight > 0 and weight <= 1),
  version int not null default 1,
  primary key (task_id, task_version, skill_id, relationship),
  foreign key (task_id, task_version) references diagnostic_task(task_id, version)
);

-- ------------------------------------------------------------
-- diagnostic_session — server-authoritative session state
-- (spec sections 6, 64, 82). Client localStorage is never the
-- source of truth for resume.
-- ------------------------------------------------------------
create table diagnostic_session (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  role_id text not null references roles(id),
  role_version int not null,
  blueprint_id uuid not null references diagnostic_blueprint(id),
  blueprint_version int not null,
  status session_status not null default 'NOT_STARTED',
  started_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,
  completion_reason text, -- EVIDENCE_SUFFICIENT | TASK_BUDGET_REACHED | TASK_BANK_EXHAUSTED | TIME_BUDGET_REACHED | ABANDONED | EXPIRED
  diagnostic_policy_version text not null,
  evaluation_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_diagnostic_session_student on diagnostic_session (student_id, created_at desc);

-- ------------------------------------------------------------
-- diagnostic_response — one authoritative record per submitted
-- task response (spec section 59, transactional save). idempotency_key
-- lets a client safely retry a POST without ever double-submitting
-- (spec section 60).
-- ------------------------------------------------------------
create table diagnostic_response (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references diagnostic_session(id),
  task_id text not null,
  task_version int not null,
  response_payload jsonb not null,   -- {code} | {optionIdx} | {text}; never the answer key
  hints_used int not null default 0,
  independence independence_signal not null,
  presented_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  idempotency_key text not null,
  foreign key (task_id, task_version) references diagnostic_task(task_id, version),
  unique (session_id, task_id),      -- one authoritative response per task per session
  unique (session_id, idempotency_key)
);

-- ------------------------------------------------------------
-- student_skill_evidence — granular, append-only (spec section
-- 35-36). A snapshot table below exists for read performance;
-- this table is the source of truth and is never overwritten.
-- ------------------------------------------------------------
create table student_skill_evidence (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  skill_id text not null,
  competency_id text,
  role_id text not null references roles(id),
  diagnostic_session_id uuid not null references diagnostic_session(id),
  task_id text not null,
  task_version int not null,
  relationship task_relationship not null,   -- which Q-matrix edge produced this row
  weight numeric(3,2) not null,
  evidence_type evidence_type not null,
  performance text not null,                 -- CORRECT | PARTIAL | INCORRECT | UNSCORED
  independence independence_signal not null,
  hints_used int not null default 0,
  ai_evaluation jsonb,                        -- present only for AI-scored evidence; schema-validated before insert
  observed_at timestamptz not null default now(),
  evaluation_version text not null,
  source text not null default 'diagnostic',
  foreign key (task_id, task_version) references diagnostic_task(task_id, version)
);
create index idx_evidence_student_skill on student_skill_evidence (student_id, skill_id, observed_at desc);
create index idx_evidence_session on student_skill_evidence (diagnostic_session_id);

-- ------------------------------------------------------------
-- technical_baseline_profile — derived snapshot for fast reads.
-- Regenerated from student_skill_evidence; never hand-edited.
-- level/confidence NEVER default to a numeric-looking score —
-- confidence = 'INSUFFICIENT_EVIDENCE' is a valid, honest value
-- (spec section 39).
-- ------------------------------------------------------------
create table technical_baseline_profile (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  role_id text not null references roles(id),
  diagnostic_session_id uuid not null references diagnostic_session(id),
  skill_id text not null,
  level skill_level,                          -- null when confidence = INSUFFICIENT_EVIDENCE
  confidence confidence_level not null,
  evidence_count int not null default 0,
  independence_signal independence_signal,
  why_explanation text not null,
  last_observed_at timestamptz,
  profile_version text not null,
  created_at timestamptz not null default now(),
  unique (diagnostic_session_id, skill_id)
);

-- ------------------------------------------------------------
-- ai_evaluation_log — prompt/model/schema versioning for every
-- AI-assisted grade (spec section 67). Never logs provider keys.
-- ------------------------------------------------------------
create table ai_evaluation_log (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references diagnostic_response(id),
  provider text not null,             -- 'groq' | 'gemini' | 'claude' | 'mock'
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  parsed_evaluation jsonb not null,   -- validated shape only; raw provider text is not persisted
  valid boolean not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Illustrative RLS policy sketch (Supabase). NOT verified against
-- a live instance from this environment — see truth table. Shown
-- to make the intended authorization boundary concrete.
-- ============================================================
-- alter table diagnostic_session enable row level security;
-- create policy "students read own sessions"
--   on diagnostic_session for select
--   using (student_id = auth.uid());
-- create policy "students create own sessions"
--   on diagnostic_session for insert
--   with check (student_id = auth.uid());
--
-- alter table diagnostic_response enable row level security;
-- create policy "students write responses to their own session"
--   on diagnostic_response for insert
--   with check (
--     exists (
--       select 1 from diagnostic_session s
--       where s.id = session_id and s.student_id = auth.uid() and s.status = 'IN_PROGRESS'
--     )
--   );
--
-- alter table student_skill_evidence enable row level security;
-- create policy "students read own evidence"
--   on student_skill_evidence for select
--   using (student_id = auth.uid());
-- -- No insert/update/delete policy for students on this table at all —
-- -- evidence is written only by the server-side evaluation path
-- -- (service role), never directly by a client.
--
-- alter table diagnostic_task enable row level security;
-- create policy "active validated tasks are readable, answer keys excluded at the app layer"
--   on diagnostic_task for select
--   using (active and quality_status = 'ACTIVE');
-- -- evaluation_definition (test cases / correct answers) must be
-- -- stripped at the API layer (see sanitizeTaskForClient in
-- -- domain-model.js) even though RLS allows reading the row —
-- -- RLS controls row access, not column redaction.
