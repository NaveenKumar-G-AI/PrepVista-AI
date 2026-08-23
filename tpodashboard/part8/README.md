# PrepVista — Part 8: Placement Readiness Intelligence (reference build)

This is a working reference implementation of the readiness/risk core of
Part 8, built without access to the real PrepVista repository (Parts
1–7 weren't available in this session). It's meant to be read, tested,
and adapted into your actual codebase — not dropped in as-is.

## Stack, and why

Plain JavaScript (Node, CommonJS), **zero runtime dependencies**. That
was a constraint of the environment this was built in (no package
registry access), but it's also just a reasonable choice for a service
layer like this: no version drift, runs anywhere, easy to port to
TypeScript or another language once it's sitting in your real repo.
`demo/runDemo.js` runs with nothing but `node` — no build step.

The one exception is `frontend/StudentReadinessPage.jsx`, a React
component (the section 19 / 72 "premium student experience"), rendered
separately as an interactive artifact so you can see it live rather
than reading a static mockup.

## Running it

```
npm run demo        # readiness/risk engine — 4 students, the original core
npm run demo:tpo     # funnel/zero-offer-risk/package/drive analytics — 12 students, 8 drives
```

The second script is the bigger one: it runs the full TPO-facing analytics
layer (funnel, zero-offer risk, package/CTC, drive performance, eligibility
quick-wins, season pacing, department equity, offer-holders, action queue)
against a 12-student roster and an 8-drive catalog, and prints every
computed result. As with the core engine, nothing in that output is
hand-written — including two real bugs it caught during development (see
below).

## What changed in the TPO analytics pass

The original build covered *readiness* well but had nothing a TPO
actually opens every morning during placement season. This pass adds
eight services under `src/services/` plus `seasonCalendar.js`:

- **`funnelService.js`** — the registered→eligible→applied→shortlisted→
  interviewed→offered→accepted→joined funnel, season-wide and per
  department, counted from each student's single furthest stage (not
  summed events — that's the classic double-counting bug).
- **`zeroOfferRiskService.js`** — who's trending toward finishing with
  no offer, right now. Combines application/interview activity,
  eligibility breadth, profile completeness, and how far the season has
  already run.
- **`packageAnalyticsService.js`** — average/median/highest/lowest CTC,
  by department, in a distribution.
- **`driveCompanyPerformanceService.js`** — per-company applied→offered
  conversion, gated by minimum sample size.
- **`eligibilityService.js`** — eligibility checks against a drive's
  stated criteria, plus a "quick win" detector that only surfaces
  students blocked by something fixable in days (profile completeness),
  never something that takes a semester (CGPA, backlogs).
- **`seasonPacingService.js`** — current placed % vs. last season's
  curve at the same point — an observed comparison, explicitly not a
  forecast.
- **`departmentEquityService.js`** — departments placing below what
  their own readiness would predict, benchmarked against the
  institution's own median (never an external assumption of "good").
- **`offerHolderService.js`** — students sitting on unconfirmed offers
  past a grace period, who are quietly blocking pool slots under a
  one/two-offer policy.
- **`tpoActionQueueService.js`** — synthesizes all of the above into one
  prioritized "what do I do today" list. Computes nothing itself.

Two real bugs turned up running these against the demo data, both fixed
in place:
1. `riskService.js`'s "repeated assessment failures" check compared a
   student's last two assessments *regardless of subject* — a
   communication assessment between two failed technical ones masked a
   genuine technical losing streak. Fixed to check per-dimension.
2. `zeroOfferRiskService.js` initially had no way to flag a student
   blocked by academics or an incomplete profile — someone with zero
   eligible drives and a half-finished profile scored the same as
   someone who was simply late to apply. Added `NO_ELIGIBLE_DRIVES` and
   `INCOMPLETE_PROFILE` signals so the two read as differently severe,
   which they are.

`frontend/TpoCommandCentre.jsx` is the corresponding UI (spec sections
40, 41, 73) — funnel strip, zero-offer-risk count, package snapshot,
the action queue, and a drive performance table, seeded from the actual
`demo:tpo` output.

## How to integrate

Everything in `src/services/` takes a `repos` object shaped like
`src/repositories/interfaces.js` describes. That's the entire
integration seam:

1. Implement each repository method against your real Part 1–7
   tables/ORM (see `demo/fixtures.js` for a fully worked, if
   fabricated, example of the same shape).
2. Pass your real `repos` into `calculateReadiness`, `calculateRisk`,
   etc. instead of the demo fixtures.
3. Wire `db/migrations/001_readiness_intelligence.sql` into your real
   migration system — the `REFERENCES` lines assume tables named
   `students`/`institutions`/`seasons` that almost certainly don't
   match your actual names.
4. Point your API layer (not built here — see Truth Table) at
   `src/ai/tools.js`, which is the section 56 tool contract.

## Decisions you should sanity-check

The spec is explicit that several numbers are institution decisions,
not engineering constants (sections 13, 16, 38, 67). All of them live
in `src/config/readinessConfig.js`, not scattered through the code:

- Dimension weights (technical 25% / problem solving 15% / ... )
- Readiness bands (READY ≥ 80, etc.)
- Momentum thresholds (±5 points to count as rising/declining)
- Minimum coverage before an overall score is computed at all (50% of
  weight)
- Risk severity by signal count (2 signals → MEDIUM, 4+ → CRITICAL)
- Minimum sample sizes for cohort/outcome statistics (5 / 10)

Treat the current values as a seed to react to, not a recommendation.

## Truth table

**IMPLEMENTED — real, tested logic:**
- Readiness calculation with per-dimension missing-data handling
  (`INSUFFICIENT_DATA` is a real state, never a 0)
- Versioned readiness model (weights/bands/momentum all read from one
  config object tagged with a version string)
- Overall-score coverage gating (won't compute from too thin a slice
  of dimensions)
- Momentum / trend detection against prior snapshots
- Risk signal detection (8 signal types) with a minimum-evidence rule
  before severity can reach MEDIUM+
- Skill-gap calculation that refuses to invent a target when none is
  supplied
- Cohort aggregation with median + sample-size gating
- Readiness × application segmentation
- Readiness × interview/offer rate helpers, with sample-size gating and
  "observed association" language (never causal)
- Pre/post change helper for training & intervention effectiveness
- The section 56 AI tool contract, and section 57 structured insights —
  all of it reads already-computed values, never estimates one
- The student readiness page UI (section 72), interactive, built on
  real computed numbers from the demo run
- Season funnel (registered→joined) at institution and department level
- Zero-offer-risk scoring, weighted by season progress
- Package/CTC analytics — average/median/highest/distribution, by
  department
- Per-drive/company conversion performance, with a minimum-sample gate
- Eligibility checking + the profile-only "quick win" detector
- Season pacing against a prior-season curve (observed comparison, not
  a forecast)
- Department equity flags, benchmarked against the institution's own
  median (never an external "good" assumption)
- Unconfirmed offer-holder detection
- The TPO action queue that synthesizes all of the above
- The TPO Command Centre UI, interactive, built on real numbers from
  `demo:tpo`

**PARTIALLY IMPLEMENTED / SIMPLIFIED:**
- "Recommended next action" is a static lookup from priority dimension
  → action label (`NEXT_ACTION_BY_DIMENSION` in the frontend file). The
  spec doesn't ask for a real recommender here, but don't mistake it
  for one.
- Signal-to-dimension mapping assumes each assessment record already
  carries a `dimension` tag. If your real assessment data doesn't have
  that yet, that tagging is a real piece of work this doesn't cover.
- Risk thresholds (fail score, stale-assessment days, etc.) are
  reasonable seed values, not calibrated against real outcomes.
- Zero-offer-risk and season-pacing both depend on the season calendar
  in `seasonCalendar.js` (dates, prior-season curve) being set correctly
  for your institution — the demo dates and curve are illustrative.
- Drive eligibility criteria (`minCgpa`, `maxBacklogs`, `departments`,
  `minProfileCompletenessPct`) cover the common cases but not every
  criterion a real drive might have (e.g. specific certifications).

**NOT IMPLEMENTED — out of scope this pass:**
- Management dashboard UI (only Student + TPO views were built)
- Student Explorer table (section 41) — filterable, paginated multi-
  student list. The services it would call (`getCohortReadiness`,
  `getHighRiskStudents`, the new funnel/zero-offer functions) all
  exist; the table UI itself doesn't yet.
- Event publishing (section 65), notifications (section 62), audit
  logging (section 66)
- Auth/permissions, and the student-privacy boundary between
  roles (section 55) — nothing here enforces who can call what
- Role-readiness / role-target configuration source (section 25) — the
  skill-gap engine accepts a target profile but nothing generates one
- Forecasting hooks (Part 15), reporting integration (Part 10)
- Any real database — the SQL migration is a schema proposal, not
  connected to anything, and doesn't yet have tables for drives,
  applications, offers, or academic records (only the readiness/risk/
  skill-gap tables from the first pass)
- Tests beyond the two demo scripts (no test framework wired up)
- The hostile-review / red-team passes (sections 75–79) — worth doing
  for real once this is sitting in your actual repo with actual data

## File map

```
src/config/readinessConfig.js          versioned weights/bands/thresholds
src/config/seasonCalendar.js           season dates + prior-season pacing curve
src/repositories/interfaces.js         the integration contract (section 10)
src/services/signalNormalization.js    section 11
src/services/readinessService.js       sections 12, 15, 17, 18, 20-22
src/services/riskService.js            sections 35-38
src/services/skillIntelligenceService.js  sections 23-24, 46
src/services/cohortAnalyticsService.js sections 31-34, 53
src/services/outcomeCorrelationService.js sections 26-30, 54
src/services/eligibilityService.js     eligibility checks + quick-win detection
src/services/funnelService.js          season + per-drive funnel
src/services/zeroOfferRiskService.js   zero-offer risk scoring
src/services/packageAnalyticsService.js  CTC/package analytics
src/services/driveCompanyPerformanceService.js  per-company conversion
src/services/seasonPacingService.js    pacing vs. prior season
src/services/departmentEquityService.js  department equity flags
src/services/offerHolderService.js     unconfirmed offer-holder detection
src/services/tpoActionQueueService.js  the synthesized action queue
src/ai/tools.js                        sections 56-58 + TPO-analytics wrappers
demo/fixtures.js                       12 students, 8 drives, all fabricated
demo/runDemo.js                        proof for the core readiness/risk engine
demo/runTpoAnalyticsDemo.js            proof for the 9 TPO-analytics services
db/migrations/001_readiness_intelligence.sql
frontend/StudentReadinessPage.jsx      sections 19, 72
frontend/TpoCommandCentre.jsx          sections 40, 41, 73
```
