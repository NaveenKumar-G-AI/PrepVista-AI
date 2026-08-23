# PART 7 — HOSTILE REVIEW

Spec §77 asks for this to be adversarial, not a victory lap. Two real bugs
were caught doing exactly that — both are documented in full below because
they're the most concrete evidence for why this was built as real, running,
tested code instead of just described.

## Bugs actually found and fixed this session

### 1. Silent score corruption via a jsonb double-parse (assessment grading)

**Symptom:** an MCQ auto-graded attempt with 2/2 objectively correct answers
scored 0.

**Root cause (confirmed by direct testing, not guessed):** `node-postgres`
already parses `jsonb` columns from wire text into JS values — a stored JSON
string `"4"` comes back from a raw query as the JS string `"4"`. Drizzle's
own jsonb column mapper then re-parses any *string* value it receives. So a
**bare primitive** stored at a jsonb column's top level gets silently
re-coerced a second time: `"4"` becomes the number `4`. `assessmentQuestion.correctAnswer`
was storing bare strings for MCQ answers, so `given === correct` compared a
string to a number and always failed.

**Fix:** store `{ value: T }` instead of a bare `T`. The top-level jsonb
value is then always an object, so neither layer's "is this a string?"
re-parse check ever fires. See `unwrapCorrectAnswer` in
`assessmentService.ts` for the full explanation and mechanism.

**Why it matters beyond this one field:** every other jsonb column in this
schema (`evidence`, `categoryScores`, `skillBreakdown`, `sourceSummary`,
`payload`, `rule`) happens to be safe because they're always objects/arrays,
never bare primitives — but that safety is incidental, not enforced. If you
add a new jsonb column anywhere and store a bare string/number/boolean in
it, this will bite you again. Consider either wrapping all jsonb primitives
by convention, or pinning `drizzle-orm`/`pg` versions where this is fixed
upstream, before extending this schema.

### 2. Auto-graded scores computed, then thrown away

**Symptom:** the same MCQ test kept failing even after fix #1, still scoring 0.

**Root cause:** `submitAttempt` correctly computes `autoScores` for each
MCQ/multi-select question, but then called `finalizeResult({ manualScores: {} , ... })`
— passing an **empty** object instead of the scores it had just computed.
Inside `finalizeResult`, any auto-gradable question not already present in
the supplied scores defaults to 0 ("unanswered"), so every auto-graded
question was scored 0 regardless of correctness, every time `submitAttempt`
triggered automatic finalization.

**Fix:** pass `autoScores` through. One-line change,
`src/services/assessmentService.ts`.

**Why this one is worse than #1:** bug #1 would have thrown a visible error
for many non-numeric answers (`JSON.parse("Paris")` throws) — annoying but
loud. Bug #2 is silent and total: it doesn't corrupt scores, it **zeroes
every auto-graded attempt**, unconditionally, regardless of what the
student answered. Combined, these two bugs would have made the entire
auto-grading path — arguably the most load-bearing piece of the whole
readiness pipeline, since assessment results are the primary evidence type
feeding skill measurements — produce confidently wrong data while returning
a normal-looking 200 response. This is precisely the "confident and wrong"
failure mode the spec's repeated no-fabrication warnings are worried about,
and it happened inside code that looked correct on read-through and passed
type-checking. It was only caught because the test asserted an actual
expected score (100) instead of just asserting the call didn't throw.

**Takeaway for anyone extending this:** don't trust a passing test that only
checks "no error was thrown." The tests in this repo assert specific
numbers for exactly this reason.

### 3. (Minor, caught before it shipped) Test discovery picking up build output

Running `npm run build` then `npm test` without cleaning `dist/` made
Vitest discover and run the *compiled* copies of the test files in
`dist/tests/*.js` in addition to the real ones — same 24 tests, reported
twice, with the compiled copies failing for unrelated module-resolution
reasons. Fixed by excluding `dist/` in `vitest.config.mts`. Low-stakes, but
exactly the kind of thing that produces a confusing red CI run and gets
"fixed" by someone re-running the suite until it's green rather than
understanding why it flaked — worth having actually happened once here.

## Other things attacked, per spec §77's categories

**Readiness — score inconsistency:** `overallScore` is a flat average of
category averages, not weighted by evidence count. A category with 1
measurement counts the same as one with 10. This is a real, documented
simplification (see code comment in `readinessService.ts`), not a bug, but
it's worth a product decision before relying on it at scale.

**Readiness — staleness:** nothing currently triggers `calculateReadiness`
automatically when new evidence arrives (see Integration Notes §3). A
snapshot is only as fresh as the last time someone/something called the
function. This is flagged, not fixed, because "when exactly should
readiness recalculate" is a product decision, not an engineering one.

**Training — attendance self-marking:** `trainingService.recordAttendance`
has no defensive check of its own against a student recording their own
attendance (spec §14) — that protection lives entirely in one place, the
`RECORD_ATTENDANCE` capability list in `lib/permissions.ts` excluding the
STUDENT role. It works today (verified: a student actor hitting
`/api/tpo/training/attendance` gets 403), but it's a single point of
failure — a future route that calls the service directly, bypassing that
middleware, would have no second line of defense. Worth a service-level
guard if this code sees more hands.

**Training — bulk operations aren't transactional:** `bulkEnroll` and
`bulkAssignIntervention` loop one-at-a-time; a failure partway through
leaves a partial result with no rollback. Safe to retry (already-enrolled
students are skipped, not duplicated) but not atomic.

**Assessments — no partial credit:** `MULTI_SELECT` grading is exact-set-match
only; a student who gets 3 of 4 correct options scores 0, same as getting
none right. Documented simplification, not a bug.

**Interventions — duplicate assignment / overdue logic:** both tested
directly (`tests/intervention.test.ts`) — duplicate-active-assignment is
blocked, invalid status transitions are rejected, overdue detection flips
status correctly.

**Privacy — faculty over-visibility:** `VIEW_PLACEMENT_OUTCOMES` deliberately
excludes the FACULTY role (spec §48), verified by the capability matrix in
`lib/permissions.ts`. Management routes never accept a bare student id at
all (verified by reading every route in `management.routes.ts` — there is
no `:studentId`-shaped param anywhere in that file), so there's no row-level
check to forget there.

**Performance — N+1 queries:** present and consciously deferred, not
missed — see Integration Notes §3 for the specific functions and the fix
each one needs before real-scale use.
