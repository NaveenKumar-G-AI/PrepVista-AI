# CodeForge AI — Technical Growth Tracking

## What this actually is

No existing CodeForge repository was present in the environment this was built in — only the spec document. So this isn't an integration into your real system; it's a standalone, fully working implementation of the Technical Growth Tracking capability, built against a minimal foundation (users/skills/evidence/skill-signals) that stands in for your real Skill Signal Engine, Mastery system, auth, etc. Every foundation piece is clearly marked in the code. **When you integrate this into the real repo, delete the foundation stand-ins and point the growth engine at your actual tables — the growth-tracking logic itself doesn't change.**

Everything described as working below was actually run — engine tests executed, a real local Postgres was stood up and the schema + RLS policies applied to it, RLS was verified from a genuinely unprivileged database role, the API server was started and hit with real HTTP requests, and the two-student demo ran through the real pipeline. Nothing here is a mock, a hardcoded dashboard number, or a static chart.

## Architecture

```
server/
  src/engine/       pure calculation logic — no DB, no framework, portable.
                     comparability, confidence, growth, velocity/acceleration/
                     plateau, regression/recovery, milestones. Start here.
  src/events/        the pipeline: skill signal -> snapshot -> measurement ->
                      milestones -> trend/regression detection. Idempotent.
  src/db/            thin pg.Pool wrapper (no ORM — see "Why no Prisma" below)
  src/ai/            narrative generation: structured facts -> text.
                      Deterministic template by default; Groq/Gemini hooks
                      included but inert until you add a key.
  src/api/           Express routes + auth/authorization middleware
  scripts/           seedDemo.ts (the required two-student demonstration)
                     testRls.ts (proves RLS from a non-owner DB role)
  db/                schema.sql, rls_policies.sql — the real DDL

web/
  src/               React + Vite dashboard. Student switcher, overall growth,
                      per-skill trace charts (confidence encoded in line
                      weight/style), milestones, timeline.
```

### Why no Prisma

The build environment's network is allow-listed to package registries only. Prisma's client needs to download a query-engine binary from `binaries.prisma.sh`, which isn't reachable there, so `prisma generate` / `db push` failed outright. Rather than ship a schema that only *might* work, the data layer uses raw SQL migrations + the `pg` driver — which I could actually run, seed, and verify end to end. This also happens to be a common pattern for Supabase projects specifically (SQL-first migrations via the Supabase CLI). If you'd rather have Prisma once you're deployed somewhere with normal internet access, `db/schema.sql` translates to a `schema.prisma` directly — the shapes are simple 1:1 tables.

## Setup

### 1. Database

**Real Supabase (recommended for actual use):**
1. Create a project, grab the connection string from Project Settings → Database.
2. `psql "$DATABASE_URL" -f server/db/schema.sql`
3. `psql "$DATABASE_URL" -f server/db/rls_policies.sql` — **but first delete the `create schema auth` / `create function auth.uid()` block at the top of that file**. Supabase already provides `auth.uid()`; creating a second one will shadow the real one and silently break RLS for every other table in your project. Everything below that block (the policies themselves, the `authenticated`/`service_role` grants) is meant to run as-is.

**Local Postgres (what this was built and tested against):**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER codeforge WITH PASSWORD 'devpassword' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE codeforge_growth OWNER codeforge;"
sudo -u postgres psql -d codeforge_growth -c "ALTER USER codeforge CREATEROLE;"  # needed for the auth-role setup in rls_policies.sql
cd server
psql "postgresql://codeforge:devpassword@localhost:5432/codeforge_growth" -f db/schema.sql
psql "postgresql://codeforge:devpassword@localhost:5432/codeforge_growth" -f db/rls_policies.sql
```

### 2. Server

```bash
cd server
cp .env.example .env     # fill in DATABASE_URL at minimum; everything else can stay blank
npm install
npm run seed:demo        # optional but recommended — seeds the two-student demo through the real pipeline
npm test                 # 27 engine unit tests
npm run test:rls         # 7 live access-control checks (needs seed:demo run first)
npm run dev               # starts the API on :4000
```

### 3. Frontend

```bash
cd web
npm install
npm run dev               # :5173, proxies /api to :4000
```

Open the dashboard, it'll show a student switcher populated from the seeded demo users (dev-only convenience endpoint, gated off when `NODE_ENV=production` — see `src/api/app.ts`).

## Environment variables

All real secrets are left blank in `server/.env.example`, as requested — fill them in when you deploy.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (Supabase or otherwise) |
| `DIRECT_URL` | If your Supabase plan needs it | Non-pooled connection for migrations |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Only if this backend talks to Supabase Auth/Storage directly | Not used by the code as shipped |
| `PORT` | No | Defaults to 4000 |
| `AI_PROVIDER` | No | `none` (default, no network calls), `groq`, or `gemini` |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | Only if `AI_PROVIDER` is set | Untested against a live endpoint — this sandbox can't reach either host. Code is complete and reviewed; the template fallback is what actually ran here. |

## Before this touches real students

- **Replace the auth stand-in.** `server/src/api/auth.ts` trusts `x-user-id` / `x-user-role` headers as-is — that's a development convenience, not authentication. Wire it to real session/JWT verification before deploying.
- **Delete the `/api/dev/demo-users` route** or confirm `NODE_ENV=production` is set wherever this runs for real — it's already gated, but double-check.
- **Swap the foundation tables** for your real users/skills/evidence/Skill-Signal tables, per the comments at the top of `db/schema.sql`.

## Definition of done

Status key: **IMPLEMENTED** (built and verified by actually running it) · **PARTIALLY IMPLEMENTED** (real code exists, not fully verified or not full-featured) · **NOT IMPLEMENTED**.

```
Architecture discovered:      NONE — no existing repository was present in this
                               environment. Built as a standalone system on a
                               documented foundation instead (see top of this file).

Files created:                ~40 files across server/ and web/ — see the tree above.
Files modified:                N/A (nothing existed to modify)

Database changes:             IMPLEMENTED. 13 tables, real constraints/indexes,
                               applied to and verified against a live local
                               Postgres 16 instance.

APIs:                          IMPLEMENTED (student-facing). growth overview,
                               timeline, skill list, skill detail, snapshots,
                               milestones, evidence, report. All exercised with
                               real HTTP requests against real data.
                               PARTIALLY IMPLEMENTED (institutional). One cohort
                               overview endpoint (distribution buckets, per-skill
                               averages, improving/stable/attention counts) — built
                               and authorized correctly, not load-tested. Program-
                               period comparison and role-skill trend views from the
                               spec are not built.

Frontend changes:             IMPLEMENTED (student dashboard). Overview, per-skill
                               trace charts, milestones, timeline. Type-checks clean,
                               production build succeeds.
                               NOT IMPLEMENTED: institutional/TPO dashboard UI (the
                               API exists; no screen consumes it yet).

Growth engine:                IMPLEMENTED. Comparability gating, confidence scoring,
                               growth calculation, velocity (least-squares), 
                               acceleration, plateau, regression + typed recovery,
                               milestones. 27/27 unit tests, including adversarial
                               cases (single bad submission, repeated-family gaming,
                               noise-vs-acceleration, failed-attempt gaming).

Snapshot system:               IMPLEMENTED. Immutable, append-only, versioned by
                               calculation_version.

Growth events:                 IMPLEMENTED. Idempotent via advisory lock + unique
                               idempotency_key; verified safe to retry.

Milestones:                    IMPLEMENTED. All 7 types from the spec, each gated
                               on genuine success (not mere attempts) and backed by
                               real evidence IDs.

Trend detection:                IMPLEMENTED. Velocity, acceleration, plateau.

Regression detection:          IMPLEMENTED, including typed regressions and
                               recovery. Verified live in the two-student demo
                               (Student B's debugging: real dip, real recovery).

Evidence system:               IMPLEMENTED for student self-inspection via the
                               evidence endpoint. Invalidated-evidence handling
                               exists as a column + filter; the recalculation-on-
                               invalidation workflow described in the spec is NOT
                               implemented — invalidating evidence today does not
                               yet trigger automatic recomputation of downstream
                               snapshots/measurements.

AI integration:                 PARTIALLY IMPLEMENTED. Structured-facts-only
                               contract, deterministic template narrative
                               (this is what actually ran), Groq/Gemini adapters
                               written and reviewed but NOT exercised against a
                               live endpoint (unreachable from this sandbox).
                               Caching implemented (1-hour reuse window).

Security:                      PARTIALLY IMPLEMENTED. Server-side authorization
                               mirrors RLS (defense in depth), input validation via
                               zod on route params, server-derived-only writes.
                               NOT covered: rate limiting, replay-attack tests
                               beyond idempotency, timestamp-manipulation tests.

RLS:                            IMPLEMENTED and verified live: 12 policies, tested
                               from a genuinely non-owner Postgres role (not the
                               table owner, which Postgres exempts from RLS by
                               default). 7/7 access checks passed: own-data read,
                               cross-student read blocked, anonymous blocked,
                               in-cohort TPO read, out-of-cohort TPO blocked,
                               direct write blocked.

Observability:                  NOT IMPLEMENTED. No structured logging, correlation
                               IDs, or metrics beyond console.error on API failures.

Tests:                          IMPLEMENTED (engine unit tests, 27/27, including
                               adversarial cases). NOT IMPLEMENTED: a broader
                               integration-test harness beyond the seed/RLS scripts
                               (which do exercise the real pipeline + real DB, but
                               aren't wrapped in a test runner with assertions).

Security tests:                 PARTIALLY IMPLEMENTED — see RLS above, which is the
                               core of what the spec's security-testing section
                               asks for. Replay/timestamp-manipulation attempts are
                               not separately scripted.

Privacy tests:                  IMPLEMENTED as part of the RLS suite (cross-student
                               and cross-cohort denial, specifically).

Concurrency tests:              PARTIALLY IMPLEMENTED. The idempotency mechanism
                               (advisory lock + unique constraint) is designed for
                               concurrent safety and unit-testable in isolation, but
                               no test actually fires concurrent requests at the
                               pipeline to prove it under real contention.

End-to-end tests:                IMPLEMENTED as the two-student demo, run for real,
                               output inspected and (twice) used to catch and fix
                               real bugs. Not wrapped in automated assertions — it's
                               a script you run and read, not a CI-style pass/fail.

Environment variables:          Documented above; all real secrets blank in
                               server/.env.example.

Run commands:                   See Setup above.

Known limitations:
  - No existing repository to integrate with — see top of this file.
  - Prisma unusable in this sandbox; raw SQL used instead (see "Why no Prisma").
  - AI provider calls are code-complete but untested live.
  - Institutional/TPO dashboard UI, backfill tooling, and observability are not built.
  - Evidence invalidation doesn't yet trigger downstream recalculation.
  - Auth is a development stand-in, not real session verification.
```
