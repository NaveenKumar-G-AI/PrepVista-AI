# PrepVista Part 6 — Offers, Joining, Verified Placement Outcome

A reference implementation of the domain covered by the Part 6 build
prompt: Offer → Acceptance → Joining → Verified Placement Outcome.

**Read this before treating anything here as done.** This was built in a
chat sandbox with no network access and no view of the actual PrepVista
repository (Parts 1–5). It is a standalone, integration-ready module, not
a merged, repo-aware implementation — the Part 6 prompt's own Phase 0
("inspect the full repository before coding") could not honestly be
performed here. Treat this as a strong starting point to adapt, not a
drop-in replacement for doing that reconnaissance against your real code.

## Assumptions made (no stack was specified)

- **Node.js + plain JavaScript with JSDoc types** (not TypeScript) — this
  sandbox has Node 22 but no way to `npm install` anything (no network),
  so the tested core deliberately has **zero runtime dependencies** and
  runs on Node's built-in `node --test` / `node:assert`. If your repo is
  already TypeScript, the conversion is mechanical — see the note at the
  bottom of `schemas/offers/types.js`.
- **Postgres-flavored SQL** for the migration (enums, `JSONB`, `CHECK`
  constraints). Written as a reference; **never executed** — there's no
  database in this sandbox.
- **Express-shaped** route handlers in `api/`. Also **never executed** —
  `express` isn't installed and can't be without network access. These
  files exist to show how the tested domain services plug into a REST
  layer, not as verified endpoints.
- **CommonJS** (`require`/`module.exports`) throughout, for zero-config
  portability. Trivial to convert to ESM.
- Currency defaults to INR (`₹`, "LPA" in the original prompt), kept as a
  plain field everywhere so it isn't actually hardcoded.

If your real stack is different (Python/Django, Java/Spring, Ruby/Rails,
etc.), the part worth keeping is the *design* — the state machines, the
policy engine shape, the conflict rules, the outcome-derivation
boundaries — documented below and in code comments; the JS itself would
need a rewrite.

## How this integrates (dependency injection, not a framework)

Every service is a factory function that takes its dependencies as
plain-object arguments — a repo, an event bus, an audit sink, a clock:

```js
const { createOfferService } = require('./services/offers/offerService');

const offerService = createOfferService({
  offerRepo,            // wire to your real DB (see interface used in tests/support/inMemoryRepos.js)
  versionRepo,
  eventBus,              // wire to Part 1's actual event bus
  auditSink,              // wire to Part 1's actual audit service
  hasFinalSelection,      // wire to Part 5's verified final outcome lookup
  multipleOfferPolicy,    // load from institution_offer_policy (see policy/institutionPolicy.example.json)
});
```

Nothing in `services/` imports a database driver, an HTTP framework, or
another part's tables directly — it only knows the shape of the
dependency it's given. This is what makes "Part 6 does not own
student/company/drive/application" (spec section 6) actually true in
code, not just in a document.

## Design decisions the prompt left open (worth validating against policy)

The build prompt gives an explicit status *list* for joining records and
placement outcomes, but not an explicit transition diagram the way it
does for offers. These were filled in as reasoned defaults — check them
against your institution's actual process before relying on them:

- **Joining state graph** (`services/joining/joiningStateMachine.js`):
  `PENDING → CONFIRMED → UNVERIFIED → JOINED`, where `CONFIRMED` is the
  student's own self-report and `UNVERIFIED → JOINED` requires a TPO
  actor (`verifiedBy`/`verifiedAt`) — a student can never reach `JOINED`
  on their own. This directly encodes spec section 33's three-way
  distinction (student confirmation / TPO verification / final outcome).
- **Placement outcome derivation** (`services/joining/placementOutcome.js`):
  only derives the outcomes that are actually computable from one
  offer's + one joining record's state (`PLACED_JOINED`,
  `PLACED_OFFER_ACCEPTED_JOINING_PENDING`, `OFFER_DECLINED`,
  `OFFER_EXPIRED`, `DID_NOT_JOIN`). `SELECTED_NOT_OFFERED`, `UNPLACED`,
  `HIGHER_STUDIES`, `ENTREPRENEURSHIP`, and `NOT_SEEKING` are not
  derivable from offer/joining state alone (e.g. "unplaced" is a
  season-level judgment about a student with no offer at all) — they
  only ever come from an explicit `override`, always tagged
  `source: 'TPO_OVERRIDE'`. This function will never invent one of those
  five on its own.
- **"Verified Placement" KPI is a policy mapping, not a fixed rule**
  (`isVerifiedPlacement()` + `policy/institutionPolicy.example.json`):
  the spec's own sections 36 and 70 are in tension — section 36 gives a
  fixed outcome enum, section 70 says the "verified placement" definition
  must be configurable. Resolved here as: the outcome *enum* is fixed
  system-wide, but *which outcomes count toward the headline KPI* is a
  per-institution config array. Most institutions will list only
  `PLACED_JOINED`; some may also include
  `PLACED_OFFER_ACCEPTED_JOINING_PENDING` for early-season reporting.
- **CTC fixed/variable breakdown is optional**, not required — the
  prompt's own bulk-import example (section 19) only has a single `CTC`
  column. The fixed+variable=total consistency check only runs when a
  breakdown was actually supplied.
- **`statusHistory` is denormalized onto offers and joining records**
  (added when the analytics layer below was built): every status
  transition appends `{status, at}` to the record itself, in addition to
  the full-snapshot `offer_versions` audit trail. This is what makes
  `services/analytics/funnel.js` able to count "offers that ever reached
  VERIFIED" correctly instead of undercounting ones that have since moved
  on to ACCEPTED — see that file's header comment for why this matters.

## Analytics — what a TPO actually operates on, not just the basics

The first pass had thin analytics (a handful of rates, CTC percentiles).
`services/analytics/` goes deeper, directly against spec sections 44-49
and what placement offices actually track in practice:

- **`funnel.js`** — stage-by-stage conversion (not current-status counts,
  which silently undercount — see the file's header comment), **plus the
  offer-to-joining rate and did-not-join rate**, which the original build
  didn't compute at all despite the spec naming both explicitly (section
  44). Also timing: time-to-verify, time-to-decide, time-to-join — all
  derived from `statusHistory`, not a separate event log.
- **`segments.js`** — generic department/batch/role/company comparison.
  One function backs all of them (spec sections 44-46 describe these as
  separate features; they're the same computation over a different key).
  Department/batch need a resolver from the caller since Part 6 doesn't
  own that data.
- **`companyScorecard.js`** — ranks recruiting partners by more than
  volume: acceptance rate, joining rate (of those accepted, how many
  actually joined), decline rate, CTC. A company with 50 offers and a 40%
  joining rate is a worse partner than one with 10 offers and 95% —
  volume alone hides that.
- **`multipleOffers.js`** — spec section 45's "accepted highest vs lower
  offer" made concrete: upgrade/downgrade detection per student, decline
  reason tallies, **offer competition** (which company loses candidates
  to which other company, aggregated across the season — genuinely
  useful context a TPO can't get from a spreadsheet of individual
  offers), and package-spread stats for students juggling multiple offers.
- **`trends.js`** — offers/acceptance over time (week or month buckets),
  and season-over-season comparison (spec section 75: "how does this
  compare with previous season?").
- **`todayDigest.js`** — the concrete answer to spec section 39's "what
  requires action today?": expiring-today/24h/48h, overdue-not-expired,
  joining today/this week, joining evidence awaiting TPO verification,
  and offers stuck in verification past a configurable threshold (an
  operational health signal, not a placement one).
- **`distribution.js`** — CTC stats with **small-group privacy
  suppression built in**, not left as a UI reminder: a group under
  `minGroupSize` (default 5) returns `{suppressed: true}` with *no*
  stats at all, not even min/max, which could still identify individuals
  in a group of 2-3 — direct implementation of spec section 49.
- **`insights.js`** — extends the base AI insight contract with
  `MULTIPLE_OFFERS`, `STALE_VERIFICATION`, and `SEGMENT_DEVIATION`.
  The last one is worded to flag a measured gap, never a cause — same
  "do not infer causes automatically" discipline as spec section 44 and
  the "AI must not decide placement status" rule in section 53.
- **`report.js`** — `buildSeasonReport()` assembles all of the above into
  one management-ready object (spec section 47: don't collapse selected/
  offered/accepted/joined/verified-placed into one number), plus a CSV
  export of the company scorecard for the "hand this to management"
  case (section 63).

None of this required touching `offerService.js`'s or `joiningService.js`'s
public behavior — only additive fields (`statusHistory`) and new,
independent modules that read already-fetched arrays. The 54 original
tests still pass unchanged.

## Truth table

Honest classification, per the prompt's own convention (section 92,
part AI). "Tested" means `npm test` actually exercises it in this repo,
right now — 110 tests, 0 failures.

| Area | Status |
|---|---|
| Offer status state machine + guards | **Implemented & tested** |
| Joining status state machine + guards | **Implemented & tested** |
| Multiple-offer policy engine (configurable, not hardcoded) | **Implemented & tested** |
| Offer conflict detection | **Implemented & tested** |
| Offer domain service (create/verify/publish/accept/decline/correct) | **Implemented & tested**, incl. double-accept race protection |
| Joining domain service (confirm/evidence/TPO-verify/delay/did-not-join) | **Implemented & tested** (timing behavior exercised via analytics tests) |
| Placement outcome derivation + KPI mapping | **Implemented & tested** |
| Bulk import validation (parsed rows → valid/conflicts/errors) | **Implemented & tested** |
| Basic AI-safe read/query contract (offerQueries.js) | **Implemented & tested** |
| Conversion funnel + offer-to-joining rate + timing metrics | **Implemented & tested**, incl. against real service-run timestamps |
| Department/batch/role/company segment comparison | **Implemented & tested** |
| Company scorecard | **Implemented & tested** |
| Multiple-offer analytics (upgrade, competition, decline reasons, spread) | **Implemented & tested** |
| Trends (time-bucketed) + season-over-season comparison | **Implemented & tested** |
| Today digest (expiring/overdue/joining/stale-verification) | **Implemented & tested** |
| CTC distribution with privacy suppression | **Implemented & tested** |
| Advanced AI insight contract (multiple offers, stale verification, segment deviation) | **Implemented & tested** |
| Season report + CSV export | **Implemented & tested** |
| Event contract (names + injected-bus publish helper) | **Implemented**, exercised indirectly via service tests |
| SQL migration | **Written**, never executed — no DB in this sandbox |
| REST API routes (offers, joining) | **Written**, never executed — Express not installed, no network to install it |
| Student offer card / TPO summary / TPO insights panel UI | **Written**, never rendered — no React toolchain available here |
| Raw CSV/XLSX file parsing | **Not included** — deliberately deferred to your existing import stack; `bulkImport.js` starts from already-parsed rows |
| Document storage/upload, OCR/AI extraction from offer letters | **Not included** — depends on Part 1's document system |
| Notifications (deadline reminders, decision emails) | **Not included** — Part 9's job; this module only emits the events Part 9 would consume |
| Auth/tenant isolation enforcement | **Not included** — `authz.requireRole(...)` in `api/` is a stub; real enforcement belongs to Part 1 |
| Accessibility pass on the UI components | **Partial** — focus-visible states and `prefers-reduced-motion` are present; no screen-reader testing was possible here |
| Predictive analytics (e.g. "likely to decline") | **Deliberately not included** — would cross into the "AI must not decide placement status" / "do not infer causes automatically" lines in spec sections 44 and 53. What's here computes rates and flags deviations; it never predicts or explains |
| Gender/diversity breakdowns for accreditation reporting | **Not included** — would need a resolver into student demographic data Part 6 doesn't own, same pattern as department/batch; `compareSegments()` supports it mechanically if you supply that resolver, same privacy-suppression rules would apply |
| Hostile-review / red-team documents as separate deliverables | **Not produced as separate files** — the specific issues those passes are meant to catch (double-accept, silent conflict resolution, student self-verifying joining, CTC left unvalidated, partial-import silence, funnel undercounting) were instead fixed directly in code and covered by tests; see the "Design decisions" and "Analytics" sections above and inline comments for the reasoning trail |

## Running it

```bash
npm test          # node --test "tests/**/*.test.js" — 110 tests, no install required
```

## File map

```
schemas/offers/types.js         Shared enums + JSDoc types (no logic)
events/eventContract.js         Event name constants + injected-bus publish()
services/offers/
  offerStateMachine.js          Status transition allow-list
  conflictDetection.js          Pure conflict checks (spec section 16)
  multipleOfferPolicy.js        Configurable multi-offer rules (section 28/29)
  offerService.js               The one place offer.status may change
  offerQueries.js               Basic read-only / AI-safe contract (section 51/83)
  bulkImport.js                 Parsed-row validation pipeline (section 19/62)
services/joining/
  joiningStateMachine.js        Status transition allow-list
  joiningService.js             The one place joining.status may change
  placementOutcome.js           Terminal-outcome derivation + KPI mapping
services/analytics/
  statUtils.js                  mean/median/percentile/histogram (pure math)
  timeUtils.js                  statusHistory lookups + hour deltas
  distribution.js               CTC stats with privacy suppression
  funnel.js                     Conversion funnel, offer-to-joining rate, timing
  segments.js                   Generic department/batch/role/company comparison
  companyScorecard.js           Per-company acceptance/joining/CTC ranking
  multipleOffers.js             Upgrade detection, competition, decline reasons
  trends.js                     Time-bucketed trend + season-over-season
  todayDigest.js                "What needs attention today" operational view
  insights.js                   Advanced AI insight contract
  report.js                     Season report assembly + CSV export
api/offers/, api/joining/       REST wiring reference (untested, see truth table)
migrations/                     Reference SQL (untested, see truth table)
policy/                         Example institution policy JSON
ui/                             Student offer card, TPO summary, TPO insights panel (untested, see truth table)
tests/                          110 tests covering everything marked "tested" above
module.manifest.json            Spec section 86 manifest
```
