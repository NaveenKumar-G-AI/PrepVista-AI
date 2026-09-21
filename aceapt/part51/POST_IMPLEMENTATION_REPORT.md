# Feature 51 — Post-Implementation Report

## 1. Files created
47 backend TypeScript files (34 in `src/`, 9 tests, 4 scripts), 8 frontend
TS/TSX files, 2 SQL migrations, plus config (`package.json`, `tsconfig.json`,
`vitest.config.ts`, `.env.example`) and docs (this file, the pre-coding
report, `README.md`). ~5,000 lines of TypeScript total. Full tree in the
README.

## 2. Files modified
None — standalone module, nothing pre-existing to modify (see pre-coding
report on why).

## 3. Existing systems reused
None were available (no repository). What *was* reused: this project's own
established conventions from earlier ACEAPT features — Postgres with
per-role RLS (not SQLite), a deterministic-core/AI-at-the-edges split, an
Anthropic adapter with automatic no-key fallback, and delivery as a
standalone module with a real live-HTTP test walkthrough.

## 4. Accuracy services
`AccuracyProfileService` (profile/dashboard/bottlenecks, read-only),
`AccuracyTrainingEngine` (session lifecycle: start/submit/transition/
complete), `SelfCorrectionService` (self-check, error-spotting,
error-correction), `ErrorPatternIntegrationService` (the error-pattern card
and skill-graph root-cause seam). `AccuracyInterventionService` from the
spec's own §90 list was **not** built as a separate file — its
responsibilities (recording an intervention, describing why) are covered by
`AccuracyTrainingEngine` (recording) and `ErrorPatternIntegrationService`
(describing) respectively; a fifth file would have been a pass-through with
no logic of its own.

## 5. Error integration
Every error type in the §9 taxonomy maps deterministically to an
intervention type (`src/policy/interventionMapping.ts`), recurrence status
is computed from real attempt history (`src/domain/errorClassification.ts`:
isolated/recurring/clustered/resolved/regressed, with the exact §53
resolution thresholds), and first-error localization comes straight off
`stepResults`/`firstErrorStep` on the attempt record.

## 6. Precision training modes
All ten from §31/§47 are supported as the `trainingType` enum
(`FOUNDATION_PRECISION` … `MIXED_PRECISION`) on `accuracy_training_session`.
Mode *selection logic* (deciding which mode a student needs) lives in the
bottleneck ranking + policy engine; the session itself just records which
mode it's running.

## 7. Self-correction implementation
Three exercise types, all graded deterministically per §100 (never by an AI
judgment call): reasonableness checks (`checkReasonableness` — the §65
probability-over-1 example is one of five domain checks), error-spotting
(`submitErrorSpotting`, checked against the attempt's own recorded
`firstErrorStep`), and error-correction (`submitErrorCorrectionChoice`,
implemented as a fix-*category* multiple-choice rather than free-text
grading — an explicit, documented scope decision, not an oversight).

## 8. Database changes
`accuracy_training_session`, `accuracy_training_attempt`,
`accuracy_profile_snapshot`, `accuracy_intervention`, `signal_outbox`, plus
three underscore-prefixed fixture tables. Full DDL, RLS policies, and role
grants in `db/01-schema.sql`; roles in `db/00-roles.sql`.

## 9. API changes
Twelve routes under `/accuracy/*` (see pre-coding report #18) covering every
operation named in §94, plus `/transition` as one generalized endpoint for
advance/pause/resume/abandon/complete rather than five near-identical
endpoints — request body picks the target state, the state machine
validates it either way.

## 10. Frontend components
`CalibrationScale` (the shared visual device — see README), then
`AccuracyDashboard`, `ErrorPatternCard`, `PrecisionTrainingSession`,
`SelfCorrectionExercise`, `ErrorSpottingExercise`. Five of §89's eleven
named components were built as real, working React — the rest
(`PrecisionTrainingSetup`, `AccuracyHeatmap`, `AccuracyFeedback` as a
standalone piece, `AccuracyHistory`, `PrecisionSummary`) were judged
lower-value to build in isolation versus spending that time on backend
correctness and are a natural next slice, not a gap in the design (the data
they'd need — history, heatmap-shaped skill×difficulty grids — already comes
back from `/accuracy/profile`).

## 11. Feature 42-50 integration
Two directions, both real:
- **Inbound** (F51 consumes): eight ports in `src/types/ports.ts` — see the
  pre-coding report for which have working local-data-backed default logic
  (personal mistake bank, error pattern clusters) versus honest placeholders
  (skill graph, formula intelligence, hint/novelty/speed resolution).
- **Outbound** (F51 produces): the `signal_outbox` table plus eight typed
  signal payloads in `src/outbox/signalTypes.ts`, written atomically inside
  the same transaction as the state change that triggered them. Verified
  live: `PRESSURE_REDUCTION_SIGNAL`/`PACE_INCREASE_OK_SIGNAL` (§57/§123-124),
  `TRANSFER_PRECISION_SIGNAL` (§58/§125), `ASSISTANCE_DEPENDENCY_SIGNAL`
  (§59/§126), and `REGRESSION_DETECTED_SIGNAL` (§52/§121) all fire under the
  exact conditions the spec's own worked examples describe.

Both directions are **integration-ready, not integration-verified** against
real F42-50 code — that code doesn't exist in this environment. This is
stated plainly rather than implied away.

## 12. Mastery integration
`MASTERY_EVIDENCE_SIGNAL` emitted on session completion with independent/
timed/novel accuracy and sample size — evidence *for* a real mastery engine
to weigh, never a mastery verdict computed by Feature 51 itself (§82 is
explicit that F51 must not build a second mastery system).

## 13. Retention integration
`RETENTION_EVIDENCE_SIGNAL` emitted the same way, for a real spaced-review
scheduler to consume (§83/§54 — no scheduling logic was built here).

## 14. Analytics
All fifteen §109 event names are wired through the single `track()` seam in
`src/services/analytics.ts`, called from the training engine and
self-correction service at the moments the spec names them.

## 15. Security
Three Postgres roles (owner/app/service); RLS **enabled and forced** on
every Feature 51 table (forced specifically because an earlier feature in
this project caught a table-owner-bypasses-RLS bug — see risk #21 in the
pre-coding report); the app role's queries are scoped via
`set_config('app.student_id', …, true)` inside a transaction. Verified live
with a raw SQL query proving zero rows are visible cross-student, not just
an application-level 404. Auth is an explicit placeholder (bearer token =
student id) with a one-paragraph comment on exactly what to replace.

## 16. Tests added
9 unit test files (70 tests) over the domain/policy/AI-fallback layers, and
one live-HTTP walkthrough script covering the systemic scenarios
(concurrency, RLS, recovery, invalid questions, AI fallback end-to-end).

## 17. Tests passed
**70/70 unit tests passing.** **45/45 live-HTTP checks passing**, against a
real Express server and a real local Postgres instance, including a replay
of the spec's own §143 narrative end to end (wrong answer → feedback →
retry → correct → correct → independent novel problem → complete, with
"independent verification passed" coming back true) and every numbered test
scenario in §112-134 that a standalone module can exercise (§135's full
ACEAPT regression suite needs the rest of the product and doesn't apply
here).

## 18. Build status
`tsc --noEmit` clean on both the backend (`tsconfig.json`) and the frontend
package (`frontend/tsconfig.json`) — zero errors.

## 19. Performance findings
Not load-tested — this module has never seen concurrent traffic beyond the
walkthrough's own parallel double-submit test. Indexes are in place for the
query patterns the services actually use (see pre-coding report #23); no
claim is made beyond that.

## 20. Known limitations
- Every F42-50 port's default adapter is either a working local
  approximation or a documented placeholder — never a claim to be the real
  thing.
- Auth is a placeholder; no real session/JWT verification exists.
- `targetAccuracyPct` (§55-56 guardrail) is a flat constant, not yet
  goal-derived.
- A single short precision-training session (a handful of questions) gives
  an inherently noisy before/after comparison — by design, evidence gating
  reports "insufficient evidence" rather than a misleadingly precise number
  in that situation, but it does mean the §67-style improvement narrative
  needs either a longer session or more historical data to look as clean as
  the spec's own dialogue example.
- Six of the eleven §89 frontend components weren't built (see #10).
- No accessibility audit (screen reader pass, focus management, aria-live
  regions on feedback) was performed — semantic HTML and non-color-only
  status indicators are in place, but that's not the same as a verified
  audit, and it's reported as unverified rather than checked off.
- Question *content* (prompt rendering, per-question-type answer input,
  answer-key grading) is explicitly out of scope — `gradeAnswer` is a prop
  the host app supplies, per §87's "only valid questions contribute" and
  §104's "never leak the answer key" both assuming Feature 51 is not the
  system of record for questions.

## 21. P0/P1/P2 status
**P0 (§136):** all 25 items done, with three flagged as integration-ready-
but-not-integration-verified (Feature 42-50 integration, Mastery
integration, Retention integration — each blocked only by those other
features not existing yet, not by anything unbuilt here) and two flagged as
partially verified (Mobile: layout follows §108's flow but wasn't tested on
a device; Accessibility: semantic and non-color-coded, but not audited).

**P1 (§137):** nine of thirteen items have real, working coverage (error
clusters, strategy/formula/calculation/interpretation/verification accuracy
via the shared error-type+skill slicing model, personal accuracy
guardrails, adaptive precision training, difficulty-aware intervention,
pressure/novel accuracy training, accuracy stability analysis, basic
self-correction). "Advanced" self-correction (beyond the three exercise
types built) and institutional intervention groups were not built — the
former is an open-ended scope the deterministic-grading constraint
naturally bounds, the latter is cohort/admin tooling nobody asked for here.

**P2 (§138):** none built, as instructed — every P2 item is a genuinely
different system (handwriting analysis, voice reasoning, real-time
intervention) that the architecture doesn't foreclose (ports + outbox leave
room to grow into §139-140's future loop) but doesn't pretend to have built
early.

## Real bugs found and fixed along the way
1. **`SET LOCAL` doesn't accept bind parameters.** `SET LOCAL app.student_id
   = $1` is invalid — Postgres's `SET` family takes literals, not query
   parameters, in the `pg` driver. Fixed with `SELECT set_config(
   'app.student_id', $1, true)`, the parameterized equivalent. Caught
   immediately by the first live walkthrough run (every RLS-scoped query
   failed to connect until this was fixed).
2. **Seed data accidentally proved its own domain logic right and its own
   scenario design wrong.** An early version of the demo seed put every
   wrong answer at the start of a batch and every correct answer after.
   §53's resolution rule (3+ errors, then 5+ independent correct answers →
   resolved) correctly classified that as *resolved* rather than the
   *recurring, ongoing* bottleneck the walkthrough was supposed to
   demonstrate. The domain logic was right; the synthetic data didn't match
   the spec's own resolution semantics. Fixed by spreading errors across the
   timeline with one at the very end.
3. **Own explanation copy re-invoked the concept it was told never to
   invoke.** The novelty/transfer signal's reasoning text said "this is a
   transfer signal, not a memorization judgment" — technically compliant
   with never *calling* it memorization, but still naming the concept the
   spec (§19/§58) says belongs entirely to a different feature. A unit test
   written to enforce that rule caught it. Fixed by rewriting the copy to
   never use the word at all, positively or negatively.
4. **Tailwind dynamic class interpolation would have silently produced no
   styling.** `` `border-${statusTone}` `` can't be picked up by Tailwind's
   build-time class scanner, since it only sees the literal template
   string, not the runtime value — the class would be purged from a real
   production build. Caught on review, not by a test (this class of bug
   doesn't fail a component-level check). Fixed with static per-tone class
   lookup objects.
5. **A test's own assumption, not the system, was wrong.** The first
   cross-student security check compared raw accuracy percentages between
   two seeded students and expected them to differ — but both students are
   seeded by the exact same deterministic algorithm, so their percentages
   are supposed to match. Fixed by asserting the thing that actually proves
   isolation: student B's dashboard points at student B's own skill ids,
   never student A's.
