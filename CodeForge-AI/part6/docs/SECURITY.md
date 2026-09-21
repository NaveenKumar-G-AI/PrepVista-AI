# Security

## The honest version of what's here

There is no real identity provider in this environment (no Supabase
project, no OAuth app to register). `POST /auth/dev-login` is a clearly
labeled dev-only stand-in — it issues an HMAC-signed token
(`src/api/auth.ts`) for a `studentId` it's told about.

**What matters is what happens after login**, and that part is real:
**every** protected route derives `studentId` exclusively from
`req.auth.studentId` — the verified, signed token payload — and *never* from
`req.params`, `req.query`, or `req.body`. Grep the routes:

```
grep -rn "req.auth!.studentId" src/api/routes/
grep -rn "req.params" src/api/routes/          # only ever used for resource ids, never identity
```

This is the actual security property the brief asks for (Phase 42/50:
"never trust student_id/role_id/roadmap_id from the client without
authorization verification"), demonstrated for real rather than asserted.
`tests`/`demoRun.ts` STEP 10 exercises this live: a second, real student
attempts to read the first student's roadmap-skill explanation through the
real HTTP API and gets a `404` (not a data leak, not a stack trace).

## Ownership checks, concretely

- `GET /roadmap`, `/roadmap/versions`, `/roadmap/daily-plan`, etc. — scoped
  by `studentId` in the SQL `WHERE` clause; there is no route that accepts a
  student id as a parameter at all for these.
- `GET /roadmap/explain/:roadmapSkillId` — takes a resource id, and joins
  from `roadmap_skills` up through `roadmap_milestones -> roadmap_versions
  -> roadmaps` to confirm `roadmaps.student_id = req.auth.studentId` before
  returning anything.
- `/management/*` — gated by `requireRole('TPO_ADMIN')`, and even then only
  ever returns cohort-level aggregates (`cohortSummary()` in
  `roadmapRepo.ts`), never a per-student row.

## What a real deployment would change

1. Replace `/auth/dev-login` with real Supabase Auth / OAuth, issuing a
   standard JWT. `requireAuth`'s job (verify signature, extract identity,
   attach to `req`) stays essentially the same shape.
2. Port SQLite → Postgres/Supabase and add RLS policies that mirror the
   application-level checks above, e.g.:

```sql
-- Reference policy, not executed in this SQLite-backed build:
create policy "students read own roadmaps"
  on roadmaps for select
  using (student_id = auth.uid());

create policy "students read own roadmap_versions"
  on roadmap_versions for select
  using (roadmap_id in (select id from roadmaps where student_id = auth.uid()));
```
   This is defense-in-depth, not a replacement for the application-level
   checks — both should hold in production.
3. Rotate `AUTH_SECRET` out of its dev default (`src/api/auth.ts`) into a
   real secret manager.

## Input validation

Every mutating route validates its body with `zod` (`src/api/routes/*.ts`)
before touching the database — malformed input gets a `422` with field-level
detail, not a raw SQL error or a silently-accepted bad row.

## What's explicitly NOT built (by design, per the brief's own boundary)

No recruiter access, no hiring decisions, no placement-drive management, no
cross-student data exposure anywhere in the API surface (Phase 42).
