# PrepVista AI — Part 15
## Placement Forecasting + Strategy Engine + Institutional Intelligence

A standalone, integration-ready backend module: real forecasting (two
independent, backtested methods, always returned as a range with stated
confidence), target-vs-actual gap analysis that provably doesn't
double-count, an isolated what-if scenario engine, opportunity/skill/company
intelligence, an explainable recommendation engine, and a hard RBAC boundary
(TPO/MANAGEMENT full access, STUDENT restricted to five personal fields, no
recruiter role anywhere).

**Start here:** `docs/PART15_FINAL_REPORT.md` — the full engineering report,
including an honest truth table of what's real vs. what's a documented
integration seam. If you're integrating this into an existing PrepVista
codebase, go straight to `docs/PART15_INTEGRATION.md` instead.

## Quick start

```bash
npm install
npm run typecheck   # clean, zero errors
npm test              # 27/27 passing — real logic, no mocking framework
npm run demo           # runs the full TPO/management/student walkthrough end-to-end
```

## The one thing to know before reading any code

Every service in this module depends on exactly one interface —
`PlacementDataRepository` (`repository/PlacementDataRepository.ts`) — never
on a database, an ORM, or the demo data directly. The demo data
(`repository/demo/`) is synthetic, loudly labeled, and swappable:

```ts
import { bootstrap } from "./index.js";
import { YourRealRepository } from "./your-real-repository.js";

const { services, aiTools, api } = bootstrap(new YourRealRepository(db));
```

Nothing else changes. See `docs/PART15_INTEGRATION.md` for the full guide.

## Directory structure

```
modules/forecasting/    modules/strategy/    modules/scenarios/   <- Part 12 AI tool surface + module registration
services/forecast/      services/strategy/   services/scenario/
services/opportunity-intelligence/                                <- all business logic lives here
api/forecast/           api/strategy/                             <- framework-agnostic HTTP handlers
repository/                                                        <- the PlacementDataRepository interface + demo impl
types/placement-strategy.types.ts                                  <- every shared type, one file
rbac/  events/  audit/                                              <- cross-cutting infrastructure
tests/forecast/         tests/strategy/                            <- 27 tests, real logic
migrations/                                                         <- Postgres-flavored SQL schema
demo/run-demo.ts                                                    <- end-to-end walkthrough, run it yourself
docs/                                                                <- reconnaissance, research, hostile review, integration, final report
```

This layout deliberately mirrors the merge-safety ownership paths from the
build spec (`modules/forecasting/**`, `services/forecast/**`,
`api/strategy/**`, etc.) so it can overlay directly onto an existing
monorepo without restructuring.

## Docs

| File | What's in it |
|---|---|
| `docs/PART15_FINAL_REPORT.md` | Full engineering report + truth table — read this first |
| `docs/PART15_INTEGRATION.md` | How to actually wire this into a real system |
| `docs/PART15_HOSTILE_REVIEW.md` | 10 findings from an adversarial pass, 6 fixed live, 4 deferred with reasoning |
| `docs/PART15_RESEARCH.md` | Cited methodology grounding (weighted-pipeline forecasting, empirical Bayes shrinkage, walk-forward backtesting) |
| `docs/PART15_RESEARCH_UPGRADE.md` | Follow-up research triggered by the hostile review |
| `docs/PART15_RECONNAISSANCE.md` | Honest note on what could/couldn't be inspected, since no Parts 1-14 repository was available |

## What this is not

No UI was built — this is the data/service/API/AI-tool layer only. No real
database is connected — `repository/demo/` is synthetic and clearly marked
as such throughout. No Part 12/13/14 code was available to wire against, so
the integration points (`ActionSystemAdapter`, the AI tool surface, the
event bus) are contracts to implement against, not live connections. All of
this is spelled out precisely in the Truth Table at the end of
`docs/PART15_FINAL_REPORT.md` — nothing here is presented as more finished
than it is.
