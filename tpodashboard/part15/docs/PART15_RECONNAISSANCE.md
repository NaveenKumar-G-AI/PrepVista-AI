# PART15_RECONNAISSANCE.md
## Phase 0 — Repository Reconnaissance

### Important caveat, stated up front

Section 7 of the build spec asks for a "complete repository reconnaissance" of
Parts 1–14 before implementation. **No such repository was available in this
environment.** This conversation started from the Part 15 prompt alone — no
codebase, no file uploads, no repo connector. Anything claiming to have
"found" Part 8 readiness analytics, Part 10 reporting, existing forecast
placeholders, etc. would be fabricated, and Section 77 of this same spec
("Synthetic-Data Elimination") is explicit that fabrication is exactly what's
not wanted here.

What follows instead is honest about that gap: it documents the
**assumptions this build had to make** in place of reconnaissance, and the
**integration contract** that lets you point it at your real system without
guesswork on either side. When you do have this module sitting inside your
actual monorepo, re-run Phase 0 for real against it — the checklist below is
written so you can.

### What this build assumes about Parts 1–14 (unverified — confirm against your repo)

| Assumption | Why it was necessary | Where it shows up |
|---|---|---|
| Applications/interviews/offers/joining are tracked as discrete, timestamped events per student | Needed for any as-of-cutoff forecast | `PlacementDataRepository` interface — every method takes `asOf` |
| A "verified placement" / "joining" definition exists and is versioned | Section 57 comparability requires this | `SeasonSummary.placementDefinitionVersion` |
| Readiness scores exist per student (Part 8) | Needed for opportunity coverage / personal outlook | `Student.readinessScore` |
| A target-setting mechanism exists or is wanted (Section 12) | Needed for gap analysis | `PlacementTarget` |
| An action/task system exists (Part 14) that can accept proposals | Section 83 — Part 15 must not bypass it | `ActionSystemAdapter` interface |
| An AI orchestration layer exists (Part 12) that calls named tools | Section 48 | `ToolDefinition[]` surface in `modules/*/ai-tools.ts` |
| A proactive-intelligence layer exists (Part 13) that watches for drift | Section 82 | Events this module publishes are the intended hook — see below |
| Company/drive records carry industry, required skills, eligible departments | Needed for opportunity coverage, skill demand, outreach scoring | `Company`, `Drive` types |

If any of these don't hold in your actual system, the type definitions in
`types/placement-strategy.types.ts` are the place to reconcile — adjust the
shape there and the repository interface, and the service layer's logic
doesn't need to change.

### Reconnaissance checklist to run for real, against your actual repo

When integrating, search your codebase for the following before wiring
anything up — this is the literal checklist Section 7 asked for, kept here so
it travels with the module instead of being thrown away:

- `forecast`, `prediction`, `projection`, `trend` — existing forecasting code to avoid duplicating or conflicting with
- `target`, `benchmark`, `planning` — existing target-setting mechanisms
- `scenario`, `what-if`, `simulate` — existing scenario/simulation code
- `capacity`, `pipeline`, `opportunity` — existing capacity-planning or opportunity-matching logic
- Any column or field already named `placement_pct`, `readiness_score`, `joining_confirmed_at` and its exact semantics (does "placement" already include accepted-but-not-joined? — this determines whether `getJoiningForecast`/`getPlacementForecast` should really be aliases, as they are in this build, or genuinely distinct)
- Existing RBAC/role tables — confirm there is truly no recruiter-facing role before assuming this module's `STUDENT | TPO | MANAGEMENT` set is complete
- Existing event bus / message queue technology, so `events/event-bus.ts` can be replaced rather than run in parallel
- Existing audit log table/service, so `audit/audit-log.ts` can be replaced rather than run in parallel

### Reusable services this build produced (for the reconnaissance record)

Everything under `services/`, `modules/`, `api/` in this delivery is new code
written for Part 15 — there was nothing pre-existing to reuse. See
`docs/PART15_INTEGRATION.md` for the full list of what's exposed and how to
wire it to real data.

### Synthetic forecast paths

There are none disguised as real. The single synthetic data source in this
build is `repository/demo/seed.ts`, loudly labeled, isolated behind the
`PlacementDataRepository` interface, and never imported by any service
directly (services only depend on the interface type). Deleting
`repository/demo/` entirely and supplying a real implementation is sufficient
to remove all synthetic data from the runtime path.

### Proposed architecture

See `docs/PART15_INTEGRATION.md` §"Architecture" for the full diagram and
rationale; summarized: a read-only `PlacementDataRepository` interface is the
only thing services depend on, so forecasting/strategy/scenario logic is
testable and correct independent of what database or ORM ends up behind it.
