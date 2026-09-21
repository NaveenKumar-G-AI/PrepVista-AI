# Post-implementation report — Feature 57: Personal Shortcut Library

Following the structure the spec itself asks for (sec. 293), condensed to
what's actually true of this build. See `README.md` for how to run it.

## 1–3. Files created / modified / existing systems reused

Nothing modified — this is a new standalone build (see README "About this
build" for why). Everything under `backend/` and `frontend/` is new. Full
layout is in the README "File tour"; roughly 45 backend source files and 15
frontend source files, plus tests.

## 4–7. Formula / skill / question-family integration, and the library itself

Implemented as narrow interfaces + inert stubs in `backend/src/integrations/`
(`formulaClient.ts`, `skillClient.ts`, `questionFamilyClient.ts`,
`difficultyNoveltyClient.ts`, `mistakeIntelligenceClient.ts`). Shortcuts carry
nullable `skill_id` / `formula_id` / `question_family_id` columns ready to be
populated once those features exist. The library itself
(`GET /api/shortcuts/mine`, grouped into Trusted / Developing / Needs review /
Recently added / Worth exploring) is fully implemented — see
`libraryService.getMyShortcuts`.

## 8–9. Student-created shortcut workflow, verification

`POST /api/shortcuts` creates a `STUDENT_CREATED`, `UNVERIFIED` shortcut,
always — regardless of how confident its name or description sounds (tested
explicitly in `test/security.test.ts`, "never auto-verifies..."). If the
student supplied a formula, `POST /api/shortcuts/:id/test` runs real
property-based validation against a canonical expression and records the
result; a wrong formula gets caught (`test/validationService.test.ts`, "flags
a wrong shortcut as NEEDS_REVIEW").

## 10–11. Applicability engine, non-applicability handling

`applicabilityService.evaluateApplicability` — deterministic rule evaluation
producing `APPLICABLE` / `CONDITIONALLY_APPLICABLE` / `NOT_APPLICABLE` /
`UNKNOWN`, with options-dependence and approximation-safety as hard
structural checks that run before declared conditions. Fully unit tested
(`test/applicabilityService.test.ts`, 7 cases).

## 12–13. Strategy discovery, strategy performance

`discoveryService.recordDiscoveryEvidence` — a real but intentionally simple
v1 heuristic (see README "What's partial"). `performanceService.recordUsage`
recomputes accuracy, time-saved ratio, and trust state from a student's
*entire* usage history on every new usage, not just the latest event.

## 14–16. Time/accuracy comparison, personal best strategy

`getPerformanceSummary` returns accuracy, median response time vs. median
baseline time, and a breakdown by difficulty/novelty tag when present.
"Personal best strategy" is implicit in `recommendationService.buildRecommendation`,
which ranks all applicable, trusted/reliable candidates rather than
maintaining a separate "best" field.

## 17–19. Strategy recommendation, switching, regression

`recommendationService.buildRecommendation` — mode-aware (refuses to
recommend anything during `FORMAL_ASSESSMENT` unless explicitly allowed),
never recommends a shortcut with no real time or accuracy benefit over the
student's standard method, and its copy is checked by test never to say
"always use" anything. Regression is detected two ways: live, inline, on
every `recordUsage` call (`performanceService.ts`), and via a batch
`regressionService.scanForRegressions` for cases where evidence changes
without a new usage (e.g. a question gets excluded after the fact). "Strategy
switching" as a trained behavior is covered by the `VERIFICATION` and
`TRANSFER` training activity types, which explicitly present cases where a
shortcut should *not* be used.

## 20–26. The seven training activities

All seven (`RECALL`, `SELECTION`, `APPLICATION`, `VERIFICATION`, `TRANSFER`,
`PRESSURE`, `RETENTION`) are implemented in `trainingService.ts`, each
building its prompt from the shortcut's own stored examples/counterexamples.
`TRANSFER` and `RETENTION` results feed back into
`student_shortcut_states.transfer_evidence` / `retention_evidence` for
display in the detail view.

## 27–35. Feature 45/49–56, Mistake Intelligence, mastery integration

All implemented as stub integration points, not fabricated — see
"About this build" in the README. `difficulty` and `novelty` are accepted as
plain tags on each usage record (so the *storage and reasoning* around them
is real) even though nothing here computes them from scratch. General
mastery/retention scheduling are explicitly left canonical to (non-existent)
Features 36/37/39/40 — Feature 57 only ever writes shortcut-specific
evidence, never a general mastery score.

## 36–37. Database migrations, APIs

`backend/src/db/schema.sql` — 9 tables, described in the README architecture
section and inline in the file. Full route list in `backend/src/api/routes/`;
summarized in the README.

## 38–39. Frontend components, analytics

Frontend: library view (bucketed list + detail panel), personal-shortcut
creation + test flow, discovery banner, an interactive recommendation
playground (lets you change question attributes and mode live), and a
training center. Analytics: every event name from spec sec. 238 is defined
in `analyticsRepository.ts`'s `AnalyticsEventType` and actually logged at the
relevant point in the relevant service — not just declared.

## 40. Security

Covered in the README "Security notes" section: real/dev-fallback auth that
refuses insecure defaults in production, tenant + ownership scoping on every
query (404, not 403, on cross-tenant/cross-student access, so existence
isn't leaked), RBAC on admin routes, zod input validation, and an explicit
prompt-injection test proving a shortcut's own text can't talk the system
into trusting or verifying it.

## 41–42. Tests added / passed

40 tests, 7 files, **all passing**:

```
test/applicabilityService.test.ts   7 tests
test/api.smoke.test.ts              3 tests  (end-to-end HTTP flows)
test/performanceService.test.ts     4 tests
test/recommendationService.test.ts  6 tests
test/security.test.ts               7 tests
test/trust.test.ts                  5 tests
test/validationService.test.ts      8 tests
```

Run with `cd backend && npm test`.

## 43. Build status

`backend`: `npm run typecheck` (strict TS, `noUncheckedIndexedAccess` on) —
clean. `frontend`: `npm run typecheck` and `npm run build` — clean, produces
a working production bundle.

## 44. Performance findings

Not meaningfully applicable at this scale (a from-scratch SQLite-backed
service with no real traffic yet) — noted as a limitation, not measured.
Indexes are in place on every foreign-key-shaped column and on
`(student_id, shortcut_id)` / `(student_id, state)`, which is what the
actual query patterns in the repositories use.

## 45. Known limitations

- Discovery, cohort analytics, and trainer dashboards are intentionally
  partial — see README.
- No real authentication provider is wired in (by design, per your
  instruction to leave keys blank) — `JWT_SECRET` needs to be set, and a
  real login flow built, before this is exposed to real students.
- `npm run demo:simulate` is a dev-only fixture generator, clearly marked as
  such in its own file header — it exists so the frontend has something to
  show without you hand-crafting 20 API calls, not as a stand-in for real
  product data.
- Question generation/selection for training activities is reused from a
  shortcut's own stored examples rather than pulled from a real question
  bank, since Features 53/54 don't exist here.

## 46. P0/P1/P2 status

**P0: complete.** Every checkbox in spec sec. 282 has a corresponding,
tested implementation.

**P1: partial by design** — see README "What's partial" for the specific
list (discovery heuristic depth, cohort/trainer analytics, content-gap
reporting).

**P2: not attempted**, matching the spec's own framing of P2 as
"architect for" rather than "build" (autonomous discovery, multimodal input,
AI-assisted proofs, predictive misuse detection).
