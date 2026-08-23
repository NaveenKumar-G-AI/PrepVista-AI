# Part 10 — Hostile Engineering Review

This review covers what was **actually built** in this pass: the Evidence
Vault, Metric Definitions, Report Snapshots, the executive/department/
company reporting layer, and the data-quality engine — backed by 19
automated tests and a live HTTP smoke test against seeded data.

It does **not** cover the full 85-section spec. Section "What Was Not
Built" at the bottom is the honest boundary — see `PART10_INTEGRATION.md`
for what a full build-out would still need.

Two real issues turned up during this review and were fixed on the spot
(marked `[FIXED]`); the rest are open findings with severity and a
recommendation.

---

## CRITICAL

**C1. Authentication is a placeholder.**
`requireRole` in `src/api/routes.ts` reads a client-supplied
`x-prepvista-role` header. This is trivially spoofable and exists ONLY so
the permission boundaries (section 57/58) have somewhere concrete to be
enforced and tested. **This must be replaced by your real Parts 1-9
session/auth layer before any real deployment.** Nothing else in the
service layer depends on this header — only the route layer does — so
the swap is contained to `routes.ts`.

---

## HIGH

**H1. `[FIXED]` Offer/Student `findById` was not institution-scoped.**
Found during this review: `OfferRepository.findById(id)` and
`StudentRepository.findById(id)` took no `institutionId`, so a caller
that trusted a URL's `:institutionId` without cross-checking the
returned row's own `institutionId` could leak another institution's
record by guessing/enumerating an id. No current API route actually
called this path (it was reachable only through the unused
`ReportingService.listOffersFor`), so this was not an active
vulnerability today — but it was a landmine for the next person who
wires up an endpoint. **Fixed**: both methods now require
`institutionId` and filter by it (`WHERE id = ? AND institution_id = ?`);
`listOffersFor` was updated to pass it through. Recommend adding a
regression test that asserts cross-institution `findById` calls return
`null` before this code is extended further.

**H2. No persistent audit log.**
Section 56 asks for report creation, generation, publication, export,
evidence verification, and metric/report-definition changes to be
audited. None of that is written anywhere right now beyond
`report_snapshots.generated_by/generated_at`. Status: **not
implemented**. Recommend an `audit_log` table + a thin
`AuditService.record(event, actor, entityRef)` called from the same
places `REPORT_PUBLISHED` / `EVIDENCE_VERIFIED` events would fire
(section 55) — the two belong together.

**H3. No PDF/XLSX export.**
Only the JSON payload (live draft) and the frozen snapshot (JSON) exist.
Section 33-35's PDF/Excel generation is genuinely a separate, sizeable
piece of work (layout, branding, pagination) and was deliberately left
out of this pass rather than faked with a low-effort implementation.
`ReportGenerationService`'s output is a plain JSON tree, which is exactly
what a PDF/XLSX renderer needs as input — that renderer just doesn't
exist yet.

**H4. Reports compute synchronously; no async job queue.**
Section 60 asks for background generation for large reports. At the
tested scale (~300-600 students/season) every endpoint responded in low
tens of milliseconds, so this isn't a problem yet (see Performance
below). It **will** become one well before "tens of thousands of
students," since `getDepartmentPerformance` currently recomputes the
full funnel once per department rather than once total. Recommend
profiling against real institutional scale before deciding whether a
queue is actually needed, rather than building one preemptively.

---

## MEDIUM

**M1. `[PARTIALLY FIXED]` Duplicate-student detection is a coarse
name+department heuristic.**
Found during this review: the demo's small first/last name pool (30×15)
produced ~18 incidental name collisions across ~300 seeded students —
enough false positives to bury any real signal. **Fixed** for the demo
by widening the name pool (83×30), which dropped the count to a more
plausible 6. The underlying heuristic (name + department, case-folded)
is still coarse. In real integration this should be strengthened with a
roll number / admission ID match as the primary signal, keeping
name-similarity as a secondary fuzzy check — name-only matching will
always have some irreducible false-positive rate, which is exactly why
it's surfaced as `severity: "info"` with "review before publishing"
rather than as a blocking error.

**M2. Metric formulas are a code registry, not a no-code formula
engine.**
`metric_definitions.formula_definition` is human-readable text shown on
every report; the actual computation is a named, versioned function in
`metricService.ts` (`calculator_key`). This was a deliberate trade-off —
seev the design note at the top of that file — favoring testability and
safety over full no-code configurability. Section 10 asks for
"configurable institutional definitions"; this pass delivers
configurable *selection and versioning* of definitions, not an
open-ended formula DSL. Institutions needing a genuinely novel metric
require a code change (add a calculator function + a `metric_definition`
row), not just a UI action.

**M3. Student-facing and TPO-facing student-level reports not built.**
Sections 41-43 ("My Placement Journey", TPO student report, management
student summary) are unimplemented in this pass. The data model
supports them (every student/application/offer/joining record already
carries what those reports would need), but no report-assembly method or
route exists yet.

**M4. Training / Readiness / Communication reports not built.**
Sections 19-22. Same situation as M3 — schema and evidence/metric
patterns extend cleanly to these, nothing was built.

**M5. Management review comments and decision log have tables but no
API.**
`management_review_comments` and `decision_log` (section 38/39) exist as
migrations only. No repository or route was built for them in this pass.

---

## LOW

**L1.** CTC is assumed to be LPA (Lakhs Per Annum) with no currency/locale
config.
**L2.** `season` is a free-text string, not a first-class entity with its
own start/end dates — fine for the comparison logic implemented here, but
would need a real table if seasons need their own metadata later.
**L3.** No rate limiting on the API.

---

## What was verified, and how

**19 automated tests** (`npm test`), specifically covering:
- Every KPI calculator (`placement_rate`, `median_ctc`, `average_ctc`,
  `highest_ctc`) against hand-counted fixtures, including odd/even
  median edge cases and the small-sample caution threshold.
- The full 10-stage funnel against a hand-built fixture where every
  stage count and conversion percentage was computed by hand first, plus
  a case proving a student's second (successful) application after an
  earlier rejection is counted once, at their best outcome — not lost,
  not double-counted.
- Every data-quality warning/integrity code, each isolated to its own
  fixture case so a false pass in one can't hide a false pass in
  another.
- **The reproducibility guarantee itself**: a report is published,
  the underlying data is then changed, and the test asserts the
  published snapshot is byte-for-byte unchanged while a newly generated
  report reflects the change. A second test does the same thing across a
  metric-definition version bump (v1 → v2), proving a snapshot stays
  pinned to the definition version it was actually computed with.

**Live smoke test** (`scripts/apiSmokeTest.ts`) against the full ~600-row
seeded dataset, over real HTTP, proving:
- A request with no role header is rejected (401).
- A request claiming the `recruiter` role is rejected (403) — the
  absolute product boundary from section 1/57 is enforced in code, not
  just documentation.
- A `student` role is rejected from the company/recruiter report (403) —
  visibility rules are per-report, not just role-vs-no-role.
- Department performance, executive KPIs, funnel-comparison "why below
  target" insights, and the data-quality/warnings endpoint all return
  real, internally-consistent numbers computed from the seeded records —
  not hardcoded values. (Notably, the auto-generated insight correctly
  identified **CIVIL**, not the department the seed script specifically
  penalized (ECE), as the single worst-performing department this
  season — that wasn't hand-picked, it's what the data actually says.)

---

## What Was Not Built (honest boundary)

Everything under Sections 41-43 (student reports), 19-22 (training/
readiness/communication reports), 33-35 (PDF/XLSX generation), 38-40
(review comments/decisions API), 56 (audit log), 60-61 (async jobs,
retention), 62-64 (sharing, confidentiality flags, accessibility), and
the full RBAC/permission matrix from section 57 beyond the four roles
exercised in the smoke test. These are not stubbed with fake
implementations — they're simply absent, and should stay that way until
built for real. See `PART10_INTEGRATION.md` for suggested next slices.
