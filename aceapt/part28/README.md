# ACEAPT PROOF — Feature 28

Evidence-Based Readiness Verification & Real-World Performance Simulation Engine.

Read **TRUTH_TABLE.md** first — it says exactly what's real (built and tested against
real Postgres, a real Fastify server, and real React SSR) versus a documented port
standing in for an ACEAPT system this build session couldn't reach.

## Implementation map (Section 61 — Discover / Map / Integrate / Implement)

No ACEAPT/PrepVista repository was available in this session, so "discover the
existing architecture" became "build the domain engine for real, and make every
dependency on a system this feature doesn't own an explicit, swappable port." That
map is `src/domain/ports.ts` — five interfaces (Forecast, Adapt, Capability, Novelty,
Auth), each with a demo implementation to run and test against today.

```
backend/src/
  domain/            pure, deterministic engine — no I/O, fully unit-testable
    types.ts           shared contract (status/evidence/factor/result/session/...)
    config.ts          configurable thresholds (Section 15 — never hardcoded)
    ports.ts           the 5 interfaces standing in for Features 26/27/capability/etc.
    evidenceAggregation.ts     raw attempts -> quality-scored evidence
    verificationEngine.ts      the explainable rules engine (5-state model)
    targetedVerificationSelector.ts   uncertainty-driven "what to test next"
    simulationAnalysis.ts      time-pressure / recovery / question-strategy signals
    failureSignature.ts        failing factors -> named categories -> Adapt payload
    readinessAging.ts          Section 37 aging-state policy
  adapters/          real Groq adapter + demo/dev stand-ins for the 5 ports
  repositories/      ProofRepository interface + in-memory + Postgres implementations
  db/
    migrations/        001_init.sql (schema + RLS), 002_functions.sql (SECURITY DEFINER)
    pool.ts, migrate.ts, seed.ts
  services/proofService.ts     orchestrates the above into the Section 66 journey
  api/               Fastify routes + zod schemas
  server.ts          composition root
  tests/             46 tests — unit, in-memory integration, and real-Postgres

frontend/src/
  api/               typed client + mirrored types
  components/        EvidenceStackVisual (bespoke signature visual) + 7 screens
  hooks/useProof.ts  drives the full student journey
  theme/tokens.css   design tokens — import this once at your app's entry point
  tests/ssr.check.tsx   15 real React SSR render-branch checks
```

## Running it

### Backend

```bash
cd backend
npm install

# Postgres 16, matching what this was built and tested against
createdb aceapt_proof
PROOF_DB_ADMIN_USER=postgres PROOF_DB_ADMIN_PASSWORD=<your-password> PROOF_DB_NAME=aceapt_proof npm run migrate

# Runs all 46 tests, including real RLS checks and a real 5-way concurrency race —
# needs the same PROOF_DB_* env vars as above (or edit the dev defaults in the two
# db.*.test.ts files under src/tests/)
PROOF_DB_ADMIN_PASSWORD=<your-password> npm test

# Walks the exact Section 55 demo scenario against real Postgres and prints each step
PROOF_DB_ADMIN_PASSWORD=<your-password> npm run seed

# Starts the API on :4028 (PROOF_PORT to change it)
PROOF_DB_PASSWORD=proof_app_dev_password npm run dev
```

Fill in real secrets before anything but local dev: `PROOF_GROQ_API_KEY` (AI
explanations; the deterministic fallback runs fine without it), the
`proof_app_dev_password` / `proof_service_dev_password` literals in `001_init.sql`,
and swap `DevAuthAdapter` for real auth before this is reachable from outside your
own machine.

### Frontend

```bash
cd frontend
npm install
npm run typecheck
npm run ssr-check     # the 15 real render-branch checks
```

This package isn't wired to a bundler (it's meant to drop into PrepVista's existing
React app) — import `theme/tokens.css` once wherever that app sets up global styles,
then use `<ProofDashboard api={...} targetId={...} />`. Pass your own
`SimulationRunner` prop instead of the bundled placeholder once you're ready to wire
in the real question-taking UI (Section 47 — reuse it, don't rebuild it).

## What to reconcile with the real codebase

Everything under "Integration seams" in TRUTH_TABLE.md — the five ports, the two
stand-in tables in `001_init.sql`, the RLS session-variable approach if the real
deployment is Supabase (swap for `auth.uid()`), and the placeholder simulation runner
on the frontend.
