-- CodeForge AI — Understanding Check
-- Migration 0001
--
-- ASSUMPTIONS (adjust to match your actual schema before running):
--   * public.users(id uuid primary key)              — existing CodeForge users table
--   * public.submissions(id uuid primary key, ...)    — existing CodeForge submission/challenge-attempt table
--   * public.challenges(id uuid primary key, ...)     — existing CodeForge challenge table
--
-- This migration ONLY adds new tables. It never alters existing CodeForge
-- tables, per "Do not replace working architecture unnecessarily."
--
-- Naming follows snake_case + singular-domain/plural-table CodeForge
-- convention implied by the spec (`understanding_*` prefix, consistent
-- with e.g. `submissions`, `challenges`). Adjust the prefix if your actual
-- repo uses a different convention once you have real schema to match.

begin;

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- understanding_assessments
-- ---------------------------------------------------------------------------
create table if not exists public.understanding_assessments (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.users(id) on delete cascade,
  challenge_id      uuid not null references public.challenges(id) on delete cascade,
  submission_id     uuid references public.submissions(id) on delete set null,
  status            text not null default 'in_progress'
                       check (status in ('in_progress', 'completed', 'abandoned')),
  mental_model      jsonb not null,
  max_probes        integer not null default 8 check (max_probes between 1 and 30),
  procedural_score  integer check (procedural_score between 0 and 100),
  conceptual_score  integer check (conceptual_score between 0 and 100),
  overall_confidence integer check (overall_confidence between 0 and 100),
  classification    text check (classification in (
                       'STRONG_UNDERSTANDING', 'UNDERSTANDING_DEMONSTRATED', 'PARTIAL_UNDERSTANDING',
                       'UNDERSTANDING_GAP', 'INSUFFICIENT_EVIDENCE', 'UNCERTAIN'
                     )),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_understanding_assessments_student
  on public.understanding_assessments (student_id, created_at desc);
create index if not exists idx_understanding_assessments_challenge
  on public.understanding_assessments (challenge_id);
create index if not exists idx_understanding_assessments_status
  on public.understanding_assessments (status) where status = 'in_progress';

-- ---------------------------------------------------------------------------
-- understanding_dimensions  (one row per dimension per assessment — the
-- current/live snapshot; understanding_history holds point-in-time copies)
-- ---------------------------------------------------------------------------
create table if not exists public.understanding_dimensions (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null references public.understanding_assessments(id) on delete cascade,
  dimension           text not null check (dimension in (
                         'problem','algorithm','data_structure','state','control_flow','invariant',
                         'correctness','complexity','space','edge_case','debugging','adaptation','transfer'
                       )),
  score               integer not null default 0 check (score between 0 and 100),
  confidence          integer not null default 0 check (confidence between 0 and 100),
  evidence_strength   text not null default 'weak' check (evidence_strength in ('weak','moderate','strong')),
  status              text not null default 'not_assessed' check (status in (
                         'not_assessed','insufficient_evidence','developing','demonstrated','strong','gap_identified'
                       )),
  identified_gaps     jsonb not null default '[]'::jsonb,
  updated_at          timestamptz not null default now(),
  unique (assessment_id, dimension)
);

create index if not exists idx_understanding_dimensions_assessment
  on public.understanding_dimensions (assessment_id);

-- ---------------------------------------------------------------------------
-- understanding_probes
-- ---------------------------------------------------------------------------
create table if not exists public.understanding_probes (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null references public.understanding_assessments(id) on delete cascade,
  target_dimension    text not null,
  target_concept      text not null,
  probe_type          text not null check (probe_type in (
                         'explanation','causal_why','state_trace','prediction','invariant','edge_case',
                         'complexity','counterfactual','modification','debugging','alternative_approach','transfer'
                       )),
  difficulty          text not null check (difficulty in (
                         'recognition','explanation','prediction','causal_reasoning','modification','transfer'
                       )),
  purpose             text not null,
  question            text not null,
  grounding           jsonb not null default '{}'::jsonb,
  expected_reasoning  text not null,
  evaluation_criteria jsonb not null default '[]'::jsonb,
  -- Grading ground truth. Never selected by the API layer serving the
  -- client — enforce this at the application layer (toPublicProbe()) and
  -- optionally also via a column-privilege / view split in production.
  expected_evidence   text not null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_understanding_probes_assessment
  on public.understanding_probes (assessment_id, created_at);

-- ---------------------------------------------------------------------------
-- understanding_responses  (raw student responses, kept separate from
-- evidence so a response can be re-evaluated without losing the original)
-- ---------------------------------------------------------------------------
create table if not exists public.understanding_responses (
  id              uuid primary key default gen_random_uuid(),
  probe_id        uuid not null references public.understanding_probes(id) on delete cascade,
  assessment_id   uuid not null references public.understanding_assessments(id) on delete cascade,
  raw_response    text not null,
  flagged_patterns jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_understanding_responses_probe
  on public.understanding_responses (probe_id);

-- ---------------------------------------------------------------------------
-- understanding_evidence
-- ---------------------------------------------------------------------------
create table if not exists public.understanding_evidence (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null references public.understanding_assessments(id) on delete cascade,
  probe_id            uuid not null references public.understanding_probes(id) on delete cascade,
  response_id         uuid references public.understanding_responses(id) on delete set null,
  dimension           text not null,
  concept             text not null,
  probe_type          text not null,
  observed_evidence   text not null,
  result              text not null check (result in ('correct','partially_correct','incorrect','ambiguous','no_response')),
  confidence          integer not null check (confidence between 0 and 100),
  ai_provider_used    text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_understanding_evidence_assessment
  on public.understanding_evidence (assessment_id, dimension);

-- ---------------------------------------------------------------------------
-- understanding_history  (point-in-time profile snapshots for growth tracking)
-- ---------------------------------------------------------------------------
create table if not exists public.understanding_history (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null references public.understanding_assessments(id) on delete cascade,
  student_id          uuid not null references public.users(id) on delete cascade,
  challenge_id        uuid not null references public.challenges(id) on delete cascade,
  procedural_score    integer not null check (procedural_score between 0 and 100),
  conceptual_score    integer not null check (conceptual_score between 0 and 100),
  overall_confidence  integer not null check (overall_confidence between 0 and 100),
  classification      text not null,
  dimension_snapshot  jsonb not null, -- full DimensionProfile[] at time of snapshot
  created_at          timestamptz not null default now()
);

create index if not exists idx_understanding_history_student
  on public.understanding_history (student_id, created_at desc);

commit;

-- ---------------------------------------------------------------------------
-- Row-level security (Supabase). Students may only read their own rows;
-- writes go through the service role via the API layer, never directly
-- from the client.
-- ---------------------------------------------------------------------------
alter table public.understanding_assessments enable row level security;
alter table public.understanding_dimensions  enable row level security;
alter table public.understanding_probes      enable row level security;
alter table public.understanding_responses   enable row level security;
alter table public.understanding_evidence    enable row level security;
alter table public.understanding_history     enable row level security;

create policy understanding_assessments_owner_select on public.understanding_assessments
  for select using (auth.uid() = student_id);

create policy understanding_dimensions_owner_select on public.understanding_dimensions
  for select using (exists (
    select 1 from public.understanding_assessments a
    where a.id = understanding_dimensions.assessment_id and a.student_id = auth.uid()
  ));

create policy understanding_evidence_owner_select on public.understanding_evidence
  for select using (exists (
    select 1 from public.understanding_assessments a
    where a.id = understanding_evidence.assessment_id and a.student_id = auth.uid()
  ));

create policy understanding_history_owner_select on public.understanding_history
  for select using (auth.uid() = student_id);

-- Note: understanding_probes intentionally has NO client-facing select
-- policy on expected_evidence. Serve probes to the client exclusively
-- through the API layer (toPublicProbe()), which strips that column;
-- do not expose this table directly via a permissive RLS policy.
