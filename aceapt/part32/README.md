# ACEAPT Feature 32 — Readiness Radar

A capability-gap and next-best-action engine: it reads a student's assessment
history against what their target role expects, and turns that into a short,
evidence-backed, prioritized list of what to do next.

> **On the name.** The brief calls this "Feature 32." That's kept as an
> internal/engineering reference only — a student-facing screen called
> "Feature 32" tells nobody anything. The product name here is **Readiness
> Radar**.

> **On "existing ACEAPT integration."** No ACEAPT codebase was provided
> alongside the brief, so there was nothing to inspect or extend. This is
> built as a standalone, production-shaped module with the integration
> seams the brief asks for (repository interface, auth stub, pluggable
> explanation provider) clearly isolated — see **Integrating into a real
> ACEAPT repo** below for exactly what to swap.

---

## What's actually here (and what isn't)

**Real:** every score, gap, trend, confidence level and recommendation you
see is computed live from data that really persists to disk, by code that
really runs, and is covered by tests that really execute (20/20 passing —
see below). Nothing is hardcoded into the UI.

**Standing in for real ACEAPT infrastructure, by necessity:**
| This build uses | A real ACEAPT deployment would use |
|---|---|
| A JSON file on disk (`backend/data/db.json`) behind a `ReadinessRepository` interface | Postgres / whatever ACEAPT's real database is, implementing the same interface |
| An `x-student-id` header trusted at face value | ACEAPT's real session/auth verification |
| One seeded demo student | Real student profiles + real assessment results |
| A deterministic template for recommendation text | Optionally, the LLM adapter below, once wired with a real key |

None of this is disguised — see `src/data/repository.ts` and
`src/middleware/common.ts`, both explicitly commented as integration points.

---

## Engineering plan (per the brief's process)

1. **Objective** — turn scattered evidence into one clear next action.
2. **Student problem** — students don't know what's actually blocking their
   readiness, or what to do about it, and generic advice doesn't help.
3. **Journey** — pick a target role → system reads evidence → shows gaps
   with confidence → prioritized actions → student acts → system
   re-evaluates from new evidence.
4. **Reuse vs. build** — nothing existing was available to reuse; built
   with clean seams instead (see table above) so a real codebase can
   absorb this without a rewrite.
5. **New systems** — gap-analysis engine, prioritization engine, template
   explanation generator, event log.
6. **Data model** — see below. Two new conceptual entities that don't
   already exist anywhere (`AssessmentAttempt`, `ReadinessEvent`); gaps
   and recommendations are *derived*, not stored, on purpose.
7. **API** — new REST surface under `/api/readiness-radar` (full reference
   below).
8. **AI** — deterministic scoring and prioritization (ordinary code, not a
   model — see brief §19); an optional, pluggable LLM adapter for
   *phrasing* only, off by default, with a guaranteed fallback.
9. **MVP boundary** — 1 demo student, 2 role rubrics, 7 capabilities, one
   JSON-file store, dev-only auth stub. Explicitly not in scope: multi-
   tenant institutional access, notifications, full observability.
10. **Future extension points** — see the last section of this document.

---

## Architecture

```
backend/                        Express + TypeScript API
  src/types/domain.ts           Shared domain types
  src/config/rubrics.ts         Reference data: capabilities + role rubrics
  src/data/repository.ts        Persistence interface + demo JSON-file impl
  src/services/
    gapAnalysis.service.ts      Deterministic gap/trend/confidence engine
    recommendation.service.ts   Turns gaps into ranked, bucketed actions
    explanation.service.ts      Template explanations + optional LLM adapter
    readinessOrchestrator.ts    Assembles the full ReadinessState
    event.service.ts            Event logging
  src/middleware/common.ts      Auth stub, error handling, logging, rate limit
  src/routes/readinessRadar.ts  The API surface
  src/seed.ts                   Seeds one labeled demo student
  tests/                        Vitest unit + supertest integration tests

frontend/                       Vite + React + TypeScript + Tailwind
  src/api/client.ts             Typed fetch wrapper (dev student-id stub)
  src/components/
    RoleSelect.tsx              NO_TARGET_ROLE state
    CapabilityGapsOverview.tsx  Instrument-style gap bars (current vs. bar)
    PriorityActions.tsx         DO FIRST / DO NEXT / OPTIONAL cards
    LogAssessmentForm.tsx       Logs a real assessment attempt
    common.tsx                  Loading/error/empty states, badges
  src/App.tsx                   Data flow + state machine
```

### Intelligence model (brief §7–9)
Every gap distinguishes **known** facts (raw scores, attempt counts) from
**inference** (gap size, trend) from **confidence** (`HIGH` / `MEDIUM` /
`LOW` / `INSUFFICIENT_DATA`) — never presented as a single flattened number.
A capability with zero attempts is never assigned a fabricated score; it's
routed to a "take this assessment" recommendation instead of a "practice
this" one.

### Adaptive behavior (brief §13)
Recommendations are *derived fresh* from current evidence on every read,
not stored and mutated. Completing a "practice" action doesn't declare
victory by itself — only a new, higher-scoring assessment attempt (which
completing an action can optionally log) moves the gap. One strong result
also doesn't jump straight to `HIGH` confidence — that requires a sustained
pattern (≥3 attempts, recent). This is asserted directly in
`tests/gapAnalysis.test.ts` and `tests/api.test.ts`.

### AI usage (brief §19–20)
Scoring, gap math, trend detection, confidence and prioritization are all
ordinary deterministic code — an LLM has no business making those calls.
`explanation.service.ts` is the one place natural language is generated;
it defaults to a deterministic template and only calls a real model if
`USE_LLM_EXPLANATIONS=true` **and** `ANTHROPIC_API_KEY` is set. If that
call fails for any reason, it transparently falls back to the template
(unit-testable, and logged server-side) rather than breaking the feature.

---

## Data model

```
CapabilityDefinition   — reference data: id, name, category
RoleRubric              — reference data: role → {capability, weight, targetBar}[]
StudentProfile          — studentId, displayName, targetRoleId
AssessmentAttempt       — studentId, capabilityId, score, takenAt, source   [persisted]
ReadinessEvent          — studentId, type, payload, createdAt              [persisted]

CapabilityGap           — derived per request, never stored
Recommendation          — derived per request, id = `${capabilityId}__${actionType}`
ReadinessState          — the full derived response for one student
```

Only two genuinely new persisted entities exist
(`AssessmentAttempt`, `ReadinessEvent`) — gaps and recommendations are
views over evidence, computed on read, so they can never drift out of
sync with the underlying facts.

---

## API reference

Base URL: `http://localhost:4000/api/readiness-radar`
Auth (dev stub): send header `x-student-id: <any-id>` on every request
except `GET /roles`.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/roles` | — | Reference data, no auth needed |
| GET | `/state` | — | Full `ReadinessState` for the current student |
| GET | `/events` | — | Last 50 events, newest first |
| POST | `/target-role` | `{ roleId }` | Sets target role, returns fresh state |
| POST | `/assessment-attempts` | `{ capabilityId, score, source? }` | 0–100, returns fresh state |
| POST | `/recommendations/:id/complete` | `{ resultScore? }` | Optionally logs a new attempt too |
| POST | `/recommendations/:id/skip` | `{ reason? }` | |

All errors: `{ error: { code, message, details? } }`. `401 UNAUTHORIZED`,
`400 VALIDATION_ERROR`, `404 NOT_FOUND`, `429 RATE_LIMITED`,
`500 INTERNAL_ERROR` (never leaks internals — see `middleware/common.ts`).

---

## How to run it

```bash
# Backend
cd backend
cp .env.example .env      # keys intentionally blank — see below
npm install
npm run seed               # creates one demo student with real history
npm run dev                 # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Open `http://localhost:5173`. You'll see the seeded demo student's real
computed analysis immediately — nothing to configure.

### Keys / secrets
Per your instruction, every secret in `backend/.env.example` is left
blank. Nothing needs a real value to run the demo above. The only key
that unlocks extra behavior is `ANTHROPIC_API_KEY`, only if you also set
`USE_LLM_EXPLANATIONS=true`.

---

## How this was actually verified

Not just "should work" — actually run, in this environment, this session:

- `npx tsc --noEmit` — clean on both backend and frontend.
- `npm test` (backend) — **20/20 passing**: deterministic trend/confidence
  math, priority bucketing, id encoding, and a full supertest integration
  suite (auth rejection, validation rejection, the complete
  `NO_TARGET_ROLE → INSUFFICIENT_DATA → READY` journey, event logging,
  404 handling) against a real running Express app on an isolated test
  database.
- `npm run seed` + a real backend process + `curl` against
  `/roles` and `/state` — confirmed the seeded evidence produces exactly
  the expected bucketing (an unassessed high-weight capability and an
  improving-but-below-bar one in **Do first**; a low-evidence gap and a
  declining one in **Do next**; a near-the-bar one in **Optional**).
- `npm run build` (frontend) — real production build succeeds; confirmed
  the compiled CSS actually contains the custom design tokens (not a
  default Tailwind theme).
- Backend + frontend production build served together, with a real CORS
  preflight check confirming the two actually talk to each other.

What I could **not** verify in this environment: a live browser render.
There's no browser tool available to me here, so "does it look right" is
backed by code review + a successful build, not a screenshot. If you'd
like, I can also generate an inline visual preview of the main screen so
you can see it without cloning the repo — just say the word.

---

## Known limitations & integration points into a real ACEAPT repo

1. **Persistence** — swap `JsonFileReadinessRepository` for a real
   implementation of `ReadinessRepository` (Postgres, or ACEAPT's
   existing ORM/entities for student profile and assessment history).
   No other file needs to change.
2. **Auth** — replace `authStub` in `middleware/common.ts` with real
   session/JWT verification against ACEAPT's auth service. Every
   downstream route only ever reads `req.studentId`.
3. **Reference data** — `config/rubrics.ts` should become a real lookup
   against ACEAPT's actual capability-intelligence / readiness-engine
   data instead of the two hardcoded example roles here.
4. **Caching** — state is recomputed on every read, which is correct and
   simple at this scale. At real scale, recompute on write (triggered by
   `ASSESSMENT_COMPLETED`) and cache the result — don't add this before
   it's needed (brief §21).
5. **Idempotency** — mutation endpoints don't yet support an
   `Idempotency-Key` header; add it if retries become a concern.
6. **Dev-only npm audit findings** — both `package-lock.json`s show a
   moderate/high advisory in `esbuild`, pulled in transitively by
   `vite`/`vitest`. It only affects the local *dev* server accepting
   requests from arbitrary origins — it doesn't ship in the production
   build (confirmed above) and doesn't affect the API. Fixing it cleanly
   requires a major Vite/Vitest version bump, which I didn't apply
   without the ability to regression-test it here; run
   `npm audit fix --force` and re-test if you want it resolved now.
7. **Institutional/multi-tenant access** was explicitly out of scope for
   this MVP boundary, per the brief's own instruction to define one.

## Future extension points
Additional roles/capabilities are pure config additions to
`rubrics.ts`. Longitudinal trend detection, the confidence model, and the
event log are already shaped to support more history and more signals
(interview performance, project evidence) without changing their public
shape — see brief §14/§46.
