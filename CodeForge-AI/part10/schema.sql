-- ============================================================
-- CodeForge AI — Engineering Simulator
-- Core schema for the project-based engineering simulation layer.
-- Written for PostgreSQL / Supabase conventions (auth.uid(), RLS).
--
-- INTEGRATION NOTE: this assumes an existing `profiles` table keyed by
-- auth.uid() with at least `role` and `college_id` columns, consistent
-- with the rest of PrepVista/CodeForge. If your real table/column names
-- differ, adjust is_authorized_tpo_viewer() below — that's the one
-- place this schema guesses at your existing auth shape.
--
-- Written carefully but NOT executed against a live database — run this
-- in a staging project and read it end to end before trusting it in
-- production. See ../TRUTH_REPORT.md.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Rubrics (Phase 34)
-- ------------------------------------------------------------
create table if not exists project_rubrics (
  id text primary key,
  name text not null,
  categories jsonb not null,              -- [{key,label,weight}] — weights sum to 100 (app-layer enforced, see src/engine/rubricEngine.js)
  applicable_project_types text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Engineering projects — definitions, not attempts (Phase 40)
-- ------------------------------------------------------------
create table if not exists engineering_projects (
  id text primary key,
  slug text not null unique,
  title text not null,
  role text not null,
  project_type text not null,
  difficulty text not null check (difficulty in ('foundation','intermediate','advanced','production_simulation','engineering_challenge')),
  status text not null default 'draft' check (status in ('draft','quality_review','published','retired')),
  time_estimate_minutes int not null,
  skills text[] not null default '{}',
  requirements jsonb not null,            -- business_goal, functional/non-functional, assumptions, ambiguities, constraints, edge_cases
  security_requirements jsonb not null default '[]',
  performance_requirements jsonb not null default '[]',
  documentation_requirements jsonb not null default '[]',
  supported_languages text[] not null default '{}',
  starter_repository_ref text,
  rubric_id text not null references project_rubrics(id),
  pass_threshold numeric not null default 70,
  created_by uuid,                        -- references your existing users/profiles table
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_engineering_projects_role_difficulty
  on engineering_projects(role, difficulty) where status = 'published';

-- ------------------------------------------------------------
-- Acceptance criteria — requirement -> test traceability (Phase 16)
-- ------------------------------------------------------------
create table if not exists project_acceptance_criteria (
  id text primary key,
  project_id text not null references engineering_projects(id) on delete cascade,
  requirement_ref text not null,
  description text not null,
  test_type text not null check (test_type in ('visible','hidden')),
  expected_behavior text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pac_project on project_acceptance_criteria(project_id);

-- ------------------------------------------------------------
-- Sessions — one student's attempt at one project
-- ------------------------------------------------------------
create table if not exists project_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references engineering_projects(id),
  student_id uuid not null,               -- references your existing users/profiles table
  status text not null default 'in_progress' check (status in ('in_progress','submitted','evaluated','revision_requested','completed','abandoned')),
  assistance_level text not null default 'no_assistance' check (assistance_level in ('no_assistance','concept_help','error_explanation','directional_hint','architecture_guidance','strong_guidance')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_sessions_student on project_sessions(student_id);
create unique index if not exists idx_sessions_one_active_per_project
  on project_sessions(project_id, student_id) where status = 'in_progress';

-- ------------------------------------------------------------
-- Submissions + immutable snapshots (Phase 36, 63, 64)
-- ------------------------------------------------------------
create table if not exists project_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references project_sessions(id) on delete cascade,
  attempt_number int not null,
  submitted_at timestamptz not null default now(),
  is_current boolean not null default true,
  unique (session_id, attempt_number)
);

create table if not exists submission_snapshots (
  submission_id uuid primary key references project_submissions(id) on delete cascade,
  code_snapshot jsonb not null,           -- {path: content}, or a repo/commit ref if you snapshot via git
  tests_snapshot jsonb,
  config_snapshot jsonb,
  docs_snapshot jsonb,
  architecture_snapshot jsonb,
  decisions_snapshot jsonb,
  created_at timestamptz not null default now()
);
-- No update/delete policy is granted on submissions or snapshots below —
-- with RLS enabled and no policy for a command, that command is denied.
-- That's what makes these append-only without a trigger.

-- ------------------------------------------------------------
-- Evaluations — idempotent, one per submission (Phase 35, 64)
-- ------------------------------------------------------------
create table if not exists project_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references project_submissions(id) on delete cascade,
  rubric_id text not null references project_rubrics(id),
  category_scores jsonb not null,         -- the `breakdown` array from rubricEngine.scoreSubmission
  total_score numeric not null,
  passed boolean not null,
  ai_available boolean not null default false,
  fully_assessed boolean not null default false,
  evaluated_at timestamptz not null default now()
);

create table if not exists evaluation_feedback (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references project_evaluations(id) on delete cascade,
  category text not null,
  observation text not null,
  impact text,
  recommendation text,
  evidence_ref text,                      -- e.g. a failing test id or file path — never invented (Phase 21)
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Revisions (Phase 37, 38)
-- ------------------------------------------------------------
create table if not exists project_revisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references project_sessions(id) on delete cascade,
  from_submission_id uuid not null references project_submissions(id),
  to_submission_id uuid not null references project_submissions(id),
  addressed_feedback_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Engineering decision log (Phase 10)
-- ------------------------------------------------------------
create table if not exists project_decisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references project_sessions(id) on delete cascade,
  decision text not null,
  reason text not null,
  alternative text,
  why_rejected text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Evidence — feeds your EXISTING mastery/readiness engine. This table
-- does not compute mastery; it only emits signal (Phase 32/33/35).
-- ------------------------------------------------------------
create table if not exists project_evidence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references project_sessions(id) on delete cascade,
  student_id uuid not null,
  skill_tag text not null,
  evidence_type text not null,            -- e.g. 'project_rubric_category' | 'project_completion'
  strength_signal numeric,                -- nullable: some evidence is presence-only, not a score
  source text not null default 'project',
  source_ref uuid not null,               -- submission id
  consumed_by_mastery_engine boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_evidence_unconsumed
  on project_evidence(consumed_by_mastery_engine) where consumed_by_mastery_engine = false;
create index if not exists idx_evidence_student_skill on project_evidence(student_id, skill_tag);

-- ------------------------------------------------------------
-- Assistance tracking (Phase 48-50)
-- ------------------------------------------------------------
create table if not exists assistance_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references project_sessions(id) on delete cascade,
  assistance_level text not null,
  question text,
  ai_response_ref text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

-- INTEGRATION NOTE: replace this with your existing TPO/role-check
-- helper if PrepVista already has one — don't run both side by side.
create or replace function is_authorized_tpo_viewer(target_student_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from profiles tpo
    join profiles student on student.college_id = tpo.college_id
    where tpo.id = auth.uid()
      and tpo.role = 'tpo'
      and student.id = target_student_id
  );
$$;

alter table engineering_projects enable row level security;
create policy "published projects readable" on engineering_projects
  for select using (status = 'published' or created_by = auth.uid());

alter table project_acceptance_criteria enable row level security;
create policy "criteria of published projects readable" on project_acceptance_criteria
  for select using (
    exists (select 1 from engineering_projects p where p.id = project_id and p.status = 'published')
  );

alter table project_sessions enable row level security;
create policy "students read own sessions" on project_sessions
  for select using (student_id = auth.uid() or is_authorized_tpo_viewer(student_id));
create policy "students create own sessions" on project_sessions
  for insert with check (student_id = auth.uid());
create policy "students update own sessions" on project_sessions
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());

alter table project_submissions enable row level security;
create policy "own submissions readable" on project_submissions
  for select using (
    exists (select 1 from project_sessions s where s.id = session_id and (s.student_id = auth.uid() or is_authorized_tpo_viewer(s.student_id)))
  );
create policy "own submissions insertable" on project_submissions
  for insert with check (
    exists (select 1 from project_sessions s where s.id = session_id and s.student_id = auth.uid())
  );
-- Deliberately no update/delete policy — submissions are immutable once written.

alter table submission_snapshots enable row level security;
create policy "own snapshots readable" on submission_snapshots
  for select using (
    exists (
      select 1 from project_submissions sub join project_sessions s on s.id = sub.session_id
      where sub.id = submission_id and (s.student_id = auth.uid() or is_authorized_tpo_viewer(s.student_id))
    )
  );
-- Deliberately no update/delete policy — snapshots are immutable once written.

alter table project_evaluations enable row level security;
create policy "own evaluations readable" on project_evaluations
  for select using (
    exists (
      select 1 from project_submissions sub join project_sessions s on s.id = sub.session_id
      where sub.id = submission_id and (s.student_id = auth.uid() or is_authorized_tpo_viewer(s.student_id))
    )
  );

alter table evaluation_feedback enable row level security;
create policy "own feedback readable" on evaluation_feedback
  for select using (
    exists (
      select 1 from project_evaluations e
      join project_submissions sub on sub.id = e.submission_id
      join project_sessions s on s.id = sub.session_id
      where e.id = evaluation_id and (s.student_id = auth.uid() or is_authorized_tpo_viewer(s.student_id))
    )
  );

alter table project_revisions enable row level security;
create policy "own revisions readable" on project_revisions
  for select using (
    exists (select 1 from project_sessions s where s.id = session_id and (s.student_id = auth.uid() or is_authorized_tpo_viewer(s.student_id)))
  );

alter table project_decisions enable row level security;
create policy "own decisions readable" on project_decisions
  for select using (
    exists (select 1 from project_sessions s where s.id = session_id and (s.student_id = auth.uid() or is_authorized_tpo_viewer(s.student_id)))
  );
create policy "own decisions insertable" on project_decisions
  for insert with check (
    exists (select 1 from project_sessions s where s.id = session_id and s.student_id = auth.uid())
  );

alter table project_evidence enable row level security;
create policy "own evidence readable" on project_evidence
  for select using (student_id = auth.uid() or is_authorized_tpo_viewer(student_id));

alter table assistance_events enable row level security;
create policy "own assistance events readable" on assistance_events
  for select using (
    exists (select 1 from project_sessions s where s.id = session_id and (s.student_id = auth.uid() or is_authorized_tpo_viewer(s.student_id)))
  );
create policy "own assistance events insertable" on assistance_events
  for insert with check (
    exists (select 1 from project_sessions s where s.id = session_id and s.student_id = auth.uid())
  );
