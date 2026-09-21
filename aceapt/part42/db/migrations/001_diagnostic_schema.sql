-- ACEAPT Feature 42 — Advanced Aptitude Diagnostic Engine
-- Migration 001: core schema
--
-- NAMING CONVENTION: every new table is prefixed diagnostic_ to avoid
-- collision with existing ACEAPT tables. Tables prefixed _fixture_ are NOT
-- part of Feature 42 — they are local stand-ins for the real ACEAPT
-- `students` and `questions` tables (Module 3/37: "if the existing question
-- model already contains these fields, reuse them"). Delete the fixture
-- tables and repoint the foreign keys below at your real tables when you
-- integrate this. See TRUTH_TABLE.md.

begin;

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ============================================================
-- FIXTURES — stand-ins for existing ACEAPT tables (see note above)
-- ============================================================

create table if not exists _fixture_students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  display_name text not null
);

create type question_difficulty as enum ('easy', 'medium', 'hard', 'very_hard');

create table if not exists _fixture_questions (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  topic text not null,
  subtopic text,
  skill_node_id uuid, -- FK added after diagnostic_blueprint_nodes exists
  difficulty question_difficulty not null,
  expected_time_ms integer not null check (expected_time_ms > 0),
  question_type text not null default 'mcq',
  concept text,
  prerequisite_of uuid references _fixture_questions (id),
  quality_status text not null default 'active' check (quality_status in ('active', 'flagged', 'retired'))
);

-- ============================================================
-- MODULE 2 — DIAGNOSTIC BLUEPRINT
-- ============================================================

create type blueprint_node_level as enum ('domain', 'topic', 'subtopic', 'skill');

create table diagnostic_blueprints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null default 1,
  mode text not null default 'first_diagnostic'
    check (mode in ('first_diagnostic', 'placement_diagnostic', 'topic_diagnostic',
                     'subtopic_diagnostic', 'company_diagnostic', 'reassessment',
                     'verification_diagnostic')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table diagnostic_blueprint_nodes (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references diagnostic_blueprints (id) on delete cascade,
  parent_node_id uuid references diagnostic_blueprint_nodes (id) on delete cascade,
  level blueprint_node_level not null,
  code text not null,               -- stable machine key, e.g. "quant.arithmetic.percentage"
  label text not null,              -- student-facing name, e.g. "Percentage"
  min_evidence_count integer not null default 4 check (min_evidence_count >= 0),
  target_difficulty_weight jsonb not null default
    '{"easy":0.3,"medium":0.4,"hard":0.2,"very_hard":0.1}'::jsonb,
  display_order integer not null default 0,
  unique (blueprint_id, code)
);

create index idx_blueprint_nodes_parent on diagnostic_blueprint_nodes (parent_node_id);
create index idx_blueprint_nodes_blueprint on diagnostic_blueprint_nodes (blueprint_id);

-- enforce level ordering (domain has no parent; topic's parent is a domain; etc.)
create or replace function diag_check_node_level_ordering() returns trigger as $$
declare
  parent_level blueprint_node_level;
begin
  if new.parent_node_id is null then
    if new.level <> 'domain' then
      raise exception 'diagnostic_blueprint_nodes: only domain-level nodes may have a null parent (got level=%)', new.level;
    end if;
    return new;
  end if;

  select level into parent_level from diagnostic_blueprint_nodes where id = new.parent_node_id;

  if (new.level = 'topic' and parent_level <> 'domain')
     or (new.level = 'subtopic' and parent_level <> 'topic')
     or (new.level = 'skill' and parent_level <> 'subtopic')
     or (new.level = 'domain') then
    raise exception 'diagnostic_blueprint_nodes: invalid parent level % for child level %', parent_level, new.level;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_check_node_level_ordering
  before insert or update on diagnostic_blueprint_nodes
  for each row execute function diag_check_node_level_ordering();

alter table _fixture_questions
  add constraint fk_fixture_questions_skill_node
  foreign key (skill_node_id) references diagnostic_blueprint_nodes (id);

-- ============================================================
-- MODULE 1 / 33 — DIAGNOSTIC SESSION (resumable)
-- ============================================================

create type diagnostic_session_status as enum
  ('in_progress', 'paused', 'completed', 'abandoned', 'expired');

create table diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null references _fixture_students (id),
  blueprint_id uuid not null references diagnostic_blueprints (id),
  mode text not null default 'first_diagnostic',
  status diagnostic_session_status not null default 'in_progress',
  -- resumable working state: question queue cursor, per-node running tallies,
  -- fatigue counters — whatever the session engine needs to pick up exactly
  -- where the student left off. Never the source of truth for scoring
  -- (diagnostic_responses/diagnostic_evidence are) — purely a resume cache.
  working_state jsonb not null default '{}'::jsonb,
  baseline_session_id uuid references diagnostic_sessions (id), -- set on reassessment
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sessions_student on diagnostic_sessions (student_id);
create index idx_sessions_status on diagnostic_sessions (status);

-- ============================================================
-- MODULE 31 — question exposure (anti-memorization compatibility)
-- ============================================================

create table diagnostic_question_exposures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null references _fixture_students (id),
  question_id uuid not null references _fixture_questions (id),
  times_seen integer not null default 1 check (times_seen >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (student_id, question_id)
);

create index idx_exposures_student on diagnostic_question_exposures (student_id);

-- ============================================================
-- MODULE 6 — RESPONSE TRACKING
-- ============================================================

create table diagnostic_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null references diagnostic_sessions (id) on delete cascade,
  student_id uuid not null references _fixture_students (id),
  question_id uuid not null references _fixture_questions (id),
  skill_node_id uuid not null references diagnostic_blueprint_nodes (id),
  client_response_id text not null, -- idempotency key from the client
  answer jsonb,                     -- null allowed: represents a skip
  is_correct boolean,               -- null when answer is null (skip)
  question_difficulty question_difficulty not null,
  expected_duration_ms integer not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0),
  confidence smallint check (confidence between 1 and 5), -- Module 8, nullable: not every question asks
  hint_used boolean not null default false,
  attempt_number integer not null default 1 check (attempt_number >= 1),
  was_previously_exposed boolean not null default false, -- captured at answer time, Module 31
  created_at timestamptz not null default now(),
  unique (session_id, client_response_id)
);

create index idx_responses_session on diagnostic_responses (session_id);
create index idx_responses_student on diagnostic_responses (student_id);
create index idx_responses_skill_node on diagnostic_responses (skill_node_id);

-- ============================================================
-- MODULE 10 — DIAGNOSTIC EVIDENCE (derived, one row per response)
-- ============================================================

create type timing_classification as enum
  ('fast_correct', 'fast_wrong', 'slow_correct', 'slow_wrong', 'expected_correct', 'expected_wrong', 'skipped');

create table diagnostic_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  response_id uuid not null unique references diagnostic_responses (id) on delete cascade,
  session_id uuid not null references diagnostic_sessions (id) on delete cascade,
  student_id uuid not null references _fixture_students (id),
  skill_node_id uuid not null references diagnostic_blueprint_nodes (id),
  evidence_weight numeric(5, 4) not null check (evidence_weight >= 0 and evidence_weight <= 1),
  timing_classification timing_classification not null,
  quality_flags text[] not null default '{}', -- e.g. {hint_assisted,repeated_exposure,abnormal_timing}
  created_at timestamptz not null default now()
);

create index idx_evidence_student_skill on diagnostic_evidence (student_id, skill_node_id);
create index idx_evidence_session on diagnostic_evidence (session_id);

-- ============================================================
-- MODULE 13 / 21 — SKILL ESTIMATES (live, upserted per session)
-- ============================================================

create type capability_status as enum ('strong', 'solid', 'developing', 'needs_focus', 'insufficient_evidence');
create type diagnostic_confidence_state as enum ('high', 'moderate', 'low', 'conflicted', 'incomplete');

create table diagnostic_skill_estimates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null references diagnostic_sessions (id) on delete cascade,
  student_id uuid not null references _fixture_students (id),
  skill_node_id uuid not null references diagnostic_blueprint_nodes (id),
  point_estimate numeric(5, 4) not null check (point_estimate >= 0 and point_estimate <= 1),
  status capability_status not null,
  confidence_state diagnostic_confidence_state not null,
  evidence_count integer not null default 0,
  weighted_evidence numeric(6, 3) not null default 0,
  consistency_flag boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (session_id, skill_node_id)
);

create index idx_skill_estimates_student on diagnostic_skill_estimates (student_id);

-- ============================================================
-- MODULE 21 / 30 — SNAPSHOTS (full profile, for result + before/after)
-- ============================================================

create table diagnostic_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null references diagnostic_sessions (id) on delete cascade,
  student_id uuid not null references _fixture_students (id),
  snapshot_type text not null check (snapshot_type in ('baseline', 'current', 'reassessment')),
  profile_json jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_snapshots_student on diagnostic_snapshots (student_id);
create index idx_snapshots_session on diagnostic_snapshots (session_id);

-- ============================================================
-- MODULE 25 / 26 — RECOMMENDATIONS
-- ============================================================

create table diagnostic_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null references diagnostic_sessions (id) on delete cascade,
  student_id uuid not null references _fixture_students (id),
  skill_node_id uuid not null references diagnostic_blueprint_nodes (id),
  priority text not null check (priority in ('high', 'medium', 'low')),
  recommended_action text not null,
  evidence_confidence diagnostic_confidence_state not null,
  rationale text not null,
  created_at timestamptz not null default now()
);

create index idx_recommendations_session on diagnostic_recommendations (session_id);

commit;
