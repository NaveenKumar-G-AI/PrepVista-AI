# ACEAPT Feature 29 — ALIGN

Capability-to-opportunity alignment engine: compares a student's
demonstrated capability evidence against configurable target-role
requirements, separates **fit** (does the profile match) from
**readiness** (has it been verified), identifies critical gaps, explains
why, and closes the loop into ADAPT (Feature 26) and PROOF (Feature 28).

No repository was connected for this build, so — same as Features 8 and 20
— this is delivered as a **standalone, adapter-based module** meant to be
merged into the real ACEAPT codebase, not run standalone in production.
Every place it touches something Feature 3/5/6/8/20/26/27/28 should own
instead is marked `ADAPTER POINT` below and in the code.

## What's real vs. what's an adapter point

Built with real, tested logic — not stubbed:

- The entire deterministic engine (Capability DNA, evidence confidence,
  fit, readiness, critical-gap suppression, alignment state, gap
  prioritization, target priority shortlist, what-if simulator). No LLM
  ever decides a score anywhere in this codebase.
- Postgres schema with Row-Level Security, migrated and load-bearing —
  every student-scoped table is isolated per student and **verified**
  against a real local Postgres instance while building this (see
  [Verification](#verification) below), not just written and assumed
  correct.
- The full API layer, auth adapter, durable outbox / signal bus, and the
  AI explanation layer (Anthropic, with an automatic no-key-needed
  template fallback — nothing requires a key to work end to end).
- All 15 React/Tailwind components listed in [Frontend](#frontend).

Adapter points — real, working reference implementations, but meant to be
swapped for ACEAPT's actual systems:

- **`src/integrations/evidenceSource.ts`** — ALIGN doesn't originate
  evidence (spec §11). Reads from a local `capability_evidence_events`
  table by default; point it at whatever Feature 3/5/6/8/20 actually use.
- **`src/integrations/forecastAdapter.ts`** — no Feature 27 to call yet;
  returns an empty (perfectly neutral) signal. Forecast is never treated
  as proof (spec §8) regardless of what this returns.
- **`src/integrations/adaptAdapter.ts`** / **`proofAdapter.ts`** — publish
  structured signals to the outbox; nothing here decides what ADAPT or
  PROOF should actually do (spec §9, §40-41: "do not recreate Feature 26
  inside Feature 29").
- **`src/api/middleware/auth.ts`** — verifies an HMAC token rather than
  duplicating a full auth system (spec §6/§9). **Fails closed (503)**,
  never open, when unconfigured — see `.env.example`.
- **`src/api/controllers/tpo.controller.ts`** — cohort aggregate has no
  real institution/cohort scoping (this build has no institution model to
  match); see the note in that file.

## Repo layout

```
backend/    Express + TypeScript + Postgres/RLS
  migrations/           SQL migrations
  src/domain/           shared types — the vocabulary everything else uses
  src/engine/           the deterministic engine (pure functions, heavily tested)
  src/integrations/     outbox + ADAPT/PROOF/FORECAST/evidence adapters
  src/ai/               explanation layer (Anthropic + template fallback)
  src/api/               routes, controllers, auth middleware
  src/services/          orchestration (engine + DB + integrations)
  src/db/                 pool, migrations runner, repositories
  src/devtools/            dev-only token minter (NOT for production issuance)
  src/__tests__/            28 automated tests (unit + live-Postgres integration)
  scripts/demo-walkthrough.js   real HTTP replay of the spec §63 demo (see below)
frontend/  React + Tailwind components, portable (no Next.js-specific imports)
  src/components/align/  15 components — dashboard, target detail, TPO view
  src/hooks/useAlignData.ts   fetch wrapper — the seam for your real API client
  preview/                 Vite harness with realistic mock data, for visual QA
docs/INTEGRATION.md      the closed-loop wiring in detail
```

## Setup

```bash
cd backend
cp .env.example .env        # fill in your Postgres creds + secrets
npm install
npm run migrate:dev         # applies migrations/001_align_schema.sql
npm run seed                # upserts the 7 configured target profiles
npm run dev                 # or: npm run build && npm start
```

Every secret in `.env.example` is blank, as asked — including
`ANTHROPIC_API_KEY` (explanation layer auto-falls-back to templates
without it) and `ALIGN_SERVICE_JWT_SECRET` (the API refuses all requests
with a clear 503 until this is set, rather than silently allowing
everything through).

For the frontend preview:

```bash
cd frontend
npm install
npm run preview:dev     # Vite dev server with mock data, no backend needed
```

## Verification

This wasn't just written and assumed correct:

- **28 automated tests, all passing** (`npm test` in `backend/`) — unit
  tests for every engine module with **hand-derived expected values**
  worked out independently before writing the assertion (e.g. the
  critical-gap scenario's fit score of 55% and readiness of 38% were
  computed by hand from the weighting formulas, then checked against the
  engine's actual output), plus two integration tests against a real
  local Postgres instance (RLS isolation, and the outbox dispatcher).
- **A 30-check live-HTTP replay** of the spec's own §63 Startupthon demo
  (`backend/scripts/demo-walkthrough.js`) — boots the real server against
  real Postgres, seeds evidence, and walks the entire loop over real HTTP:
  capability DNA → targets → why → fit vs. readiness → what-if → improve
  gap → ADAPT → prove target → PROOF → verified → readiness rises →
  history accumulates → TPO cohort view → cross-student access correctly
  denied. Run it yourself: start the server, then
  `ALIGN_SERVICE_JWT_SECRET=... BASE_URL=http://localhost:4029 node scripts/demo-walkthrough.js`.
- **5 real bugs found and fixed** in the process, not just cosmetic ones:
  1. A capability-name fallback used the raw snake_case id (`programming`)
     instead of the display name (`Programming`) whenever a capability had
     zero evidence — would have shown that in student-facing copy.
  2. `app.current_role` as a custom Postgres GUC name silently fails to
     parse — `current_role` is a reserved keyword. Renamed to `app.actor_role`.
  3. **Postgres exempts a table's owner from its own RLS policies by
     default.** `ENABLE ROW LEVEL SECURITY` alone let one student's session
     write a row claiming to be another student, verified via manual
     `psql` proof. Fixed with `FORCE ROW LEVEL SECURITY` on every isolated
     table — this is a real, non-obvious footgun worth knowing about if
     you extend this schema.
  4. The PROOF-completion webhook updated evidence with a raw
     `pool.query()` call that carried no RLS context, so the update
     silently affected zero rows — verification would never actually take
     effect. Caught by the live-HTTP replay, not by unit tests (the unit
     tests mocked past the DB layer).
  5. The outbox dispatcher had the same class of bug in three places —
     entirely non-functional the moment `OUTBOX_DISPATCH_ENABLED=true` was
     set, until fixed and covered by a dedicated integration test.

## API

See `docs/INTEGRATION.md` for the full endpoint list and the outbox event
contracts. Auth: `Authorization: Bearer <token>` on every route (see
`src/devtools/mintDevToken.ts` for minting a local dev token).

## Frontend

15 components under `frontend/src/components/align/`, built around one
deliberate idea: **fit and readiness are never allowed to visually
collapse into one number** — fit is always the blue/cyan tone, readiness
is always green, everywhere, including the signature Fit×Readiness scope
diagram. Design tokens (a calibration-instrument palette — deep slate,
Space Grotesk + IBM Plex Sans + IBM Plex Mono, muted signal colors) live in
`frontend/src/styles/tokens.css`.

Verified with a real headless-browser screenshot pass during the build,
not just a type-check — which caught a genuine layout bug (point labels
on the scope diagram overlapping into unreadable text whenever two
targets scored close together) before it shipped.

## Scope (spec §75)

P0 (fully built, real logic, tested): Capability DNA, target profiles, fit
calculation, readiness calculation, fit-vs-readiness separation, why
target, critical gaps, next best action, ALIGN→ADAPT, ALIGN→PROOF.

P1 (fully built): target comparison/priority, history, what-if, evidence
confidence.

P2 (MVP, honestly lighter — see the note in `tpo.controller.ts`): TPO
cohort analytics has no real institution scoping to match yet. Target
evolution/drift has a data model and is recorded (`POST /align/target`)
but has no dedicated UI beyond what's here. Advanced scenario comparisons
and an opportunity graph were left out, per spec §75's own instruction not
to sacrifice the working intelligence loop for decorative features.
