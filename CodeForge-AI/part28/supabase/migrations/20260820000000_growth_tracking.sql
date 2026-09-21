-- CodeForge AI — Technical Growth Tracking
-- New persistence only. Reuses the existing `auth.users` table (Supabase
-- convention) for student identity and assumes an existing
-- `course_enrollments(instructor_id, student_id, role)` table for
-- instructor authorization — rename the FK/join below to your actual
-- roster table if it's named differently.
--
-- All four tables are APPEND-ONLY from the application's perspective:
-- no UPDATE or DELETE policy is granted to any client role, and no
-- INSERT policy is granted either — every write goes through the
-- service-role connection (see src/server/db.ts), never through a
-- student or instructor session. This is what "server-authoritative,
-- client can never modify growth state" means at the database level,
-- independent of whatever the application code does or doesn't check.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- growth_evidence
-- ---------------------------------------------------------------------------
create table if not exists growth_evidence (
  evidence_id         uuid primary key default gen_random_uuid(),
  student_id          uuid not null references auth.users(id),
  dimension           text not null,
  source_type         text not null,
  source_id           uuid not null,
  outcome             text not null check (outcome in ('SUCCESS','PARTIAL','FAILURE')),
  source_confidence   numeric not null check (source_confidence >= 0 and source_confidence <= 1),
  assistance_level    text not null check (assistance_level in ('NONE','LOW','MODERATE','HIGH','SOLUTION_EXPOSED')),
  difficulty          text check (difficulty in ('INTRO','EASY','MEDIUM','HARD','ADVANCED')),
  is_transfer         boolean not null default false,
  is_retention_check  boolean not null default false,
  challenge_family    text,
  role_context        text,
  occurred_at         timestamptz not null,
  recorded_at         timestamptz not null default now(),
  evidence_version    text not null,
  context             jsonb not null default '{}'::jsonb
);

create index if not exists idx_growth_evidence_student_dim_time
  on growth_evidence (student_id, dimension, occurred_at desc);
create index if not exists idx_growth_evidence_source
  on growth_evidence (source_type, source_id);

alter table growth_evidence enable row level security;
alter table growth_evidence force row level security;

create policy "students read own evidence"
  on growth_evidence for select
  using (student_id = auth.uid());

create policy "instructors read enrolled students' evidence"
  on growth_evidence for select
  using (
    exists (
      select 1 from course_enrollments ce
      where ce.student_id = growth_evidence.student_id
        and ce.instructor_id = auth.uid()
        and ce.role = 'instructor'
    )
  );

-- No insert/update/delete policy for any client role: writes only happen
-- over the service-role connection, which bypasses RLS by design.

-- ---------------------------------------------------------------------------
-- growth_snapshots (immutable, versioned)
-- ---------------------------------------------------------------------------
create table if not exists growth_snapshots (
  snapshot_id            uuid primary key default gen_random_uuid(),
  student_id             uuid not null references auth.users(id),
  role_context           text,
  dimensions             jsonb not null,
  overall_state          text not null,
  overall_confidence     text not null,
  activity_level         text not null,
  evidence_window        jsonb not null,
  generated_at           timestamptz not null default now(),
  student_model_version  text not null,
  skill_model_version    text not null,
  growth_engine_version  text not null,
  rules_version          text not null
);

create index if not exists idx_growth_snapshots_student_time
  on growth_snapshots (student_id, generated_at desc);

alter table growth_snapshots enable row level security;
alter table growth_snapshots force row level security;

create policy "students read own snapshots"
  on growth_snapshots for select
  using (student_id = auth.uid());

create policy "instructors read enrolled students' snapshots"
  on growth_snapshots for select
  using (
    exists (
      select 1 from course_enrollments ce
      where ce.student_id = growth_snapshots.student_id
        and ce.instructor_id = auth.uid()
        and ce.role = 'instructor'
    )
  );

-- ---------------------------------------------------------------------------
-- growth_milestones (immutable, deduplicated by milestone_key)
-- ---------------------------------------------------------------------------
create table if not exists growth_milestones (
  milestone_key       text primary key,
  milestone_id        text not null,
  student_id          uuid not null references auth.users(id),
  dimension           text not null,
  milestone_type      text not null,
  source_evidence_id  uuid not null references growth_evidence(evidence_id),
  occurred_at         timestamptz not null,
  rules_version       text not null
);

create index if not exists idx_growth_milestones_student
  on growth_milestones (student_id, occurred_at desc);

alter table growth_milestones enable row level security;
alter table growth_milestones force row level security;

create policy "students read own milestones"
  on growth_milestones for select
  using (student_id = auth.uid());

create policy "instructors read enrolled students' milestones"
  on growth_milestones for select
  using (
    exists (
      select 1 from course_enrollments ce
      where ce.student_id = growth_milestones.student_id
        and ce.instructor_id = auth.uid()
        and ce.role = 'instructor'
    )
  );

-- ---------------------------------------------------------------------------
-- growth_insights (immutable; assessment_safe gates assessment-mode display)
-- ---------------------------------------------------------------------------
create table if not exists growth_insights (
  insight_id          text primary key,
  student_id          uuid not null references auth.users(id),
  insight_type        text not null,
  dimension           text not null,
  claim               text not null,
  evidence_refs       jsonb not null default '[]'::jsonb,
  confidence          text not null,
  recommended_action  jsonb,
  generated_at        timestamptz not null default now(),
  rules_version       text not null,
  assessment_safe     boolean not null default true
);

create index if not exists idx_growth_insights_student_time
  on growth_insights (student_id, generated_at desc);

alter table growth_insights enable row level security;
alter table growth_insights force row level security;

create policy "students read own insights"
  on growth_insights for select
  using (student_id = auth.uid());

create policy "instructors read enrolled students' insights"
  on growth_insights for select
  using (
    exists (
      select 1 from course_enrollments ce
      where ce.student_id = growth_insights.student_id
        and ce.instructor_id = auth.uid()
        and ce.role = 'instructor'
    )
  );

-- ---------------------------------------------------------------------------
-- Immutability guard: even the tables' owner accepting writes some other
-- way later shouldn't silently allow UPDATE/DELETE on historical rows.
-- Belt-and-suspenders on top of "no policy grants it" above.
-- ---------------------------------------------------------------------------
create or replace function reject_mutation() returns trigger as $$
begin
  raise exception 'growth tracking tables are append-only: % is not permitted on %', TG_OP, TG_TABLE_NAME;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  foreach t in array array['growth_evidence','growth_snapshots','growth_milestones','growth_insights']
  loop
    execute format('drop trigger if exists no_update_%1$s on %1$s', t);
    execute format('drop trigger if exists no_delete_%1$s on %1$s', t);
    execute format('create trigger no_update_%1$s before update on %1$s for each row execute function reject_mutation()', t);
    execute format('create trigger no_delete_%1$s before delete on %1$s for each row execute function reject_mutation()', t);
  end loop;
end $$;
