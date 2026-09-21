# Testing

## Real results, as of the last run in this environment

```
$ npx tsc --noEmit
(clean — zero errors)

$ node --import tsx --test tests/*.test.ts
# tests 38
# suites 0
# pass 38
# fail 0
```

This file states real, current results rather than a description of tests
that "should" pass — per the brief's own instruction to run tests, fix real
failures, and not merely report them if they can be fixed. In fact, the
first real run of this suite caught three real bugs, which is exactly what
the tests are for:

1. **`prerequisiteGraph.ts`**: `collectDescendants` (used by
   `computeBlockingPower`) had no cycle guard and stack-overflowed on a
   cyclic graph. Fixed by replacing the two mutually-recursive helpers with
   a single iterative, `seen`-set-guarded traversal.
2. **`priorityEngine.ts`**: the returned `score` was rounded but the
   individual `breakdown` contributions weren't, so `sum(contributions) !==
   score` at the precision the test checked. Fixed by not rounding
   internally at all — rounding is a display concern, already handled
   separately wherever scores are shown to a user (`.toFixed(2)`).
3. **`tests/e2e.test.ts`** itself had an incorrect expectation: it assumed
   `Graphs` would read as `UNKNOWN` in the very first roadmap version. The
   actual (correct, and more rigorous) behavior is that `Graphs` is already
   `BLOCKED` in v1, because its own prerequisite (`Graph Traversal`) is
   itself unresolved — an `UNKNOWN` prerequisite isn't "ready" any more than
   a known gap is. The test's expectation was fixed to match the verified-
   correct behavior, with a comment explaining why.

## What each test file actually covers

| File | What it verifies | I/O |
|---|---|---|
| `gapAnalysis.test.ts` | UNKNOWN-vs-weak classification, the confidence/evidence-thinness edge case | none — pure |
| `prerequisiteGraph.test.ts` | Cycle detection on a real 3-node cycle, blocking-power counts on a real 4-node chain, layering | none — pure |
| `priorityEngine.test.ts` | Breakdown sums to total, monotonicity (more gap severity / blocking power / role importance / urgency-on-required-skills each strictly increases the score) | none — pure |
| `milestoneEngine.test.ts` | A milestone with 20 recorded attempts does **not** complete without independent, verified evidence — the brief's most emphasized rule, made concrete and checkable | none — pure |
| `readinessModel.test.ts` | A 0.9-composite score is still capped below READY without recent verification; dimensions score independently | none — pure |
| `recalculation.test.ts` | Diff detection (no-op vs. material), milestone matching via Jaccard overlap | none — pure |
| `e2e.test.ts` | **The real one.** Full closed loop against a real SQLite file: generate → evidence → recalculate → prerequisite block → resolution → versioning → audit log, asserting on real persisted rows, not mocks | real `better-sqlite3` file |

## What's intentionally not automated here

- **Load/performance testing** — not run; the schema has the indexes it
  should (see `docs/DATABASE.md`), but nothing here measures query latency
  under realistic concurrent load.
- **Concurrency / race-condition testing** — the unique partial indexes
  (one active roadmap/target per student) and `withTransaction()` wrapping
  are real mechanisms that *should* prevent duplicate-version races, but no
  test actually fires concurrent requests to prove it under contention.
- **Frontend testing** — the React dashboard artifact is a UI demonstration
  of the real captured v1–v4 data (see `docs/FINAL_REPORT.md`), not a
  tested production frontend with its own test suite.

These are named directly, not glossed over, in the truth table in
`docs/FINAL_REPORT.md`.
