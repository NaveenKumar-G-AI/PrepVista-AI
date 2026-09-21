# Testing

## Summary

**75 tests, 0 mocks of the engine's own logic, 0 skipped.** Run with `npm test` (or `npm run test:unit` / `test:integration` / `test:e2e` individually). Uses Node's built-in test runner (`node --test`) against isolated `:memory:` SQLite databases per test — no shared state, no test ordering dependencies, no cleanup step required between runs.

```
tests/unit/           56 tests — pure-function estimators, detectors, ranking, difficulty, repetition
tests/integration/    18 tests — real DB + real code execution + real HTTP server
tests/e2e/              1 test (10 nested steps) — the full Phase 59/60 scenario, real execution throughout
```

Every "real" claim below was independently re-verified while writing this document by re-running the suite (5 consecutive full runs, 375/375 passing — see `CODEFORGE_FINAL_REPORT.md` for the exact command and output).

## Unit tests (mastery, confidence, trend, gaps, prerequisites, difficulty, ranking, repetition)

Pure functions tested with hand-constructed `Evidence[]` arrays — no database needed, sub-millisecond per test. Notably includes the exact worked examples from the original specification, verified rather than assumed:

- The trend example `3/10, 5/10, 6/10, 8/10, 9/10 → IMPROVING` (`tests/unit/trend.test.ts`).
- "A single lucky attempt cannot create false mastery" (`tests/unit/mastery.test.ts`) — checked with a generous 100%-confidence assumption specifically to isolate that the *count/diversity* gates, not just confidence, are doing the blocking.
- The exact Phase 12 prerequisite scenario — weak Queues blocking Graph Algorithms readiness — run against the real seeded skill graph, not a synthetic one (`tests/unit/prerequisite.test.ts`).

## Integration tests (real execution, real HTTP server, real security boundaries)

`tests/integration/pipeline.test.ts` runs actual code through `src/execution/runner.ts` as child processes — including the exact buggy two-stack queue implementation that was hand-traced and then empirically verified (see `CODEFORGE_FINAL_REPORT.md`) to pass a "basic" test and fail an "interleaved" one, confirming the diagnosis engine correctly labels it `STATE_MANAGEMENT_ERROR`. It also includes an adversarial "overfit" submission — hand-crafted to pass exactly the 3 *visible* test cases while failing the 4th, hidden one — to prove hidden tests are genuinely evaluated server-side, not merely marked hidden in the schema.

`tests/integration/security.test.ts` starts a real Express server on an ephemeral port and issues real HTTP requests (`fetch`) — no supertest, no mocked request objects. It proves cross-student isolation by first giving student B real evidence, then confirming student A's request for the *same skill* comes back empty (not erroring, not returning B's data), and separately confirming B can see their own — so the emptiness is proven to be a security boundary, not just missing data everywhere.

`tests/integration/aiFallback.test.ts` is the one test in this suite that intentionally exercises a real network condition rather than mocking it: it sets a fake `GROQ_API_KEY` and calls the real `GroqProvider`, which attempts a genuine `fetch()` to `api.groq.com` — a domain outside this sandbox's network egress allowlist. The test asserts the call fails closed to `null` within the configured timeout, never throwing. This is not a simulated "what if AI is down" test; in this sandbox, AI genuinely is down for that domain, and the fallback path is real.

## E2E (Phase 59/60 — the full closed loop)

`tests/e2e/demoScenario.test.ts` walks all sixteen links of the Phase 60 loop with one continuous, realistic student narrative (Python syntax error → fix, standard vs. transfer binary search, a genuinely-traced state-management bug → fix, and a first-ever Graph Algorithms attempt gated by prerequisite readiness), asserting real values at every step: actual evaluation pass/fail counts, the actual diagnosed mistake category, actual mastery score deltas, and that the prerequisite analyzer — once Queues evidence improves — no longer points back at Queues. `scripts/runDemo.ts` runs the same narrative shape through the real HTTP API (not the pipeline directly) and captures the output as `dashboard-data.json`, which the dashboard renders.

## Bugs the test suite actually caught (not hypothetical)

Documented in full in `CODEFORGE_FINAL_REPORT.md`, but listed here because it's the most concrete evidence that these tests do real work:

1. Assistance-level weighting silently had no effect (a `HINT`/`SOLUTION_VIEWED` attempt weighed the same as an independent one) due to a bad default parameter.
2. Syntax errors were dragging down *algorithmic* mastery scores, violating the spec's explicit language-vs-algorithm distinction.
3. Exploration could target a skill with zero challenges (a grouping node like "Python"), breaking recommendation generation for any student without a role set.
4. A correctly-detected `PREREQUISITE_GAP` still recommended a challenge for the *original* skill instead of the prerequisite it named — the explanation and the action disagreed with each other.

## What is NOT tested

- Load/concurrency testing (see `CODEFORGE_FINAL_REPORT.md`, Performance).
- Live calls to Groq/Gemini with a real, working API key (blocked by this sandbox's network egress — the code path up to and including the network call is real and tested; the response-handling path beyond a successful HTTP call is exercised by the Zod schema unit-level, not by a live round-trip).
- Browser-based UI testing of the dashboard beyond a real jsdom render-and-assert pass (see `CODEFORGE_FINAL_REPORT.md`).
