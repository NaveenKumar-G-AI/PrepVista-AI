-- =====================================================================
-- Migration: 0001_execution_results.sql
-- Capability: Execution Result Analysis
--
-- IMPORTANT: This migration assumes a host schema already has, at minimum,
-- tables approximating: users(id), submissions(id, user_id, problem_id),
-- problems(id). It references them by UUID FK. If your existing CodeForge
-- schema uses different table/column names, adjust the REFERENCES clauses
-- below before applying — do not run this blind against an unknown schema.
--
-- This migration is ADDITIVE ONLY. It does not alter or drop any existing
-- table. If your repo already has an equivalent `results` /
-- `execution_results` table, do NOT run this — extend the existing one
-- instead (see SKILL notes in the accompanying engineering report).
-- =====================================================================

create extension if not exists pgcrypto;

-- One row per evaluation attempt (an evaluation, not a submission — a
-- submission may have multiple evaluations across re-evaluations).
create table if not exists execution_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_id text not null unique,          -- external/idempotency key from the execution engine
  submission_id uuid not null references submissions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  problem_id uuid not null references problems(id) on delete cascade,

  problem_version text not null,
  test_suite_version text not null,
  checker_version text not null,
  compiler_version text,
  runtime_version text,
  execution_environment_id text not null,

  lifecycle_state text not null default 'SUBMITTED'
    check (lifecycle_state in ('SUBMITTED','QUEUED','COMPILING','RUNNING','EVALUATING','FINALIZING','COMPLETED')),
  last_sequence bigint,

  is_finalized boolean not null default false,
  is_reevaluation boolean not null default false,
  superseded_by uuid references execution_evaluations(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_execution_evaluations_submission on execution_evaluations(submission_id);
create index if not exists idx_execution_evaluations_user on execution_evaluations(user_id);
create index if not exists idx_execution_evaluations_problem on execution_evaluations(problem_id);
create index if not exists idx_execution_evaluations_lifecycle on execution_evaluations(lifecycle_state) where not is_finalized;

-- Finalized, immutable results. One row per evaluation, written exactly
-- once (enforced by app-layer + the unique evaluation_id FK, and by never
-- issuing an UPDATE against this table's verdict/evidence columns).
create table if not exists execution_results (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null unique references execution_evaluations(id) on delete cascade,
  submission_id uuid not null references submissions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,

  verdict text not null check (verdict in (
    'ACCEPTED','WRONG_ANSWER','COMPILATION_ERROR','RUNTIME_ERROR',
    'TIME_LIMIT_EXCEEDED','MEMORY_LIMIT_EXCEEDED','OUTPUT_LIMIT_EXCEEDED',
    'SYSTEM_ERROR','JUDGE_ERROR'
  )),
  origin text not null check (origin in ('STUDENT_SUBMISSION','PLATFORM_INFRASTRUCTURE','JUDGE_EVALUATOR')),

  tests_total int not null default 0,
  tests_passed int not null default 0,
  tests_failed int not null default 0,
  tests_errored int not null default 0,
  tests_skipped int not null default 0,

  score numeric,
  max_score numeric,

  runtime_ms numeric,
  peak_memory_kb numeric,

  -- Full normalized evidence bundle (see NormalizedExecutionResult), stored
  -- as JSONB for auditability/replay. Hidden-test fields (inputs/expected
  -- outputs) must never be written here by construction — the normalizer
  -- never receives them from the execution engine's public evidence feed.
  evidence jsonb not null,
  result_hash text not null,

  finalized_at timestamptz not null default now(),

  constraint execution_results_score_bounds check (
    score is null or max_score is null or score <= max_score
  )
);

create index if not exists idx_execution_results_submission on execution_results(submission_id);
create index if not exists idx_execution_results_user on execution_results(user_id);
create index if not exists idx_execution_results_verdict on execution_results(verdict);

-- Prevent silent overwrites at the DB layer: revoke UPDATE on the
-- immutable columns via a trigger rather than relying solely on app logic.
create or replace function reject_execution_result_mutation()
returns trigger as $$
begin
  if TG_OP = 'UPDATE' then
    raise exception 'execution_results rows are immutable; create a new evaluation via re-evaluation instead (evaluation_id=%)', OLD.evaluation_id;
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_execution_results_immutable on execution_results;
create trigger trg_execution_results_immutable
  before update on execution_results
  for each row execute function reject_execution_result_mutation();

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_execution_evaluations_touch on execution_evaluations;
create trigger trg_execution_evaluations_touch
  before update on execution_evaluations
  for each row execute function touch_updated_at();
