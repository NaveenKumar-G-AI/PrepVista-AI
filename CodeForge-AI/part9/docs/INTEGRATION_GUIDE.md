# Integration Guide

This engine was built standalone because no CodeForge/PrepVista repository
existed to inspect. These are the seams to rewire — everything else should
drop in as-is.

## 1. Point the two stub tables at your real tables

`db/migrations/000_integration_stubs.sql` creates minimal `students` and
`problems` tables so the schema is runnable in isolation. **Do not run that
migration against your real database.** Instead:

- In every other migration file, change `references students(id)` to
  reference your real users/students table.
- Change every `references problems(id)` to reference your real
  challenge/problem table.
- If your primary keys aren't `uuid`, adjust the FK column types to match.

## 2. Auth

`src/api/middleware/auth.ts` is a labeled stub — it reads an `x-student-id`
header with no verification. Replace it with real verification of your
platform's session/JWT (Supabase Auth, or whatever you use), and set
`req.studentId` from the verified token, never from a client-supplied header.

RLS policies in `005_rls_policies.sql` are written for Supabase's
`auth.uid()`/`auth.role()`, which Supabase provides natively — remove
`db/local_dev_shim.sql` from your deployment entirely (it exists only so
this repo's own tests can run against plain Postgres in a sandbox with no
Supabase available). If you're not on Supabase, replace `auth.uid()`/
`auth.role()` in the policies with your platform's equivalent.

## 3. Environment

```
DATABASE_URL=postgres://...
GROQ_API_KEY=...
GEMINI_API_KEY=...
```

See `.env.example`. AI keys are optional — `AIProviderRouter` falls back to
deterministic text if they're absent or the calls fail.

## 4. Mount the routes on your real app

`src/api/server.ts` runs a standalone Express server for local dev/testing.
In your real app, `createApp()` in that file is exported — either mount its
three routers (`/skills`, `/practice`, `/recommendations`) on your existing
Express app, or port the route handlers to your framework (Next.js API
routes, etc.) — the logic lives in `services/`, not in the route files, so
this should be a thin rewrite.

## 5. The one required upstream change: call `PracticeService` on submission

Find where your execution engine currently finalizes a graded submission
result. Call `PracticeService.completePractice()` there with the real
skill/problem/difficulty/pass-fail/hints data. This is the single point
where a real submission becomes evidence — everything downstream (mastery
recalculation, gap diagnosis, retention scheduling) is already wired to
fire from that one call.

## 6. Populate the skill graph and role requirements

`skill_nodes`, `skill_relationships`, `roles`, and `role_skill_requirements`
start empty. Seed your actual taxonomy (PHASE 3–5 of the original spec) —
`scripts/smoke_test.ts` shows the insert shape for a tiny example.

## 7. Optional but recommended: `failure_reason` on evidence

See `docs/CODEFORGE_EVIDENCE_MODEL.md`. Gap diagnosis is more specific with
this signal, degrades gracefully (to `NEEDS_REVIEW`) without it.

## 8. Run the migrations and the RLS check against your real database

```bash
export DATABASE_URL=postgres://...
npm run db:migrate                        # applies 000–005 in order
bash scripts/rls_isolation_test.sh         # only works with the local shim — see note below
```

The RLS test script as written depends on `db/local_dev_shim.sql` and a
locally-created `app_user` role, so it's for sandbox/CI use against a throwaway
database, not your production Supabase project. On Supabase, validate RLS
instead by testing with two real user JWTs through Supabase's client
libraries, or by using `supabase test db` if you adopt their local dev CLI.

## Everything else

Should not need changes: `src/domain/`, `src/ai/`, the mastery/evidence/
recommendation tables, and `src/repositories/` are all written against the
column names and types actually created by migrations 001–005, which you're
keeping as-is.
