# CodeForge Evidence Model

## Provenance (PHASE 10)

Every `student_skill_evidence` row answers, in structured columns (not a
free-text blob): what happened, when, on which problem, at what difficulty,
with how much assistance, and what the result was. Every mastery-state
change writes a `skill_state_history` row with a human-readable `reason`
string built from exactly those columns — never a free-floating AI claim.
If you can see a mastery state, you can trace it to specific evidence rows.

## Immutability (PHASE 47)

Evidence is never updated or deleted in place. A correction sets
`superseded_by_correction = true` on the old row and inserts a new one.
`calculateMastery` explicitly filters out superseded rows rather than the
database silently hiding them — see the "does not silently drop evidence"
test in `masteryCalculation.test.ts`. History stays intact for auditing.

## Idempotency (PHASE 70)

`student_skill_evidence.idempotency_key` and `practice_sessions.idempotency_key`
are both unique. `EvidenceRepository.insert()` uses
`ON CONFLICT (idempotency_key) DO NOTHING` and returns `null` on a repeat —
`PracticeService.completePractice()` treats that as a safe no-op, not an
error. A flaky network retry cannot double-count a submission.

## Anti-gaming (PHASE 16)

`detectSuspiciousPattern()` flags — it never silently rejects — a burst of
3+ submissions on the same problem within a 20-minute window (both
configurable). Flagged evidence is still stored with `suspicious = true`
and a reason, for trainer/TPO visibility. The actual defense against
farming is the repetition discount in `masteryCalculation.ts`, which
applies regardless of whether a burst was flagged.

## The one real external dependency: `failure_reason`

Gap diagnosis (`PROBLEM_INTERPRETATION_GAP`, `EDGE_CASE_GAP`,
`COMPLEXITY_GAP`, etc.) depends on your code-execution/test engine
classifying *why* a submission failed and passing that back as
`failure_reason` on the evidence row. This engine does not — and should
not — invent that classification from thin air (PHASE 78: never let AI
invent test results). Concretely:

- If your test runner already distinguishes "wrong output on edge-case
  input" from "TLE / wrong complexity" from "runtime exception," map those
  outcomes to the `FailureReason` enum in `domain/types.ts` when you call
  `PracticeService.completePractice()`.
- If it doesn't yet, gap diagnosis still works — it just falls back to the
  `NEEDS_REVIEW` category (visible, honest, not a guess) instead of a
  specific gap category, and prerequisite diagnosis (which doesn't need
  `failure_reason` at all) is unaffected.

This is a deliberate PHASE 89 boundary: the mastery/gap logic is complete
and tested, but its *accuracy* on failure classification is bounded by
signal your execution engine already has to produce anyway to show the
student useful error messages.
