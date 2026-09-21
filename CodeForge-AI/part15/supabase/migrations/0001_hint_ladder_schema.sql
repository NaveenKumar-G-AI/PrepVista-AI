-- =============================================================================
-- Hint Ladder schema
-- =============================================================================
-- Two tables, following the existing CodeForge / Feature 14 (AI Code Coach)
-- convention of foreign keys + RLS-per-row-owner:
--
--   hint_sessions  — one row per (student, problem) ladder. Holds the
--                    CURRENT state (level, status, root issue, etc.) plus
--                    an optimistic-concurrency `version` column.
--   hint_events    — append-only event log (HINT_REQUESTED, HINT_DELIVERED,
--                    HINT_EFFECTIVE, ISSUE_RESOLVED, ...). This is the
--                    audit trail / analytics feed and also carries the
--                    idempotency key (hint_session_id, request_id).
--
-- We deliberately did NOT create a third `hint_state` table — the "current
-- state" fields live directly on hint_sessions (see ENGINEERING REPORT /
-- DATABASE DESIGN: "reuse existing structures ... only introduce new
-- persistence structures when required"). A separate table would just be
-- an extra join for no benefit, since a session has exactly one current
-- state by construction.
--
-- This migration assumes the real CodeForge schema already has:
--   - auth.users (Supabase Auth)
--   - problems(id uuid primary key, ...)
--   - coaching_sessions(id uuid primary key, ...)  [Feature 14 / AI Code Coach]
-- Foreign keys to those tables are added defensively (only if the table
-- exists) so this migration also runs standalone for local/demo purposes.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- hint_sessions
-- ---------------------------------------------------------------------------

create table if not exists hint_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  problem_id uuid not null,
  coaching_session_id uuid null, -- links to Feature 14's coaching_sessions when present; never duplicates it
  mode text not null check (mode in ('PRACTICE', 'ASSESSMENT', 'INTERVIEW')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RESOLVED', 'ABANDONED')),
  current_level text not null default 'INDEPENDENT' check (current_level in
    ('INDEPENDENT', 'DIRECTION', 'CONCEPT', 'TARGETED', 'SPECIFIC', 'DETAILED', 'SOLUTION_ASSISTANCE')),
  consecutive_ineffective_count int not null default 0 check (consecutive_ineffective_count >= 0),
  root_issue jsonb null,
  execution_at_last_hint jsonb null,
  code_at_last_hint text null,
  -- Optimistic concurrency: every mutating write does
  --   UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2
  -- A zero-row result means someone else won the race; the caller retries
  -- against fresh state rather than corrupting it (see service.ts).
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One active ladder per (student, problem). If CodeForge later needs
  -- multiple concurrent attempts per problem (e.g. re-attempts after a
  -- reset), relax this to a partial unique index on status = 'ACTIVE'.
  unique (student_id, problem_id)
);

comment on table hint_sessions is 'Current state of a student''s Hint Ladder for one problem attempt. One row per (student_id, problem_id).';
comment on column hint_sessions.version is 'Optimistic concurrency token — every UPDATE must include AND version = <value just read>.';

create index if not exists idx_hint_sessions_student on hint_sessions(student_id);
create index if not exists idx_hint_sessions_problem on hint_sessions(problem_id);
create index if not exists idx_hint_sessions_status on hint_sessions(status) where status = 'ACTIVE';

do $$
begin
  if to_regclass('public.problems') is not null then
    alter table hint_sessions
      add constraint fk_hint_sessions_problem foreign key (problem_id) references problems(id) on delete cascade;
  end if;
  if to_regclass('public.coaching_sessions') is not null then
    alter table hint_sessions
      add constraint fk_hint_sessions_coaching_session foreign key (coaching_session_id) references coaching_sessions(id) on delete set null;
  end if;
exception when duplicate_object then
  null; -- constraint already exists (migration re-run) — safe to ignore
end $$;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_hint_sessions_updated_at on hint_sessions;
create trigger trg_hint_sessions_updated_at
  before update on hint_sessions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- hint_events (append-only)
-- ---------------------------------------------------------------------------

create table if not exists hint_events (
  id uuid primary key default gen_random_uuid(),
  hint_session_id uuid not null references hint_sessions(id) on delete cascade,
  student_id uuid not null, -- denormalized from hint_sessions so RLS is a simple equality check, not a subquery/join
  event_type text not null check (event_type in (
    'HINT_REQUESTED', 'HINT_GENERATED', 'HINT_DELIVERED', 'HINT_ACKNOWLEDGED',
    'HINT_ESCALATED', 'HINT_ATTEMPTED', 'HINT_EFFECTIVE', 'HINT_INEFFECTIVE',
    'ISSUE_RESOLVED', 'SOLUTION_ASSISTANCE_USED'
  )),
  assistance_level text null check (assistance_level is null or assistance_level in
    ('INDEPENDENT', 'DIRECTION', 'CONCEPT', 'TARGETED', 'SPECIFIC', 'DETAILED', 'SOLUTION_ASSISTANCE')),
  hint_type text null check (hint_type is null or hint_type in
    ('DIRECTION', 'CONCEPT', 'QUESTION', 'EXAMPLE', 'TARGETED', 'CODE_LOCATION', 'SPECIFIC', 'EXPLANATION', 'SOLUTION_ASSISTANCE')),
  payload jsonb not null default '{}'::jsonb,
  request_id text null, -- idempotency key, paired with hint_session_id below
  provider text null,
  model text null,
  latency_ms int null,
  created_at timestamptz not null default now(),
  -- Idempotency: the SAME request_id can only ever produce ONE event row
  -- per session. A concurrent duplicate insert fails this constraint and
  -- the caller falls back to reading the cached response (see
  -- repository/supabase-repository.ts getCachedResponse/cacheResponse).
  unique (hint_session_id, request_id)
);

comment on table hint_events is 'Append-only Hint Ladder event log — audit trail, idempotency, and analytics source. Never updated or deleted.';

create index if not exists idx_hint_events_session_time on hint_events(hint_session_id, created_at);
create index if not exists idx_hint_events_student on hint_events(student_id);
create index if not exists idx_hint_events_type on hint_events(event_type);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table hint_sessions enable row level security;
alter table hint_sessions force row level security; -- applies RLS even to the table owner (defense in depth for local testing)
alter table hint_events enable row level security;
alter table hint_events force row level security;

drop policy if exists hint_sessions_select_own on hint_sessions;
create policy hint_sessions_select_own on hint_sessions
  for select using (auth.uid() = student_id);

drop policy if exists hint_sessions_insert_own on hint_sessions;
create policy hint_sessions_insert_own on hint_sessions
  for insert with check (auth.uid() = student_id);

drop policy if exists hint_sessions_update_own on hint_sessions;
create policy hint_sessions_update_own on hint_sessions
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- No delete policy for students: a learning record shouldn't be
-- deletable by the student who generated it. Institutional/admin
-- deletion (e.g. GDPR erasure) should go through the service-role key
-- with its own audited path, not RLS.

drop policy if exists hint_events_select_own on hint_events;
create policy hint_events_select_own on hint_events
  for select using (auth.uid() = student_id);

drop policy if exists hint_events_insert_own on hint_events;
create policy hint_events_insert_own on hint_events
  for insert with check (auth.uid() = student_id);

-- Events are append-only for everyone, including the owner: no update/delete policy exists at all.

-- ---------------------------------------------------------------------------
-- Institutional / staff access (extension point)
-- ---------------------------------------------------------------------------
-- The real CodeForge repository's institutional-role model wasn't available
-- to inspect in this environment (see README "Known limitations"). If/when
-- an `is_staff_for(uuid, uuid)` style helper exists elsewhere in the schema,
-- add a companion policy here, e.g.:
--
--   create policy hint_sessions_select_staff on hint_sessions
--     for select using (is_staff_for(auth.uid(), problem_id));
--
-- Do NOT grant staff broad table access via a role bypassing RLS — keep
-- staff access scoped through a policy like the above so it stays subject
-- to the same auditability as everything else in this table.
