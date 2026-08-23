# PrepVista AI — Part 5: Interviews & Results
### Engineering report

---

## A. Executive summary

This is a working, tested implementation of the student ↔ TPO interview
and results domain: scheduling, attendance, versioned result entry,
CSV import with real validation, staged publication (internal → TPO
review → published-to-student), round progression, audit, events,
readiness-vs-outcome analytics with a data-sufficiency gate, and an AI
insight contract that is structurally barred from ever deciding a
result. It ships as a standalone Python package with a real SQLite
schema, a 15-test automated suite (all passing), a thin Flask HTTP
adapter that was actually started and curled, and an interactive
React UI prototype covering the TPO and student experiences.

**The one caveat that shapes everything else in this report:** no
PrepVista repository was available in this conversation. The build
prompt's Phase 0 ("inspect the entire repository") assumes Parts 1–4
already exist as real code to reconcile against. They don't exist
here, so this is a **standalone reference module**, not a merge into
a live codebase. Section T and the Truth Table below are explicit
about what that does and doesn't change.

## B. Product boundary confirmation

Student + TPO + Management only. Recruiters never authenticate, never
see a portal, never submit a scorecard. Results arrive at the
institution externally and are entered or imported by the TPO — see
`import_pipeline.py`. This was checked, not just stated: nothing in
the schema, services, or UI has a recruiter-facing surface.

## C. Student journey (implemented, in `services.py` + the UI's Student tab)

Upcoming → confirm / report an issue → (interview happens externally)
→ Pending Result → Published Result, with exact copy per outcome:

- **PASS** — "Congratulations — you've progressed to the next round."
- **FAIL** — "Not selected for the next stage."
- **HOLD** — "Result pending further review. The TPO will update you
  when a decision is available."

A student can never see another student's interview (tested — see
Section AD), and never sees a result before the TPO publishes it,
even if it already exists internally (tested).

## D. TPO journey (implemented, in `services.py` + the UI's TPO tabs)

Overview metrics → Interview list (filterable) → Interview detail
(attendance, result entry, issue resolution, version history) →
Results Pending workbench → Import (validate → preview → commit) →
Review & Publish (with a confirmation step showing exactly what will
happen) → round progression count.

## E. Management view

`analytics.py` exposes department/batch breakdown, round conversion,
turnaround, and the gated readiness-vs-outcome comparison — all
aggregate, no student-level drill-down required. A dedicated
management UI screen was not built in this pass (see Truth Table);
the data layer it would sit on is real and tested.

## F. Before vs after

Not applicable — this is a greenfield standalone build, not a change
against an existing codebase (see the Phase 0 caveat in Section A).

## G. Database models

Two clearly separated groups in `interviews/db.py`:

- **Part-5-owned:** `interviews`, `interview_results` (versioned,
  never mutated in place), `round_executions`, `interview_issues`,
  `reschedule_requests`, `audit_log`, `event_log`.
- **Upstream stubs** (stand in for Parts 1/2/3/4 so this module runs
  standalone): `institutions`, `students`, `drives`, `source_rounds`,
  `applications`, `readiness_scores_stub`. Nothing outside
  `seed_demo.py` writes to these. In a real merge every read against
  them becomes a foreign key or a service call into the real Part
  1/3/4 systems.

## H. API endpoints

`api_flask.py` is a thin, explicitly-labeled example adapter — real
PrepVista almost certainly has its own HTTP framework and auth
middleware already (a Phase-0 finding this build can't make). It was
started for real and hit with real HTTP requests (see Section AD):
`GET/POST /api/interviews*`, `/api/results/review`,
`/api/results/publish`, `/api/results/import/preview`,
`/api/students/:id/dashboard`, `/api/analytics`,
`/api/command-centre`. The `interviews/` package itself has zero
Flask dependency — swap the adapter, keep everything else.

## I. Interview lifecycle

Nine states (`SCHEDULED → CONFIRMED → ATTENDED → COMPLETED →
RESULT_PENDING → RESULT_PUBLISHED`, plus `NO_SHOW`, `CANCELLED`,
`RESCHEDULED`), every transition validated by `state_machine.py`.
Nothing writes `interview_status` directly — see Section W for the
real bug this caught during development.

## J. Attendance

`PRESENT / LATE / ABSENT / EXCUSED`, TPO-recorded only. `PRESENT`/
`LATE` walk the lifecycle through `ATTENDED → COMPLETED` (both real,
distinct states); `ABSENT` moves to `NO_SHOW`. Every update is
audited.

## K. Result management

`enter_result()` refuses to touch an already-published result —
`correct_result()` is the only path once published, and it always
creates a new version (never an in-place UPDATE) with a required
reason. If the prior version was already visible to a student, the
correction auto-publishes rather than sitting internally (there's no
un-showing a result, so the right move is getting the fix in front of
the student fast).

## L. Result import

Real CSV parsing (Python's `csv` module server-side; PapaParse
client-side in the UI prototype), validated row by row against actual
students/interviews already in the system: unknown register number,
duplicate row within the file, and conflict against an
already-published different result are all detected and reported —
never silently dropped, never silently overwritten. Only rows that
pass validation are committed; the rest come back in an explicit
report. Demonstrated end to end in `demo_walkthrough.py` with a file
containing exactly one of each failure type plus 12 valid rows.

## M. Result publication

Three-stage: `INTERNAL_RESULT → TPO_REVIEWED → PUBLISHED_TO_STUDENT`.
`publish_preview()` shows what a publish action will actually do
before it happens (ready / missing / not-yet-reviewed counts); the UI
requires an explicit confirmation naming the number of students who
will receive results. Publish is idempotent — republishing an
already-published interview is a safe no-op, tested under a simulated
double-click.

## N. Round progression

`round_progression()` returns the real count and list of students with
a published PASS on a given round. Part 5 does not auto-schedule the
next round (that's a deliberate TPO decision, made through the normal
`create_interview()` call) — this was a design choice, not an
oversight.

## O. Existing PrepVista readiness integration

Represented as `readiness_scores_stub` — read-only, clearly commented
as standing in for the real mock-interview/readiness system. Never
merged with real interview outcomes; the two are joined only inside
`analytics.readiness_vs_outcome()`, and only for read purposes.

## P. Readiness vs actual interview outcome

Implemented with the data-sufficiency gate the spec calls for: each
readiness bucket (80+/70–79/60–69/<60) reports a real pass rate only
once it has at least 5 published outcomes; below that it returns "Not
enough verified outcomes yet." rather than a number. Both branches
were exercised in the demo run against the seeded data.

## Q. Analytics

Attendance rate, pass/fail/hold rate, round conversion, result
turnaround (computed from the *actual* audit-logged completion
timestamp to the actual `published_at`, not estimated), department
and batch breakdown, and repeated-non-advancement (≥3 published
interviews, zero passes) — framed as a pattern to look into, not a
label on the student, both in the data shape and in the AI insight
copy that would surface it.

## R. Events

All 18 events from the spec's contract are defined and actually
emitted at the right points (`events.py` / `enums.py`) — verified by
inspecting `event_log` after the demo run, not just by reading the
code.

## S. Audit

Every mutation is audited with actor/action/old/new/reason/timestamp,
and — after a real bug was caught and fixed (Section W) — the audit
write is now guaranteed atomic with the change it describes, because
they share one open transaction instead of two separate ones.

## T. Security

Row-level scope check (`assert_can_view_interview`) plus a separate
scrub step (`scrub_interview_for_student`) so "allowed to see the row"
and "allowed to see every field in the row" are two different checks
— a student's view can never contain internal TPO remarks, an
unpublished result, or another student's data. The "change the ID"
attack from the spec's own hostile-review checklist was tested twice:
once in the unit suite, once as a live HTTP request against the
running Flask server, and blocked both times with a 403.

## U. Performance

Indexes on `drive_id`, `student_id`, `scheduled_at`, `interview_status`,
`institution_id`, and `(interview_id, is_current)` on results.
Server-side filtering and pagination (`limit`/`offset`) on the list
query. **Not** load-tested at the spec's "3,000 students" scale — see
Truth Table.

## V. Accessibility

Not audited in this pass (no screen-reader or keyboard-navigation
pass was performed on the UI prototype). Status is always shown as
icon + color + label together, never color alone, which helps but
isn't a substitute for a real audit.

## W. Hostile review — real findings, actually caught and fixed

This section is deliberately specific rather than a checklist,
because the specific bugs are the useful part:

1. **Nested-transaction deadlock risk.** `audit.record()` and
   `events.emit()` originally opened their own SQLite connection each.
   Called from inside another function's still-open write transaction,
   the second writer would contend for the first's lock. Fixed by
   threading one connection through an entire operation instead of
   opening a second.
2. **Attendance chaining bug.** Marking `PRESENT`/`LATE` tried to jump
   straight from `SCHEDULED` to `COMPLETED`, which the state machine
   correctly rejects (`ATTENDED` is a required intermediate state) —
   but the rejection was being silently swallowed by a broad
   `except InvalidTransitionError: pass`, so `interview_status` stayed
   stale (`SCHEDULED`) even though attendance had been recorded. That
   silent failure would have broken the Results Pending workbench
   (which filters on status) without ever raising an error. Fixed by
   chaining `SCHEDULED/CONFIRMED → ATTENDED → COMPLETED` explicitly.
3. **Concurrency check used the wrong counter.** The optimistic-lock
   guard checked `sqlite3.Connection.total_changes`, which is
   cumulative for the connection's whole lifetime, not the last
   statement — so it could never actually detect a stale write. Fixed
   to check the specific `UPDATE` statement's `rowcount`.
4. **A join bug the demo run caught, that a code read wouldn't have.**
   `round_executions` doesn't own a `name` column (it shouldn't —
   that's Part 3's `source_rounds` data) but two call sites read
   `round["name"]` directly on it. Both crashed on the first real
   `demo_walkthrough.py` run and were fixed to join through
   `source_rounds` properly.
5. **A raw UPDATE bypassing the whole audit/state-machine path** was
   found in the seed script's cancellation logic — exactly the kind of
   shortcut the spec warns about. Replaced with a proper
   `cancel_interview()` function so cancellation gets the same
   guarantees as every other transition.
6. **Four test-design bugs, not system bugs** — caught by actually
   running the suite: tests asserting the wrong exception class, and
   two tests whose fixture assumptions (which interview is "first",
   which two "different" students) turned out to be wrong once the
   full seed dataset existed. Rewritten to assert what they actually
   meant to test rather than loosened to pass.

Nothing above was found by inspection alone — all six came from
actually running the code and its tests, which is the whole argument
for not trusting a Truth Table that wasn't earned.

## X–Y. Research / research-upgrade

No external research phase was run. This build is an implementation
of an already fully-specified domain (the 84-section prompt), not an
open design question — the judgment calls that came up (timezone
storage, the ATTENDED/COMPLETED split, audit atomicity) were resolved
by engineering the correct answer directly rather than researching
prior art.

## Z. Integration with Part 6

`part6_contract.py`: `get_final_selected_candidates`,
`get_approved_final_results`, `get_student_final_interview_outcome` —
all read-only, all tested against the seeded data, none of them
capable of writing back into Part 5's tables.

## AA. Integration with Part 8 (analytics)

Everything Section 57 of the spec asks for exists in `analytics.py` /
`services.py` under the same or an equivalent name.

## AB. Integration with Part 9 (communication)

Not built here by design — this module only emits the event contract
(Section R); notification delivery is explicitly Part 9's job per the
spec.

## AC. AI tool contracts

`ai_contract.py` builds the exact insight shapes from the spec
(`RESULT_PENDING`, `INTERVIEW_ISSUE`, `RESULT_CONFLICT`,
`REPEATED_NON_ADVANCEMENT_PATTERN`). Each builder runs through
`_assert_not_a_decision()`, which raises if the object ever contains a
`result`/`decision`/`verdict`/`outcome` key or a bare PASS/FAIL/HOLD
value — the "AI must not decide the result" rule is enforced by the
code failing loudly, not just by a comment saying so.

## AD. Tests and results

`python3 -m unittest tests.test_part5 -v` — **15/15 passing**,
covering: illegal state transitions rejected, a cancelled interview
staying terminal, a result invisible to the student until published
(checked at both the internal and reviewed stages), silent overwrite
of a published result blocked, correction requiring a reason,
correction preserving full version history, CSV validation correctly
bucketing unknown/duplicate/conflict rows, import commit never
writing more than what validated, a malformed file rejected before
any write, cross-student access denied, cross-institution access
denied, the scrubbed view excluding internal fields, a stale-version
write rejected, idempotent publish not double-firing, and an
unpublished PASS correctly not counting toward round progression.

The Flask adapter was also exercised live (not just unit-tested):
started on port 5057, hit with real `curl` requests, including a
student attempting another student's interview over actual HTTP —
correctly returned `403 access_denied`.

## AE. Demo walkthrough

`demo_walkthrough.py` runs the full lifecycle end to end against the
seeded data and prints real, computed output at every step: TPO
overview → results-pending workbench → review → publish (with a
preview first) → round progression → a genuine import conflict
detected and resolved via `correct_result()` (with the full version
history printed) → three students seeing three different real
outcomes → the cross-student security check → all analytics →
AI insight objects → audit trail → recent events. Exit code 0, no
exceptions, on the version included in this delivery.

## AF. Truth table

**IMPLEMENTED** (built and verified — tested, or run and inspected):
interview scheduling/cancel/confirm; three-track status model with
state-machine guards; attendance recording incl. the
ATTENDED→COMPLETED chain; versioned result entry and correction;
staged publication with preview and idempotent publish; CSV import
with unknown/duplicate/conflict detection and an explicit commit
report; round progression query; student-facing scrubbing; row- and
institution-level access control; atomic audit trail; full event
contract; attendance/result/conversion/turnaround/department/batch
analytics; gated readiness-vs-outcome; repeated-non-advancement
pattern; AI insight contract with structural decision-guard; Part 6
read hooks; optimistic concurrency; 15-test automated suite; a real
(started, curled) Flask adapter; an interactive TPO+Student React UI.

**PARTIALLY IMPLEMENTED:** reschedule requests (recorded and visible,
but no TPO accept/decline action wired up yet); audit history is
correct per result-version but not yet stitched into one
cross-version timeline in a single call; the UI's CSV-conflict rule
is a stricter simplification of the backend's precise
"only-if-already-published" conflict rule.

**DEVELOPMENT/TEST ONLY:** SQLite as the datastore; `seed_demo.py`
fixtures; `api_flask.py`'s header-based actor identification
(explicitly not real auth).

**NOT IMPLEMENTED:** Phase-0 integration against a real PrepVista
repository (none was available — see Section A); XLSX import (CSV
only); institution-configurable result vocabulary; accessibility
audit; load testing at the spec's 3,000-student scale; a dedicated
Management UI screen (the data layer exists and is tested; no screen
was built); real multi-tenant auth/SSO; notification delivery
(correctly out of scope, belongs to Part 9).
