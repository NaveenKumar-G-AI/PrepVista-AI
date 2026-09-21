# Feature 34 — Architecture Notes

## Why this is standalone

The brief is explicit that Feature 34 should be built by inspecting the
existing ACEAPT codebase and reusing its entities, auth, and data before
creating anything new (§42, §60–61). No existing ACEAPT repository,
database, or API was available in this environment — only the brief itself.
Building against a codebase that isn't accessible here would mean guessing
at schemas and APIs that may not actually exist, which is worse than being
explicit about the gap. So this slice is self-contained, but structured so
integration is a series of narrow swaps rather than a rewrite.

## Entity mapping

| This slice | Conceptual entity in the brief (§42) | Where |
|---|---|---|
| `signals` records | `TrajectorySignal` | `backend/src/db/store.js` |
| computed, not stored | `TrajectorySnapshot` / `CareerState` | `backend/src/routes/career.js` (`buildCareerState`) |
| computed, not stored | `Scenario` / `ScenarioAssumption` | `backend/src/engine/scenarios.js` |
| `decisions` type `intervention_started` | `Intervention` | `backend/src/db/store.js` |
| `decisions` type `intervention_completed` | `InterventionOutcome` | same |
| `decisions` type `target_selected`/`target_changed` | `CareerDecision` | same |

**Before merging into real ACEAPT**: check whether equivalent tables already
exist (assessment results, simulation results, project/evidence records,
etc.) and adapt `TrajectorySignal` to reuse them rather than storing the same
evidence twice (§36, §60).

## Deterministic vs. AI (§44)

Everything that produces a number, a classification, or a recommendation is
plain, deterministic, unit-testable JavaScript in `backend/src/engine/`:
trend classification, confidence, limiting factor, activity-vs-progress
detection, intervention selection, scenario projections, 30/60/90 planning.
All of it has been exercised against the seeded demo data and produces the
numbers shown in the README/UI — nothing is hardcoded output.

AI (`backend/src/services/aiNarrative.js`) does exactly one thing: turns an
already-computed JSON payload into 2–3 sentences of plain language. It
cannot see or influence the underlying numbers. Its output is checked
against a small banned-language list (guarantee/certain/percent-chance/etc.
— §15) before being shown; if it fails that check, the call errors, or no
key is configured, the endpoint falls back to a deterministic template built
from the same payload (§45). That fallback path is what this repo exercises
by default, since no real key ships with it — verified working during
development.

## Persistence (placeholder)

`backend/src/db/store.js` is a small JSON-file store behind a repository
interface (`getStudent`, `listSignals`, `addSignal`, `listDecisions`,
`addDecision`, `upsertStudent`). Nothing outside this file touches the file
system directly. Swapping in a real database means rewriting the *inside* of
these functions only — engine and route code stays the same. This was a
deliberate choice to avoid adding a database dependency (and the native
build tooling that can come with one) for a slice with no real database to
connect to yet.

## Auth (placeholder — not production security)

`backend/src/middleware.js` checks one shared token (`DEMO_AUTH_TOKEN`) and
resolves `req.studentId` from the authenticated caller rather than trusting
a client-supplied id, so at least the *shape* of "never let one student read
another's data" (§46/47) is present. This is not real authentication,
authorization, or tenant isolation. Replace it with ACEAPT's real
session/JWT auth and role-based access — including for the future
TPO/trainer/institutional views in §37–39, which need real role checks this
slice doesn't implement — before any real student touches this.

## Integration points left open on purpose

- **Feature 33 (opportunities)**: `recommendation.capability` and
  `limitingFactor.capability` are the natural hand-off values. When Feature
  33 exists here, "Next best action" and the demo flow in §68
  (trajectory → opportunity → action → outcome → updated trajectory) can
  link out using those.
- **PATH**: `TrajectorySignal` is generic enough to accept PATH-originated
  events (§33) without a schema change — add a `source` field when that
  integration happens.
- **ADAPT**: the `STALLED`/`DECLINING` trend states and the
  activity-vs-progress mismatch findings are exactly the trigger ADAPT would
  consume (§34) — they're already returned from `GET /api/career/state`.
- **Simulations**: seed data already models simulation results as a
  `type: 'simulation'` signal (§35); point `addSignal` at the real
  simulation-completion event instead of the demo flow when that system
  exists.
- **Evidence/Proof**: the capability-gap vs. evidence-gap distinction in
  `findLimitingFactor` (§36) is structural, not just copy — a capability
  with real evidence but a low score reads completely differently from a
  capability with zero evidence, and the API/UI carry that distinction
  through.

## P1 / P2, not in this slice

Per the brief's own phasing (§65–67), this MVP intentionally does not
include: institutional/TPO dashboards, trainer cohort views, cohort
scenarios, market-signal integration, a dedicated decision-history UI (the
data model already supports it — `decisions` records target changes — there
just isn't UI for it yet), intervention-effectiveness learning across
students, or the full Career Twin. The data shapes here were chosen so none
of that requires re-architecting, only adding.

## Known simplifications worth revisiting

- Trend/confidence thresholds (`backend/src/engine/trend.js`) are explicit,
  commented constants, not a fitted or learned model — intentional for an
  explainable MVP (§11), but worth revisiting once real longitudinal data
  exists at scale.
- `computeScenarioB`'s "roughly doubles the recent rate of improvement" is a
  named, disclosed modeling choice, not a measured fact. It's labeled as
  such in the API response and the UI, and should stay labeled that way even
  if the exact multiplier changes.
- Single-student demo scope: the API resolves one demo student from the auth
  layer rather than accepting a student id from the client, which is the
  right shape for tenant isolation, but means real multi-student support
  needs the real auth layer first, not a change to this code.
