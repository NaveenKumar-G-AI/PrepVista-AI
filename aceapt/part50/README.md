# ACEAPT Feature 50 — Speed Training Engine

Backend service + frontend component module for personalized speed
intelligence and controlled speed training (spec: "Feature 50 Master
Implementation Prompt").

No existing ACEAPT repository was available in this environment to inspect
(see `IMPLEMENTATION_REPORT.md`), so this is built as a **self-contained,
integration-ready module**: a real backend service with a real database
schema, a real REST API, and a real (tested) adaptive-pressure engine — plus
clean adapter interfaces for Features 42–49, mastery, readiness, goals, and
auth, so it can be wired into the actual ACEAPT codebase without changing
anything in `src/core` or `src/services`.

## Quickstart (backend)

```bash
cd backend
cp .env.example .env      # every secret is intentionally blank — see below
npm install
npm test                  # 63 tests, all passing, no DB required
npm run dev                # starts on :4050, in-memory storage if DATABASE_URL is blank
```

No configuration is required to run it — leave `.env` mostly blank and the
server starts in in-memory mode (data doesn't persist, but every endpoint
works). Fill in `DATABASE_URL` to switch to Postgres (a ready-made
`docker-compose.yml` is provided at the repo root), `JWT_SECRET` to match
your real auth token issuer, and `ANTHROPIC_API_KEY` only if you want the
optional AI coaching rephrasing turned on.

```bash
docker compose up -d       # optional: local Postgres on :5432
npm run build && npm start # production build
```

## Quickstart (frontend)

The `frontend/` folder is **not a standalone app** — it's a set of 13
React/TypeScript components meant to be copied into the existing ACEAPT
frontend (spec section 87: "reuse existing UI architecture"). Its only peer
dependencies are `react` and `react-dom`; it uses Tailwind utility classes
(no build-time Tailwind config included — use the host app's).

```ts
// once in your app's setup:
import { configureSpeedApi } from './feature-50/api/speedApi';
configureSpeedApi({ getAuthToken: () => yourExistingAuthStore.token });
```

## Project structure

```
backend/
  src/
    types/domain.ts          shared vocabulary (states, modes, enums)
    core/                    pure, deterministic algorithms (no I/O) — see below
    integrations/            adapter interfaces for Features 42-49 + defaults
    db/                      Drizzle schema, SQL migration, repository (Postgres + in-memory)
    services/                session lifecycle, analytics, optional AI coaching
    api/                     Express app, routes, auth middleware, validation
  tests/                     58 tests covering the spec's own "core test" list (section 128-144)
frontend/
  src/
    components/               13 components named in spec section 87
    api/speedApi.ts           typed fetch client
    types/speed.ts            mirrors backend/src/types/domain.ts
docker-compose.yml            optional local Postgres
```

### The core algorithms (`backend/src/core`)

This is the part of the spec most worth reading carefully, so it's kept
free of database/HTTP concerns and fully unit tested:

| File | What it does |
|---|---|
| `speedAnalysis.ts` | Per-attempt FAST/SLOW/ON_PACE × ACCURATE/INACCURATE classification, personal baselines, expected-time resolution (calibrated → personal baseline → **unknown**, never a guess) |
| `bottleneckEngine.ts` | Stage-level bottleneck detection (reading/strategy/calculation/verification) plus rushing/hesitation/knowledge-gap/time-wasting signals |
| `trainingPolicy.ts` | The adaptive-pressure state machine — decides mode switches and target ramp from a rolling window of evidence |
| `accuracyGuardrail.ts` | The explicit "never improve speed blindly" check |
| `speedAccuracyFrontier.ts` | Speed-vs-accuracy frontier (bucketed, evidence-gated) and the safe-speed-zone derived from it |
| `decisionEngine.ts` | Attempt/skip/return recommendation — never exposes a raw numeric score |
| `pacingEngine.ts` | Whole-session budget tracking (never forces equal time per question) |
| `feedbackMessages.ts` | Deterministic, tone-safe copy — also the AI fallback |

## What's real vs. what's a placeholder

**Real and tested:** every file under `backend/src/core`, the in-memory
repository (what all 58 tests run against), the Express API wired end to
end (auth → routes → services → repository), and the Postgres repository
(type-checks cleanly against Drizzle's real types, but there was no live
Postgres instance in this environment to run it against).

**Placeholder by design, not by oversight:** `src/integrations/defaultProviders.ts`.
Every method returns "I don't know" (`null`/`false`/`[]`) rather than a
guessed value — see the comment at the top of that file for what to wire up
once this is merged into the real ACEAPT backend.

## Full report

See `IMPLEMENTATION_REPORT.md` for the pre/post-implementation report the
spec itself asks for (sections 126-127), including the P0/P1/P2 checklist
from sections 121-123 with actual status.
