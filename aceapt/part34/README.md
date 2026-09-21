# ACEAPT — Feature 34: Career Trajectory & Future Scenario Intelligence

A working MVP vertical slice of Feature 34, built standalone because no
existing ACEAPT codebase was available to inspect or integrate with in this
environment. It's structured so it can be merged into the real ACEAPT
platform with targeted changes rather than a rewrite — see
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for exactly what to reconcile with
your existing system before that happens.

## What's here

- **`backend/`** — Express API. A deterministic trajectory / scenario /
  recommendation engine (`src/engine/`), plus an optional AI narrative layer
  (`src/services/aiNarrative.js`) that *explains* the numbers — it never
  generates them.
- **`frontend/`** — React (Vite) app: Career Movement screen, Scenario
  Explorer, Trajectory Timeline, and the 30/60/90 day plan.

## What this implements

- Target → current state → trajectory (7-state model) → confidence, computed
  from real time-series evidence, not fabricated
- "Activity vs. progress" mismatch detection (brief §7)
- Top limiting factor, with capability gaps and evidence gaps explicitly
  told apart (brief §36)
- Next-best-action recommendation, wired to a real start → log result →
  trajectory-updates loop
- Scenario Explorer: continue current path / focus on the bottleneck /
  compare against a different target
- 30 / 60 / 90 day planning
- Trajectory timeline
- Loading / empty / insufficient-evidence / error / partial-data /
  AI-unavailable states throughout

**Deliberately not built yet** (see `ARCHITECTURE.md` → "P1/P2, not in this
slice", following the brief's own phasing in §65–67): institutional/TPO
dashboards, trainer cohort views, market-signal integration, a dedicated
decision-history UI, Feature 33/opportunity integration, the full Career
Twin, and real authentication.

## Running it locally

Needs Node.js 18+.

**Backend**
```bash
cd backend
cp .env.example .env      # fill in ANTHROPIC_API_KEY if you want AI narratives; otherwise leave it blank
npm install
npm run dev                # http://localhost:4000
```

**Frontend** (second terminal)
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:5173
```

Demo data for one fictional "Demo Student" is seeded automatically on first
run into `backend/data.json` (git-ignored). Delete that file and restart the
backend to reseed from scratch, or run `npm run reset-demo` inside `backend/`.

## Keys and secrets

Nothing is hardcoded. Both `.env.example` files leave every credential blank
— `ANTHROPIC_API_KEY`, `DEMO_AUTH_TOKEN` — fill in your own values in your
own `.env` / `.env.local` (git-ignored, never committed). Without
`ANTHROPIC_API_KEY` set, the AI narrative endpoint automatically falls back
to deterministic template text — the feature is fully usable either way, and
that fallback path is what runs by default in this repo.

## Honesty about scope

This was built in a single pass without access to a real ACEAPT repository,
real student data, or real credentials. The auth layer is a placeholder
(`backend/src/middleware.js`), the database is a JSON file standing in for a
real one, and the seeded "Demo Student" is entirely fictional. None of this
should be treated as production-secure or as real student data — treat it as
a genuine, working starting point to integrate, not a finished, deployed
feature.
