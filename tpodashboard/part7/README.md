# PrepVista Part 7 — Training + Assessment + Intervention + Readiness Engine

A real, running, tested implementation of one slice of the Part 7 spec: the
**core engine** — data model, calculation services, and an API — for turning
assessment/training evidence into readiness scores, skill gaps, and
evidence-backed intervention assignments, with effectiveness measurement
tying it back to placement outcomes.

It is not the full 95-section spec. See `docs/TRUTH_TABLE.md` for exactly
what's real, what's stubbed, and what's not attempted at all — written the
way the spec itself asks for (§95.AF), because the spec is explicit that
nothing should be presented as live when it isn't.

## Why this exists / how it was built

This was built with no access to your actual Parts 1–6 repository (none was
attached to the session), so it can't be a drop-in merge. Instead it's a
**complete, working reference implementation** of Part 7's core: real Postgres
schema, real migrations applied to a real database, services with actual
(non-random) calculation logic, and 24 tests that run against that real
database — not mocks. Two genuine bugs were caught this way during
development (see `docs/HOSTILE_REVIEW.md`), which is the whole reason it was
worth doing this instead of just describing the design.

## Stack

TypeScript, Express 5, Drizzle ORM + PostgreSQL, Zod, Vitest.

Originally scaffolded with Prisma, but Prisma's CLI/client need to download
engine binaries from `binaries.prisma.sh` at generate/runtime, which wasn't
reachable from this sandbox's network allowlist. Drizzle was substituted
because it's pure TypeScript/JS over the standard `pg` driver with no native
binary download — if your real environment doesn't have that restriction,
Prisma is a reasonable alternative and the schema translates directly (see
`src/db/schema/*.ts`, which is deliberately close to a Prisma-style model
definition per table).

## Running it

```bash
npm install
cp .env.example .env         # set DATABASE_URL to a real Postgres
npm run db:migrate           # applies drizzle/*.sql, tracked + idempotent
npm run seed                 # creates a small, clearly-fake demo institution
npm run dev                  # http://localhost:3000
npm test                     # 24 tests, run against a real Postgres
npm run typecheck
npm run build && npm start
```

The seed script prints actor ids and a ready-to-paste `curl` command.

## Demo auth

There's no real auth wired up — every request needs an `x-actor-id: <user_account.id>`
header, resolved against the `user_account` stub table
(`src/api/middleware/auth.ts`). This is intentionally the thinnest possible
placeholder: replace `attachActor` with your real session/JWT middleware and
nothing else changes, because every route and service downstream only reads
`req.actor`, which just needs to keep matching the `Actor` shape in
`src/lib/permissions.ts`.

## What to do with this when integrating

1. **Delete `src/db/schema/stubs.ts`.** It exists only so this schema is
   runnable standalone. Point the plain `studentId` / `skillId` / etc.
   columns throughout `src/db/schema/*.ts` at your real Part 1/4/5/6 tables.
   Part 7's own tables never declare a Drizzle relation into the stubs —
   only a plain string column — specifically so this swap doesn't require
   touching Part 7's own table definitions.
2. **Replace `attachActor`** with real auth (see above).
3. **Replace the `EventBus`'s transport.** Right now `eventBus.publish()`
   writes a durable row to `student_success_event` and calls in-process
   subscribers — see `src/lib/eventBus.ts`. The event *contract* (the type
   names and payload shapes, matching spec §63) is what should survive;
   the transport should become whatever Part 1's real event system is.
4. **Wire the taxonomy.** `taxonomy_term` seeds nothing by default —
   training/assessment categories and intervention types resolve through it
   (spec §10/§19/§36: never hard-coded), so an institution needs at least a
   few rows before creating programs/assessments.
5. Read `docs/INTEGRATION_NOTES.md` for the rest (performance follow-ups,
   what a production-scale readiness recalculation should look like, etc).

## Directory layout

```
src/db/schema/        Drizzle schema — stubs.ts vs. everything else (see above)
src/config/            Transparent, tunable thresholds (spec §34)
src/lib/                id generation, audit logging, event bus, RBAC, errors
src/services/          The real logic — readiness, skill gaps, recommendation,
                        assessment engine, training ops, interventions,
                        effectiveness, cross-student overview
src/ai-tools/          Read-only wrappers for a future AI layer (spec §60/§62/§88)
src/api/                Express routes: tpo / student / management, demo auth
tests/                  24 tests against a real local Postgres
drizzle/                Generated SQL migrations (2 so far)
docs/                   TRUTH_TABLE, INTEGRATION_NOTES, HOSTILE_REVIEW
```
