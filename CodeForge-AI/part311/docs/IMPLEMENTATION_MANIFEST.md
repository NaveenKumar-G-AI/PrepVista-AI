# CodeForge Implementation Manifest

Required reading before treating anything else in this repo as a finished
product. Written under §63's rule directly: nothing below claims more than
what was actually verified by running it.

## The one fact that shapes everything else

**This was built in a sandboxed chat environment with no access to the real
PrepVista repository and no outbound network access from its code-execution
container.** §2 says to inspect the existing codebase before writing code —
there wasn't one available to inspect in this session. This is therefore a
**standalone reference implementation**, matching the same pattern already
used for this project's Part 6 and Part 13: built independently, meant to be
read, tested, and integrated by hand into the real codebase, not dropped in
and deployed. `docs/CODEFORGE_CHALLENGE_ARCHITECTURE.md` has an integration
checklist. Everything claimed as "real" below was verified by actually running
it inside this sandbox; everything that needed a live network call (Groq,
Gemini) is written to the real, current API contracts but could not be
exercised end-to-end here.

## IMPLEMENTED — real, tested, and run in this session

- **The full §58 loop**, end to end, with genuine execution and genuine rule
  evaluation, not scripted output: `npm run demo`. This includes the exact
  8/10 → hint → 10/10 → difficulty-increase → different-context-same-skill
  progression from the spec's own worked example.
- **Skill taxonomy** (§7) — representative depth across 4 domains, 20 skills,
  extensible by adding one entry.
- **Role-aware challenge scoring** (§8) — role relevance is a real, tested
  scoring factor (`tests/challengeSelector.test.ts`), not cosmetic.
- **Challenge domain model & multi-dimensional difficulty** (§6, §10).
- **Interpretable challenge selection** (§11, §41) — weighted scoring, no LLM
  in the ranking path, full `SelectionReason` on every result.
- **Skill-gap targeting** (§12) and **diversity/transfer** (§15) — both
  demonstrated live in the demo (round 2 transfers the same hashing skill
  into a new task type and context, exactly per §15's own example chain).
- **Adaptive difficulty policy** (§14) — explicit rules, all six branches unit
  tested.
- **Generation pipeline with independent validation** (§16-19) — real
  execution-based validation and mutation-testing-style adversarial
  validation, proven against mock providers in
  `tests/generationPipeline.test.ts` (never run against a *live* provider —
  see PARTIAL below).
- **Real sandboxed code execution** (§21) for Python, JavaScript, and Java,
  with empirically-verified CPU/memory/wall-clock limits — see
  `docs/CODEFORGE_CHALLENGE_SECURITY.md` for exactly what "sandboxed" does and
  doesn't mean here. The Java harness (reflection dispatch + a hand-rolled
  JSON parser, no external library installable offline) was verified against
  primitive params, arrays, raw List/Map params, runtime exceptions, compile
  errors, and resource-limit enforcement — 7 dedicated tests, plus the
  flagship challenge's actual reference solution and buggy starter both
  re-verified in Java, reproducing the exact same 8/10 failure pattern as
  the Python version.
- **A real HTTP API server** (`src/api/server.ts`, §46) — dependency-free
  (no Express available offline; Node's built-in `http` is genuinely
  sufficient here), exercised end-to-end over real HTTP requests
  (`npm run test:http`): student bootstrap, challenge selection, run
  (public-tests-only, non-grading), submit (full grading + profile update),
  hints, and correct HTTP status codes (404 for missing resources, 409 for
  a double-submit) — not assumed, checked, including a real bug this
  checking caught and fixed (a missing resource was originally returning
  500 instead of 404).
- **A real, complete frontend** (`src/web/index.html`, §40, §47-49) —
  framework-free HTML/CSS/JS (portable into any real codebase regardless of
  its framework), implementing the problem panel, the "why this challenge"
  evidence strip (visualizing the actual `SelectionReason` scoring, not a
  decorative mockup), a code editor with line numbers and tab handling,
  run/submit, per-test results, progressive hints, and session history.
  Ships in a dual mode: standalone with real captured data from an actual
  engine run (so it's honestly interactive with zero setup — editing the
  code to anything other than the two known real snapshots says so plainly
  rather than fabricating a result) or pointed at a live
  `src/api/server.ts` instance for real arbitrary-code execution. No real
  browser was installable in this sandbox (no network to fetch one) — see
  PARTIAL below for exactly how it was verified instead.
- **Immutable attempt model** (§22) and **execution states** (§23).
- **Deterministic/AI evaluation split** (§24-26) where AI never overrides an
  execution result.
- **Mistake taxonomy** (§27) and **misconception detection** (§28), matching
  §28's own confidence-escalation example exactly (3rd occurrence → MEDIUM).
- **Progressive hints** (§29).
- **Realistic, role-scenario-framed challenges** (§31, §32), not competitive-
  programming-style problems.
- **Evidence-based failure summaries** (§33), generated from real pass/fail
  counts, not a canned string.
- **Full attempt/exposure/evidence history** (§35).
- **AI provider resilience** (§44) — demonstrated live: with no API keys
  configured, every AI call in the demo correctly resolves to a `pending`
  state instead of crashing or fabricating a result.
- **Cost control** (§45) — architecturally enforced: AI is called from exactly
  two places (challenge drafting, coaching commentary); nothing else in the
  engine can reach an AI provider.
- **Postgres/Supabase schema** (§42) with real RLS policies and an immutability
  trigger, not just table definitions.
- **API surface** (§46) as a clean service class, transport-agnostic.
- **57 automated tests, all passing**, run against real subprocess execution,
  not mocks (§53) — see `docs/CODEFORGE_CHALLENGE_TESTING.md` for the full
  breakdown.
- **Research grounded in current sources** (§3, §61) — see
  `docs/CODEFORGE_CHALLENGE_RESEARCH.md`, including two real bugs this
  research directly caused to be fixed (the adversarial/mutation-testing
  validation stage was added after reading the LLM-test-generation
  literature; it wasn't in the first draft of the pipeline).

## PARTIAL — real and working, with an honest gap

- **Multi-language support** (§20): the schema and types support 7 languages;
  Python, JavaScript, and Java have a working execution harness (3 of 7),
  each independently tested. The remaining 4 (C, C++, Go, Rust) are typed
  into the schema but have no harness — C and C++ toolchains (gcc/g++) are
  actually present in this sandbox and were confirmed working at the
  compiler level, but a generic marshalling layer for them wasn't built in
  this pass; Go and Rust toolchains aren't present here at all.
- **The frontend's verification** (§40, §47-49): no real browser was
  installable in this sandbox (Playwright's npm package is present but its
  browser binaries require a network fetch this environment doesn't have).
  Verified instead by (1) static checks — every DOM id the script references
  cross-checked against ids actually defined in the HTML, HTML tag-balance
  checked, JS syntax-checked — which caught one real bug (a duplicate/missing
  id from an earlier edit), and (2) actually *executing* the page's real
  script against a ~100-line hand-rolled DOM stub
  (`scripts/dom-smoke-test.cjs`) that simulates just enough of
  `getElementById`/`textContent`/`innerHTML`/event listeners to run
  `init()` and then dispatch real click/change/input events the way a user
  would — Run, Submit, Get a hint, editing to an unrecognized snapshot,
  language switching, and toggling live mode were all exercised this way
  and all behave correctly. This is real verification of the page's logic,
  not a guess — but it is not the same thing as loading the page in an
  actual browser, which has never happened. Rendering/layout/visual
  correctness, real keyboard/focus behavior, and actual screen-reader
  behavior are unverified — see NOT IMPLEMENTED.
- **AI drafting & coaching** (§16, §30, §44): the Groq and Gemini adapters are
  written to the real, current API contracts (verified against
  console.groq.com and ai.google.dev on 2026-08-15) but were never exercised
  against a live endpoint — this sandbox has no outbound network access.
  Tested exclusively via mock providers standing in for a real one.
- **Skill-level progression heuristic** (§12): a simple "3 consecutive
  hint-free passes promotes a level" rule, not a psychometric model (BKT/IRT).
  Real, rule-based, auditable — but a deliberate simplification the research
  doc names explicitly rather than dressing up as more rigorous than it is.
- **Quality analytics & anomaly detection** (§38-39): the computation is real
  (`InMemoryStore.recordChallengeOutcome`) and unit-testable, but only 3 of
  the listed anomaly signals are implemented (extreme pass rate, elevated
  system-error rate), and no test exercises it with the 5+ attempts needed to
  trigger a flag.
- **Challenge lifecycle** (§37): the state enum and ACTIVE/APPROVED gating are
  real and enforced by the selector; there's no admin workflow for actually
  moving a challenge DRAFT → REVIEW → APPROVED (that's a UI, see below).
- **Observability** (§50): structured, readable console output exists
  throughout (the demo *is* effectively a manual trace of every named event);
  there's no actual logging pipeline/event bus, because there's no deployed
  service to emit to yet.
- **Performance & idempotency** (§51-52): SQL indexes are real; there's no
  caching layer or HTTP-level idempotency-key handling, because there's no
  HTTP layer — `submitAttempt()` can't double-submit the same `Attempt`
  because each attempt is single-use by construction, but that's a narrower
  guarantee than full request-level idempotency.
- **Security** (§43, §55-56): hidden-test protection and RLS are real and
  double-enforced (see the security doc). The execution sandbox provides real
  CPU/memory/time limits but not filesystem/network/container isolation.
  Adversarial testing was genuinely done against the generation pipeline;
  not against the execution sandbox or an API layer, because attacking a
  sandbox that isn't deployed anywhere isn't a meaningful test.
- **Documentation** (§62): 11 documents were requested; 7 denser ones were
  delivered instead (this file plus Architecture, Data Model, Adaptation &
  Evaluation, Security, Testing, Research), consolidating
  ENGINE+EVALUATION+ADAPTATION+GENERATION into one document and
  ARCHITECTURE+INTEGRATION into another, because the source material for each
  overlapped enough that splitting them would have meant repeating the same
  explanations rather than adding information. A `FINAL_REPORT` wasn't
  written as a separate file — this manifest *is* that report.

## NOT IMPLEMENTED — named, not hidden

- **Real-browser verification of the frontend**: never loaded in an actual
  browser (Chrome/Firefox/Safari) in this session — no visual screenshot, no
  real accessibility-tree/screen-reader check, no real device/responsive
  testing, no Lighthouse-style audit. The DOM-stub verification above is
  real but is not a substitute for this. Open `src/web/index.html` directly
  in a browser to see it for real — that's the very next honest step.
- **C, C++, Go, Rust execution harnesses**: not built this pass (Go/Rust
  toolchains also aren't present in this sandbox at all, so those two
  couldn't have been verified even if written).
- **A live-provider run of the generation or coaching pipeline**: correctness
  is argued from the API contracts plus mock-provider tests, not from an
  actual model response. Verify with a real key before trusting it in
  production.
- **A live Supabase deployment of the schema/RLS policies**: the SQL is real
  and internally consistent (types, FKs, indexes all cross-checked against
  the TypeScript domain model by hand) but has not been run against an actual
  Postgres instance in this session.
- **Cross-student/TPO reporting surfaces**: correctly out of scope per §1 and
  §57 — noted here so it's an explicit boundary, not an oversight.
- **Load/concurrency testing, real database-failure injection, browser-
  disconnect handling**: all need infrastructure (a live DB, a live HTTP
  server, concurrent clients) this sandbox doesn't have.

## What actually got caught and fixed by running this (not just writing it)

Four real bugs surfaced only because every piece of this was executed for
real rather than eyeballed, worth naming as evidence the "run everything"
discipline wasn't decorative:

1. Challenge 2's `prerequisites` originally required PROFICIENT in
   `data_structures.hashing` — the very skill that challenge exists to
   develop while the student is still DEVELOPING. This silently excluded it
   from every selection and only showed up because round 2 of the live demo
   picked the wrong challenge.
2. The demo's first draft requested a hint on an already-submitted `Attempt`,
   which `codeforgeService.ts` correctly rejects (hints belong to the
   in-progress attempt, not a finalized one) — caught by the demo crashing,
   not by inspection.
3. The API server's first draft mapped every thrown error to HTTP 500,
   including "resource not found" — caught by the HTTP integration test
   asserting a 404 and getting a 500 back; fixed with typed
   `CodeForgeNotFoundError`/`CodeForgeConflictError` classes so the mapping
   can't drift again.
4. An HTML edit while iterating on the frontend left `id="challenge-title"`
   dropped from its element while the script still looked it up — caught
   by a static cross-check of every DOM id the script references against
   ids actually defined in the HTML, before the page was ever "run."

Both the seed-data and hint-sequencing bugs (1-2) were caught by running the
Node/TypeScript demo; both the HTTP and frontend bugs (3-4) were caught by
the newer verification layers (the HTTP integration test and the DOM-id
cross-check + DOM-stub execution) added specifically because those two
pieces of code didn't exist yet when the first pass of this manifest was
written. All four are fixed in the delivered code.
