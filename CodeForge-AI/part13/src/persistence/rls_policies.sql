-- =====================================================================
-- RLS policies for execution_evaluations / execution_results
--
-- ASSUMPTIONS (adjust to match your actual auth/role model before applying):
--   - auth.uid() returns the authenticated user's id (Supabase auth default).
--   - A `user_roles(user_id, role)` table or a `role` claim in the JWT
--     identifies INSTRUCTOR / INTERVIEWER / ADMINISTRATOR / INTERNAL_EVALUATOR.
--   - A `cohort_memberships(user_id, cohort_id)` and
--     `submissions.cohort_id` (or equivalent) exists for instructor scoping.
--     If your schema differs, adjust the instructor policy's subquery.
--
-- These policies implement the "Role-Based Information" + "RLS and
-- Authorization" requirements: students see only their own results,
-- instructors see only their authorized cohort's results, internal
-- evaluators/admins see everything needed for operations, and nobody can
-- write a result through the client — only the service role (running the
-- deterministic finalize pipeline) can insert into execution_results.
-- =====================================================================

alter table execution_evaluations enable row level security;
alter table execution_results enable row level security;

-- Helper: is the caller staff (instructor/interviewer/admin/internal evaluator)?
create or replace function is_staff_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = any(required_roles)
  );
$$;

-- ---------------------------------------------------------------------
-- execution_evaluations
-- ---------------------------------------------------------------------

drop policy if exists execution_evaluations_select_own on execution_evaluations;
create policy execution_evaluations_select_own
  on execution_evaluations
  for select
  using (user_id = auth.uid());

drop policy if exists execution_evaluations_select_staff on execution_evaluations;
create policy execution_evaluations_select_staff
  on execution_evaluations
  for select
  using (
    is_staff_role(array['INSTRUCTOR','INTERVIEWER','ADMINISTRATOR','INTERNAL_EVALUATOR'])
    and exists (
      -- Instructors/interviewers are further scoped to authorized cohorts;
      -- admins/internal evaluators bypass cohort scoping.
      select 1 from user_roles ur
      where ur.user_id = auth.uid()
        and (
          ur.role in ('ADMINISTRATOR','INTERNAL_EVALUATOR')
          or exists (
            select 1 from cohort_memberships cm
            join submissions s on s.id = execution_evaluations.submission_id
            where cm.user_id = auth.uid()
              and cm.cohort_id = s.cohort_id
          )
        )
    )
  );

-- No client-side INSERT/UPDATE/DELETE policies are defined for students or
-- staff — writes happen exclusively through the service role executing the
-- deterministic pipeline (bypasses RLS via the Supabase service key, which
-- must only ever be used server-side, never shipped to any client).

-- ---------------------------------------------------------------------
-- execution_results
-- ---------------------------------------------------------------------

drop policy if exists execution_results_select_own on execution_results;
create policy execution_results_select_own
  on execution_results
  for select
  using (user_id = auth.uid());

drop policy if exists execution_results_select_staff on execution_results;
create policy execution_results_select_staff
  on execution_results
  for select
  using (
    is_staff_role(array['INSTRUCTOR','INTERVIEWER','ADMINISTRATOR','INTERNAL_EVALUATOR'])
    and exists (
      select 1 from user_roles ur
      where ur.user_id = auth.uid()
        and (
          ur.role in ('ADMINISTRATOR','INTERNAL_EVALUATOR')
          or exists (
            select 1 from cohort_memberships cm
            join submissions s on s.id = execution_results.submission_id
            where cm.user_id = auth.uid()
              and cm.cohort_id = s.cohort_id
          )
        )
    )
  );

-- Explicitly no INSERT/UPDATE/DELETE policy => denied by default for all
-- non-service-role callers, satisfying "students cannot trigger result
-- manipulation" and "results are immutable from the client's perspective".
