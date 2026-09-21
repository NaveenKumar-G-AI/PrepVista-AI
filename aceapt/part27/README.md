# ACEAPT Forecast — Feature 27

Predictive readiness, trajectory, risk, and scenario engine for PrepVista's ACEAPT, built from the Feature 27 master spec.

## Before anything else: what this is and isn't

No existing PrepVista/ACEAPT codebase was available in the session this was built in — only the spec document. So this **is not** "Feature 27 wired into your real Features 24–26, your real DB, your real auth, your real design system." What it **is**: a complete, tested, working implementation of every engine the spec describes (capability model, gap engine, trajectory/trend/momentum, evidence confidence, forecast, risk, practice-vs-assessment & failure-boundary detection, scenarios, readiness state machine, explainability), an orchestrator that wires them into the exact closed loop the spec describes, a real HTTP API, a real React UI, and a real test suite — all built behind **three narrow, clearly-marked seams** standing in for your existing systems. Wire those three seams to the real thing and nothing else in this package should need to change.

Every number in this README and in `npm run seed:demo`'s output was computed by the actual code, not written by hand — see [`ARCHITECTURE.md`](./ARCHITECTURE.md) for exactly how each spec section maps to a file, and what judgment calls were made where the spec left something open (they're all called out explicitly, not hidden).

## Quick start

```bash
npm install
npm run typecheck            # backend
npm run typecheck:frontend   # frontend components, in isolation
npm test                     # 57 tests across every engine + a full integration run
npm run seed:demo            # runs the actual Startupthon demo loop (spec section 66) end to end
npm run dev                  # starts the API on :4027, seeded with the same demo student
```

With the dev server running:

```bash
curl -H "x-dev-student-id: demo-student" http://localhost:4027/api/v1/students/demo-student/forecast
```

## The three integration seams

Everything else in `src/` depends only on these interfaces — not on any concrete implementation — so this is the entire integration surface:

| Interface | File | Replace with |
|---|---|---|
| `PlatformEvidenceGateway` | `src/integration/platformEvidenceGateway.ts` | Real reads from your mastery system, Feature 24 (Retention), Feature 25 (Transfer), attempt tracking, and the assessment engine. The provided `InMemoryPlatformEvidenceGateway` is fixture-backed, dev/test/demo only. |
| `Feature26AdaptAdapter` | `src/integration/feature26AdaptAdapter.ts` | A real call into Feature 26 (Adapt). The provided `MockFeature26AdaptAdapter` fabricates a plausible plan shape so the closed loop can be demoed without a real Feature 26 to call. |
| `ForecastRepository` | `src/repository/forecastRepository.ts` | Your real DB/ORM, once you've decided where `ReadinessSnapshot` / `ForecastSnapshot` etc. live in the existing schema (spec section 58 says to inspect that schema first — we couldn't, so this stays storage-agnostic). |

All three are wired together in `src/api/deps.ts` — that's the one file that decides which concrete class backs each interface. `src/events/eventBus.ts` (a plain `EventEmitter`) is a fourth, lower-stakes seam if you want forecast recalculation driven by your real event/queue bus instead.

Auth is **not** a seam to reimplement from scratch — `src/api/middleware.ts` has a clearly-labeled dev-only fallback that populates `req.user` from a header; delete it and mount your real PrepVista auth in its place. Every route only depends on `req.user` being populated, not on how.

## Environment / secrets

Copy `.env.example` to `.env`. Everything in it is blank or a safe default — nothing was invented. Notably:

- `AI_PROVIDER_API_KEY` / `AI_PROVIDER_ENABLED` — the AI explanation layer (see below) works with these left blank; it just falls back to deterministic text.
- `DATABASE_URL`, `AUTH_*` — unused until you swap in real implementations at the seams above.

## What's deterministic vs. what AI touches

Per spec section 56: **every number is deterministic.** Readiness, the forecast range, status, confidence, and risk ranking are all plain TypeScript math in `src/engines/*` — no LLM call is anywhere near them, and there's a code-level guard (`guardAgainstEmploymentClaims` in `src/utils/format.ts`) that blocks any AI-generated text from asserting an employment/placement outcome, on top of the system prompt telling it not to (spec sections 19 & 56 are both enforced, not just documented). The only optional AI involvement is rephrasing the already-computed "Why" evidence into more natural prose (`src/integration/aiExplanationProvider.ts`) — disabled by default, and every code path works correctly without it.

## API

Base path `/api/v1`. All student routes require `req.user` (self or a `trainer`/`tpo`/`admin` role); cohort routes require `tpo`/`admin`.

| Method | Path | Returns |
|---|---|---|
| GET | `/students/:id/readiness` | Capability snapshot + overall readiness + status |
| GET | `/students/:id/forecast` | Projected range, status, confidence (cached when fresh — section 61) |
| GET | `/students/:id/trajectory` | Overall + per-dimension trend and momentum |
| GET | `/students/:id/risks` | Ranked risks, main factor, Why panel, roadmap |
| GET | `/students/:id/forecast-history` | Stored snapshots over time (section 40) |
| GET | `/students/:id/scenarios` | "What if" projections (section 35-37) |
| POST | `/students/:id/recalculate` | Forces a fresh pipeline run |
| POST | `/students/:id/fix-my-readiness` | Hands the top gap to Feature 26, returns the plan |
| GET | `/cohorts/:id/forecast` | Aggregated cohort readiness (TPO view, section 51-52) |

## Frontend

`frontend/` is meant to be copied into your existing PrepVista React app (it's deliberately dependency-light: React only, no chart library, no Tailwind requirement — the trajectory visuals are hand-rolled SVG so there's nothing extra to install).

```tsx
import "./aceapt-forecast.css"; // once, at your app root
import { ForecastScreen, useForecastApi } from "./ForecastScreen";

function StudentForecastPage({ studentId }: { studentId: string }) {
  const { data, fixMyReadiness, fixingReadiness } = useForecastApi({ studentId });
  if (!data) return null;
  return <ForecastScreen data={data} onFixMyReadiness={fixMyReadiness} fixReadinessLoading={fixingReadiness} />;
}
```

Each piece (`ReadinessCard`, `ReadinessProfile`, `TrajectoryChart`, `WhyPanel`, `PlanPanel`) is also exported individually if you'd rather compose your own layout around your existing design system — `useForecastApi` is one illustrative way to fetch the data; swap it for your app's existing data layer if it has one (React Query, SWR, a generated client, etc.), the components only need a `ForecastScreenData` prop.

## Testing

```bash
npm test
```

57 tests across 9 files: every engine has focused unit tests (including the trickier cases — e.g. the flat-series STAGNATION-vs-STABILITY distinction, and the failure-boundary classification against the spec's own worked "combined novelty + time pressure" example), plus an integration test that runs the full closed loop — evidence → capability → trajectory → forecast → risk → Fix My Readiness → simulated new evidence → reforecast — end to end against the seeded fixtures.

## What was intentionally left out

Per spec section 70/71 (build order + "do not build"), and general scope discipline for a first pass:

- **Institutional/TPO UI** — the cohort aggregation *service* and *API endpoint* are real (`src/services/cohortForecastService.ts`), but there's no dedicated TPO dashboard screen, just the data it would need.
- **Real auth, real DB, real event bus** — see the seams above; building throwaway versions of these would just be more code to delete later.
- **AI content validation** (spec section 57) — that's about validating content Feature 26 *generates*, which lives in Feature 26, not here.
- **A full design-system integration** — the CSS uses its own namespaced tokens (`--af-*`) rather than assuming your existing tokens, since we don't have them; swapping the class names for your design system's components is a styling exercise, not a logic one.
