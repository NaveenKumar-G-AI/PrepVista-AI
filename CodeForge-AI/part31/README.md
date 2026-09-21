# Role Readiness Engine (Feature 31)

Deterministic, evidence-driven role readiness calculation for CodeForge AI,
built from the Feature 31 spec.

## Integration status — read this first

**No existing CodeForge AI repository was available in the environment this
was built in** — only the spec document. Phase 1 ("inspect the existing
repository") could not literally be performed, and this package does not
pretend otherwise: it does not fabricate a Skill Signal Engine, a Mastery
Engine, a database schema, or an auth system to integrate against.

What's here instead is the actual, real, tested deterministic engine (the
part of the spec that doesn't depend on your specific codebase), plus a
clean, documented integration contract (`src/ports`) for the three things
this engine needs from your real systems: verified evidence, a role model,
and a place to persist snapshots. See `STATUS.md` for a phase-by-phase
accounting of what's implemented-and-tested vs. interface-only vs.
out of scope without your repo.

## What's real here

- **The full calculation pipeline is implemented and tested** — evidence
  aggregation (recency/difficulty/consistency/trend), core-skill gating,
  confidence (independent from readiness), classification into states,
  blocker/strength derivation, cohort aggregation.
- **64 tests, all passing**, run with `npm test` — not claimed, actually
  executed. Covers unit tests per module, the five Phase 61 golden
  scenarios, the Phase 55 edge cases, authorization decisions, and a
  simulated optimistic-concurrency conflict/retry.
- **The AI explanation layer has a guaranteed non-AI fallback** that's
  exercised by tests (no API key configured here, by request — leave it
  blank until you add your own).

## What still needs your repo

- Real implementations of `EvidenceProvider`, `RoleModelProvider`, and
  `SnapshotRepository` (`src/ports/index.ts`) against your actual Skill
  Signal Engine, Mastery Engine, role model service, and database.
- The SQL migration (`db/migrations/001_role_readiness.sql`) needs its
  table/column names checked against your real schema before running.
- The API handlers (`src/api/handlers.ts`) are framework-agnostic on
  purpose — mount them on your actual router and wire `AuthContext` from
  your real auth middleware, never from raw request input.
- Integration with the real Skill Gap Analysis (Feature 32), Next Best
  Action (Feature 30), and Technical Mastery Report — this package exposes
  the structured data (`ReadinessBlocker[]`, `ReadinessResult`) those
  features need to consume; it doesn't call into features that don't exist
  here.

## Setup

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run — 64 tests
```

Copy `.env.example` to `.env` and fill in your own `ANTHROPIC_API_KEY` if
you want AI-generated explanations. Without it, `explainReadiness()`
automatically returns the deterministic template explanation instead —
readiness itself never depends on the AI call succeeding.

## Architecture

```
EvidenceProvider ──┐
RoleModelProvider ─┼─▶ application/getRoleReadiness.ts ─▶ domain/readinessEngine.ts (pure, deterministic)
SnapshotRepository ┘         │                                   │
   (your real systems,       │ cache check, partial-failure       ├─ evidenceAggregation
    implement src/ports)     │ handling, optimistic concurrency   ├─ coreGates
                              ▼                                   ├─ confidence
                     api/handlers.ts (framework-agnostic)         ├─ classification
                              │                                   └─ blockersAndStrengths
                              ├─▶ ai/explainReadiness.ts (optional, AI never sets the score)
                              └─▶ frontend/RoleReadinessCard.tsx, RoleReadinessHistory.tsx
```

The domain layer (`src/domain`) has no dependency on ports, HTTP, or AI —
`computeRoleReadiness()` is a pure function: same evidence in, same result
out, every time. Nothing downstream (API, AI explanation, UI) is allowed to
recompute or override its output — see `config.ts` for the one place all
weights and thresholds live.

## Design decisions worth knowing about

These are choices this implementation had to make in the absence of a real
role model or product calibration to inspect. All are centralized in
`src/domain/config.ts`, versioned via `ALGORITHM_VERSION`, and safe to
retune without touching calculation logic:

- **Unassessed skills contribute 0 to the numerator of the weighted score,
  but are never labeled "weak" anywhere.** A required skill nobody has
  evidence for is a genuine readiness gap, so it isn't excluded from
  scoring — but `status` (`unassessed` / `insufficient_evidence` /
  `assessed`) is always reported alongside `mastery`, and every blocker
  message names the real reason ("has not been assessed yet"), never a
  fabricated low score.
- **A core skill failing its gate hard-caps the readiness state at
  `DEVELOPING`**, regardless of the weighted average — see
  `classification.ts` and the test named after Phase 12 in
  `classification.test.ts`.
- **"Repeated verified performance" and "verified direct performance"
  share the same tier weight**; repetition's extra trust shows up through
  the evidence-quantity factor in confidence, not a second, higher tier —
  avoids double-counting the same signal.
- A below-threshold skill and an unstable skill are reported as **one
  blocker, not two** — below-threshold takes priority as the more
  fundamental issue. A skill that meets its bar on average but is unstable
  gets the `inconsistent_performance` blocker instead.

## Files

```
src/domain/       — the deterministic engine (pure functions, fully tested)
src/ports/        — integration contract (interfaces only, implement against your real systems)
src/persistence/  — optimistic concurrency helper
src/ai/           — explanation layer with guaranteed non-AI fallback
src/api/          — framework-agnostic handlers + authorization decisions
src/application/  — wires ports + domain together (caching, partial-failure handling)
db/migrations/    — additive-only SQL, needs review against your real schema
frontend/         — two React components, driven entirely by real props
tests/            — 64 tests, all passing
STATUS.md         — phase-by-phase honest status against the full Feature 31 spec
```
