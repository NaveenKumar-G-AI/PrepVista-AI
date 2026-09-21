-- ACEAPT PROOF — Feature 28
-- Follows the RLS + SECURITY-DEFINER-only-write convention used across every
-- part of this project. proof_app receives NO direct table grants at all —
-- every read and write goes through a function in 002_functions.sql that
-- validates the caller's student context first. This avoids two bug classes
-- already hit on earlier parts: (1) RLS silently zeroing out the service
-- role's own reads, and (2) BYPASSRLS not being inherited through role
-- membership — solved here by not needing BYPASSRLS on the student-facing
-- path at all, and by granting it directly (never via a group role) to
-- proof_service for the one legitimate cross-student case.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Stand-in tables for existing PrepVista/ACEAPT entities (Section 40: reuse
-- existing tables — students, targets, attempts). No real ACEAPT repository
-- was reachable in this build session, so minimal versions live here purely
-- so the schema is self-contained and testable. Replace these two tables
-- with foreign keys into the real schema and drop this section.
-- ---------------------------------------------------------------------------

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists verification_targets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  role_name text not null,
  target_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Feature 28 entities (Section 40-42)
-- ---------------------------------------------------------------------------

create table if not exists simulation_profiles (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('QUICK_VERIFICATION','STANDARD_VERIFICATION','FULL_SIMULATION','FINAL_READINESS_CHECK')),
  question_count int not null check (question_count > 0),
  difficulty_distribution jsonb not null,
  topic_distribution jsonb not null,
  time_limit_ms int not null check (time_limit_ms > 0),
  novelty_target text not null check (novelty_target in ('FAMILIAR','RELATED','NOVEL','HIGHLY_NOVEL')),
  target_capability text not null,
  navigation_behavior text not null check (navigation_behavior in ('FREE','LINEAR')),
  scoring_rules jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists verification_requirements (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references verification_targets(id) on delete cascade,
  capability text not null,
  min_performance numeric(4,3) not null check (min_performance between 0 and 1),
  min_novelty text not null check (min_novelty in ('FAMILIAR','RELATED','NOVEL','HIGHLY_NOVEL')),
  min_consistency numeric(4,3) not null check (min_consistency between 0 and 1),
  min_timed_performance numeric(4,3) not null check (min_timed_performance between 0 and 1),
  min_confidence_evidence numeric(6,2) not null default 4,
  weight numeric(4,3) not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_requirement_active on verification_requirements (target_id, capability) where is_active;

create table if not exists verification_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  target_id uuid not null references verification_targets(id) on delete cascade,
  simulation_profile_id uuid not null references simulation_profiles(id),
  mode text not null check (mode in ('QUICK_VERIFICATION','STANDARD_VERIFICATION','FULL_SIMULATION','FINAL_READINESS_CHECK')),
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','COMPLETED','ABANDONED')),
  plan_reason text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists session_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references verification_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  question_index int not null,
  capability text not null,
  difficulty text not null check (difficulty in ('EASY','MEDIUM','HARD','TARGET')),
  novelty text not null check (novelty in ('FAMILIAR','RELATED','NOVEL','HIGHLY_NOVEL')),
  is_correct boolean not null,
  time_taken_ms int not null,
  expected_time_ms int not null,
  skipped boolean not null default false,
  changed_answer boolean not null default false,
  stalled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, question_index)
);

create table if not exists verification_evidence (
  id text primary key,
  student_id uuid not null references students(id) on delete cascade,
  session_id uuid references verification_sessions(id) on delete set null,
  source_attempt_id text,
  evidence_type text not null check (evidence_type in ('PRACTICE','RETENTION','TRANSFER','NOVEL','TIMED','DIFFICULTY','CONSISTENCY','SIMULATION','REPEATED_VERIFICATION')),
  capability text not null,
  difficulty text not null check (difficulty in ('EASY','MEDIUM','HARD','TARGET')),
  novelty text not null check (novelty in ('FAMILIAR','RELATED','NOVEL','HIGHLY_NOVEL')),
  performance numeric(4,3) not null check (performance between 0 and 1),
  time_taken_ms int,
  expected_time_ms int,
  is_valid boolean not null default true,
  quality jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists verification_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  session_id uuid references verification_sessions(id) on delete set null,
  target_id uuid not null references verification_targets(id) on delete cascade,
  status text not null check (status in ('NOT_VERIFIED','EMERGING_EVIDENCE','CONDITIONALLY_VERIFIED','VERIFIED','STRONGLY_VERIFIED')),
  confidence text not null check (confidence in ('LOW','MEDIUM','HIGH')),
  factors jsonb not null,
  evidence_summary jsonb not null,
  failure_signatures jsonb not null default '[]'::jsonb,
  explanation text not null,
  created_at timestamptz not null default now()
);

create table if not exists proof_snapshots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  target_id uuid not null references verification_targets(id) on delete cascade,
  result_id uuid not null references verification_results(id) on delete cascade,
  status text not null check (status in ('NOT_VERIFIED','EMERGING_EVIDENCE','CONDITIONALLY_VERIFIED','VERIFIED','STRONGLY_VERIFIED')),
  confidence text not null check (confidence in ('LOW','MEDIUM','HIGH')),
  verified_at timestamptz,
  aging_state text not null default 'RECHECK_RECOMMENDED' check (aging_state in ('VERIFIED','AGING','RECHECK_RECOMMENDED')),
  created_at timestamptz not null default now()
);

create index if not exists idx_evidence_student_capability on verification_evidence (student_id, capability);
create index if not exists idx_sessions_student on verification_sessions (student_id, created_at desc);
create index if not exists idx_snapshots_student_target on proof_snapshots (student_id, target_id, created_at);
create index if not exists idx_results_student_target on verification_results (student_id, target_id, created_at desc);
create index if not exists idx_responses_session on session_responses (session_id, question_index);

-- ---------------------------------------------------------------------------
-- Row-Level Security — every per-student table. FORCE is critical: it makes
-- the policy apply even to the table owner, which is what SECURITY DEFINER
-- functions run as (Section 50).
-- ---------------------------------------------------------------------------

alter table verification_sessions enable row level security;
alter table session_responses enable row level security;
alter table verification_evidence enable row level security;
alter table verification_results enable row level security;
alter table proof_snapshots enable row level security;

alter table verification_sessions force row level security;
alter table session_responses force row level security;
alter table verification_evidence force row level security;
alter table verification_results force row level security;
alter table proof_snapshots force row level security;

-- Reads a per-request session setting the SECURITY DEFINER functions set
-- immediately before touching a guarded table, from a parameter that came
-- from verified auth context — never from client-supplied request-body
-- data. In a real Supabase deployment, swap the policies below to read
-- auth.uid() directly instead of calling this function.
create or replace function app_current_student_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_student_id', true), '')::uuid;
$$;

drop policy if exists student_isolation_sessions on verification_sessions;
create policy student_isolation_sessions on verification_sessions
  using (student_id = app_current_student_id());

drop policy if exists student_isolation_responses on session_responses;
create policy student_isolation_responses on session_responses
  using (student_id = app_current_student_id());

drop policy if exists student_isolation_evidence on verification_evidence;
create policy student_isolation_evidence on verification_evidence
  using (student_id = app_current_student_id());

drop policy if exists student_isolation_results on verification_results;
create policy student_isolation_results on verification_results
  using (student_id = app_current_student_id());

drop policy if exists student_isolation_snapshots on proof_snapshots;
create policy student_isolation_snapshots on proof_snapshots
  using (student_id = app_current_student_id());

-- ---------------------------------------------------------------------------
-- Roles. proof_app: EXECUTE on the functions in 002_functions.sql and
-- NOTHING else — no direct table grants at all (matches "even the trusted
-- service role has no raw table grants" from the Skill Signal Engine part
-- of this project). proof_service: a separate role with BYPASSRLS granted
-- directly (never through membership) for the one legitimate cross-student
-- case, aggregate reporting — not used by the student-facing API path in
-- this delivery.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'proof_owner') then
    -- Owns every PROOF table and function. Deliberately NOT a superuser and
    -- NOT granted BYPASSRLS: superusers bypass row-level security
    -- unconditionally, so if the functions below were owned by a superuser
    -- (e.g. by simply running migrations as `postgres`), FORCE ROW LEVEL
    -- SECURITY would have no real effect and the isolation this file sets
    -- up would be decorative. NOLOGIN — nothing connects as this role
    -- directly; SECURITY DEFINER functions run as it.
    create role proof_owner nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'proof_app') then
    create role proof_app login password 'proof_app_dev_password'; -- fill in a real secret outside dev
  end if;
  if not exists (select 1 from pg_roles where rolname = 'proof_service') then
    create role proof_service login password 'proof_service_dev_password' bypassrls; -- fill in a real secret outside dev
  end if;
end $$;

alter table simulation_profiles owner to proof_owner;
alter table verification_requirements owner to proof_owner;
alter table verification_sessions owner to proof_owner;
alter table session_responses owner to proof_owner;
alter table verification_evidence owner to proof_owner;
alter table verification_results owner to proof_owner;
alter table proof_snapshots owner to proof_owner;

revoke all on all tables in schema public from proof_app;
grant usage on schema public to proof_app, proof_service;
-- CONNECT is granted to PUBLIC by default in Postgres; if your deployment
-- has revoked it, also run:
--   grant connect on database <your_db_name> to proof_app, proof_service;

commit;
