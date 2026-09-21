# CodeForge Testing (§53, §54)

## Running it

```
npm install        # or ensure tsx/typescript/@types/node are available globally
npm run typecheck  # tsc --noEmit — zero errors as of this writing
npm test           # tests/run-all.ts
npm run demo       # src/demo/runDemo.ts — the full §58 scenario, end to end
npm run validate-seed  # independently re-verifies every seed challenge's solution + the deliberate bug's exact failure pattern
```

There is no mocking of the execution layer anywhere in this suite — every test
that touches `runTestCase()` runs a real Python or Node subprocess. That was a
deliberate choice: a mocked executor would let `mistakeClassifier.ts`'s rules
be tested against fabricated exception messages that might not match what
Python/Node actually produce. Real subprocesses are slower (the full suite
takes a few seconds, not milliseconds) but test what's actually true.

## What's covered, and by what (50 tests total, all passing as of this build)

| Area | File | What it actually proves |
|---|---|---|
| Execution engine | `tests/executor.test.ts` | Correct/incorrect solutions score right; Python & JS runtime errors are classified; a genuine infinite loop is stopped by resource limits within the wall-clock backstop; hidden tests never leak actual/expected values even on failure; unordered-collection comparison works |
| Mistake classification | `tests/mistakeClassifier.test.ts` | Every exception-type rule (IndexError→BOUNDARY_ERROR, TypeError→TYPE_ERROR, KeyError→WRONG_DATA_STRUCTURE, resource limit→COMPLEXITY_FAILURE); the edge-only-failure vs. fails-everywhere distinction (OFF_BY_ONE vs. WRONG_ALGORITHM); misconception confidence escalation (1→untracked, 2→LOW, 3→MEDIUM exactly matching §28's worked example, 4→HIGH); system errors never counted as student mistakes |
| Difficulty policy | `tests/difficultyPolicy.test.ts` | Every one of §14's six outcome branches, plus the floor/ceiling at FOUNDATION/EXPERT |
| Challenge selection | `tests/challengeSelector.test.ts` | Prerequisite gating (met and unmet), language filtering, lifecycle-status gating, gap prioritization, role relevance, repetition suppression, task-diversity preference, graceful "no eligible candidate" handling, score bounds |
| Generation pipeline | `tests/generationPipeline.test.ts` | A correct draft is approved into REVIEW; schema-invalid drafts, self-failing reference solutions, degenerate test sets, tests too weak to catch a broken mutant, and total provider failure are all rejected at the *right* stage, not just rejected |
| Seed data integrity | `scripts/validate-seed.ts` | All 5 challenges' reference solutions pass 100% of their own tests (30/30 total across all five); the deliberately-buggy challenge-1 starter fails *exactly* the two tests it was designed to fail (8/10) — checked by assertion, not eyeballed |

## §54 edge cases — status

Explicitly exercised: no eligible challenge (selector returns `null`, doesn't
throw), missing/invalid entry function, syntax errors, runtime exceptions,
resource-limit exhaustion, unsupported language (filtered out, not a runtime
error), duplicate/repeated submissions (each is its own immutable `Attempt`
row — see the data model doc), total AI provider outage (generation and
coaching both degrade to an explicit pending/rejected state, not a crash).

Explicitly **not** exercised, because they need infrastructure this sandbox
doesn't have (a real database, a real network, concurrent load) rather than
being an oversight: real database-connection failure, browser
refresh/disconnect mid-attempt, concurrent-submission races against a live
Postgres instance, and a real (not mocked) AI provider outage mid-response.
Listed as NOT IMPLEMENTED, not silently assumed to work — see the manifest.

## §55 adversarial testing — status

See `docs/CODEFORGE_CHALLENGE_SECURITY.md`'s dedicated section. Summary: the
generation pipeline's rejection logic was genuinely attacked (weak tests,
self-failing solutions) and holds up under test. The execution sandbox and API
layer were not, because there's no live deployment here to attack honestly.
