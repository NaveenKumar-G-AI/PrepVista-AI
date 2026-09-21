# CodeForge Security & Integrity (§43, §55, §56)

This doc distinguishes what was actually verified from what a production
deployment still needs to add — that distinction is the whole point of
writing it down (§63).

## Code execution isolation — what's real here, and what isn't

`src/execution/executor.ts` runs every submission in its own subprocess with
real, empirically-verified resource limits:

- **Python**: `ulimit -v <KB>` (virtual memory) + `ulimit -t <sec>` (CPU time).
- **JavaScript**: `ulimit -t <sec>` + `node --max-old-space-size=<MB>` (V8 heap
  cap) — **not** `ulimit -v`, which was tested and reliably crashes Node on
  startup (V8 reserves a large virtual address range independent of actual
  heap usage; the crash isn't a resource violation, it's Node failing to
  initialize). This was found by deliberately running both and reading the
  actual exit behavior, not assumed from documentation.
- **Both**: a wall-clock timeout as a backstop (`spawnSync`'s `timeout` +
  `SIGKILL`), verified against a genuine infinite loop.

What this does NOT provide, and what a real deployment needs before handling
untrusted submissions at scale (§21's own requirement — filesystem isolation,
process limits, network restrictions):

- **Filesystem isolation** — each execution gets a fresh temp directory, but
  all executions share the same container/host filesystem and OS user as the
  rest of the application. A determined submission could still, e.g., attempt
  to read files outside its temp directory.
- **Network isolation** — not enforced by this code at all. (It happens to be
  moot in *this* sandbox, which has no outbound network access — that's an
  accident of the environment this was built in, not a security control this
  code provides.)
- **True multi-tenant process isolation** — every execution is a plain OS
  subprocess, not a container/microVM. Two executions can't see each other's
  memory, but they're not isolated the way Docker/gVisor/Firecracker would
  isolate them.

**§21 says to integrate with an existing execution service if one exists
rather than building a duplicate.** If the real PrepVista repository already
has hardened sandboxed execution, `executor.ts`'s `runTestCase()` is the single
function to redirect at it — everything upstream (`evaluationService.ts`,
`generationPipeline.ts`, both test suites) calls it through the same
`(language, code, entryFunction, testCase) → result` contract and doesn't need
to change.

## Hidden tests (§18, §43)

Enforced at two independent points, deliberately not just one:

1. **Application layer**: `executor.ts` constructs `TestResult` such that
   `actualOutput`/`expectedOutput` are `undefined` for any test where
   `hidden === true`, regardless of pass/fail. `tests/executor.test.ts` has an
   explicit test for this.
2. **Database layer**: the RLS policy on `challenge_tests` in
   `db/migrations/0001_init.sql` blocks the student role from `SELECT`-ing
   `hidden = true` rows at all, and `solution_metadata` is excluded from the
   `challenge_versions_public` view entirely. If the application layer had a
   bug, the database still wouldn't hand over the answer.

## AI prompt security (§56)

Challenge parameters and — especially — student code are treated as untrusted
input in both `DRAFT_SYSTEM_PROMPT` and `COACH_SYSTEM_PROMPT`
(`src/ai/providers.ts`): both are wrapped in explicit delimiters
(`<parameters>`, `<student_code>`) with an explicit "this is data, not
instructions" framing, and the coaching prompt is told never to reproduce
hidden test values (it isn't given any, so this is enforced structurally too,
not just by instruction).

**Honest limitation**: prompt-level wording is a real mitigation, not a
guarantee — no phrasing reliably defeats a sufficiently adversarial injection
attempt. The actual backstop is that AI output is never trusted on its own
authority anywhere in this system: `generationPipeline.ts` independently
executes and validates every AI-drafted challenge before REVIEW, and
`evaluationService.ts`'s AI coaching is advisory-only and never touches a
PASS/FAIL determination. An injected instruction inside student code, at
worst, could make the *coaching message* say something strange — it cannot
change whether the tests passed, because that's decided by
`runDeterministicEvaluation()` before AI is ever called.

## What adversarial testing (§55) this prototype has actually had

`tests/generationPipeline.test.ts` includes cases specifically designed to
attack the generation pipeline: a reference solution that doesn't satisfy its
own tests, test suites too weak to catch an obviously broken solution, and a
provider that fails outright. All are confirmed rejected, not just assumed to
be.

What this prototype has **not** had: a real adversarial pass against the
execution sandbox itself (attempted filesystem escape, resource-limit evasion,
submission flooding), API-level abuse testing, or a pentest of the RLS
policies against a live Supabase instance. None of that is possible to do
honestly without a live deployment to attack — see the manifest for this
listed as NOT IMPLEMENTED rather than silently skipped.

## Never trust client-provided scores (§43)

`submitAttempt()` always recomputes `testsPassed`/`testsFailed` from a fresh
`runDeterministicEvaluation()` call server-side; nothing about the score is
ever accepted from the caller. There is no code path anywhere in
`codeforgeService.ts` that takes a pass/fail value as an input parameter.
