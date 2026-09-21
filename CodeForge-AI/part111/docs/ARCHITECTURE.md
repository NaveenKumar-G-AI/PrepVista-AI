# Hidden Test Engine — Architecture

## 0. Read this first

This was built as a **standalone codebase**, not as a patch into an existing
"CodeForge AI" repository. That repository does not exist anywhere in the
environment this was built in — this was verified by searching the
filesystem before writing any code, not assumed. Every instruction in the
original spec that says "inspect the existing system and extend it" could
not literally be followed for that reason. What follows instead is a
complete, working implementation of the Hidden Test Engine, architected
exactly as if it were dropping into a Supabase/Postgres + Next.js
CodeForge-style platform, so it can be merged in directly: copy `lib/`,
`db/migrations/`, and `app/api/` into the real repo, point `DATABASE_URL`
at the real database, and adapt `lib/http/auth.ts` to the real session
system.

Everything described below was actually run in this environment against a
real local PostgreSQL 16 instance and a real sandbox (bubblewrap +
unprivileged Linux user + ulimit + timeout), not asserted from a design
doc. Where something is a real, verified property, it says so. Where
something is a stub, a simplification, or unverified, it says that too, per
the spec's own "truthful completion" rule. See `FINAL_REPORT.md` for the
itemized status of every component.

## 1. The trust boundary

The single organizing principle of this system:

```
Student browser  --(submit code)-->  SERVER (trust boundary)
                                        ├─ resolve problem/suite version (pinned, immutable)
                                        ├─ load hidden tests (service-role DB connection only)
                                        ├─ execute candidate code in the sandbox
                                        ├─ compute verdict + score (deterministic)
                                        └─ filter through the safe-result serializer
Student browser  <--(safe result only)--
```

Hidden test content — input, expected output, checker source, reference
solutions — exists only inside the server box. It is loaded exactly once,
by the orchestrator (`lib/engine/evaluate-submission.ts`), using a
database connection that has access to it (`app_service`, mapped to
Supabase's `service_role`). Nothing else in the codebase is allowed to
read it, and this is enforced twice, independently:

1. **Database RLS** (`db/migrations/0006_rls_policies.sql`): the
   `app_authenticated` role (a student's own connection, if the frontend
   ever talks to Postgres/PostgREST directly) has RLS policies with no
   permissive rule for `hidden_test_cases`, `checkers`,
   `reference_solutions`, `test_generators`, `evaluation_runs`, or
   `submission_test_runs` — students get zero rows or a permission-denied
   error, never partial access.
2. **The safe-result serializer** (`lib/engine/safe-result.ts`): the only
   function in the codebase allowed to turn an internal evaluation result
   into something an API response can return. It is a field allowlist per
   assessment mode, not a redaction list — a newly added internal field is
   excluded by default, not leaked by default.

Both are exercised by real, running tests: `scripts/rls-security-demo.ts`
(15 real attack attempts against a real Postgres instance) and
`tests/integration/anti-leakage.test.ts` (fuzzes real secret-shaped
strings through the serializer and asserts they never appear, across all
four assessment modes).

## 2. Data model

See `db/migrations/0001*.sql` through `0008*.sql` for the authoritative
schema. Summary of the entity chain:

```
problem --< problem_version (immutable once published)
                  |
                  ├--< test_suite --< test_suite_version (immutable once published)
                  |                          |
                  |                          └--< hidden_test_case (category, weight, input, expected_output, checker)
                  ├--< reference_solution
                  └--< checker

submission (pinned to one problem_version)
    └--< evaluation_run (pinned to one test_suite_version)
              └--< submission_test_run (one row per test, public or hidden)
              └--< evidence_record (structured, per-category)
```

Immutability is enforced by **database triggers**
(`0005_immutability_triggers.sql`), not application convention: a
`test_suite_version` or `problem_version` with `status='published'`
rejects any `UPDATE` other than a transition to `retired`, and a
`hidden_test_case` under a published suite rejects insert/update/delete
outright. This was verified against the real database, including as the
privileged `app_service` role — the trigger fires regardless of which
role issues the statement, which is the point: immutability isn't a
permission you can be granted, it's a fact about published data.

A historical submission's `evaluation_run.test_suite_version_id` always
points at the exact version it was judged against, so a submission from
before a suite was revised keeps evaluating against the old suite forever
(`scripts/rls-security-demo.ts` doesn't currently include an automated
version-pinning regression test with two published versions — see
`FINAL_REPORT.md` for this gap).

## 3. Execution flow

`lib/engine/evaluate-submission.ts` is the single, server-owned
orchestrator implementing the flow the spec described:

```
submission
  -> resolve problem_version (pinned on the submission row)
  -> resolve the active test_suite_version for that problem_version
  -> idempotency check (a completed evaluation_run already exists? reuse it, don't re-run)
  -> load public tests from problem_version.spec (never from hidden_test_cases)
  -> load hidden tests from hidden_test_cases (service connection only)
  -> for each test: evaluateTestCase() -> sandbox execution -> checker -> Verdict
  -> aggregateResults() -> deterministic score + overall verdict
  -> persist evaluation_run, submission_test_runs, evidence_records
  -> audit log
  -> return AggregateResult (caller applies toSafeResult() before it ever reaches an API response)
```

Every stage writes to Postgres before moving on, so a crash mid-evaluation
leaves a consistent, resumable state rather than a half-applied result —
see "Reliability" below.

## 4. Sandbox — what's real, what's a known limitation

This is the part most worth reading carefully before trusting it with
real graded assessments.

**Stack**, verified empirically in this environment (see
`scripts/sandbox-safety-demo.ts` and `tests/integration/sandbox.test.ts`):

- **Privilege drop**: candidate code runs as an unprivileged Linux user
  (`sandboxrunner`, uid 996), never as root, via `su`.
- **Namespace isolation**: `bubblewrap` (`bwrap`) gives the candidate
  process its own PID namespace, network namespace (`--unshare-net`), and
  a filesystem view containing only `/usr`, `/lib`, `/lib64`, `/bin`,
  `/proc`, `/dev`, a fresh `/tmp`, and the one work directory for this
  execution — bound read-write. **Verified**: a candidate program cannot
  read `/etc/passwd` (not bound at all), cannot see any other directory
  on the host (`/home/claude` is literally not visible), and cannot open
  any outbound network connection (`socket.create_connection` raises
  `Network is unreachable`).
- **Cleared environment**: `--clearenv` plus an explicit `PATH`/`LANG`
  allowlist. No database credentials, API keys, or other host secrets are
  ever placed in a candidate's environment — verified by a test that sets
  a fake secret in the *parent* Node process's env and confirms it does
  not appear inside the sandbox.
- **CPU / wall-clock**: `ulimit -t` plus an outer `timeout -s KILL`,
  confirmed to kill an infinite loop at the configured limit.
- **Process count**: `ulimit -u`, confirmed to contain a real fork bomb
  (bounded to the configured pid ceiling, returns in well under a second,
  host stays fully responsive).
- **Output size**: enforced in the Node runner itself (a byte-counting
  guard on the stdout stream that kills the process group once the
  configured cap is exceeded), confirmed against a program that prints
  forever.
- **Memory — the one real nuance**: `ulimit -v` (virtual memory) works
  cleanly for CPython — a memory bomb raises a catchable `MemoryError`.
  It does **not** work for Node/V8: this was tested directly (not
  assumed), and V8 fails to even start — `console.log(1+1)` aborts with
  a fatal OOM — at any `ulimit -v` below roughly 700MB, because V8
  reserves that much virtual address space for its CodeRange regardless
  of actual heap use. For the Node adapter, the engine instead sets a
  generous virtual-memory backstop (1536MB, empirically above V8's boot
  requirement) and enforces the real configured limit with an **RSS
  watchdog** — a ~40ms-interval poll of `/proc/<pid>/status` across the
  whole process subtree, killing it if resident memory exceeds the
  configured ceiling. Both a Python and a Node memory bomb are killed
  correctly in the test suite, by two different mechanisms, and the code
  comments explain why they have to differ.

**What this sandbox is not**: bubblewrap uses Linux namespaces, which
share the host kernel. A kernel-level exploit could in principle escape
this sandbox in a way it could not escape a hardware-virtualized sandbox
(gVisor, Firecracker/Cloud Hypervisor microVMs, or Docker with a strong
seccomp/AppArmor profile plus gVisor's `runsc`). For a real assessment
platform grading untrusted code from the public internet, this stack is a
reasonable and genuinely-tested baseline, not a replacement for one of
those. Swapping the sandbox implementation is contained to
`lib/sandbox/runner.ts` and `sandbox-runtime/execute.sh` — the rest of
the engine (verdicts, scoring, DB, API) does not know or care how
isolation is implemented underneath `runInSandbox()`.

## 5. Verdicts and scoring

`lib/engine/verdict.ts` is the one place a sandbox outcome + a checker
result become a `Verdict`. Its explicit job is to keep infrastructure
failures out of the student-fault verdict space:

- A sandbox that fails to even start returns `system_error`, mapped to
  `JUDGE_ERROR` — never `WRONG_ANSWER`.
- A custom checker that itself crashes or times out returns
  `judgeError: true` from `runCustomChecker()`, mapped to `JUDGE_ERROR`
  — never `WRONG_ANSWER`.
- `lib/engine/scoring.ts#computeOverallVerdict` scans every outcome for
  an infrastructure verdict first; if one exists anywhere in the run, the
  whole run's overall verdict is that infrastructure verdict, regardless
  of how many other tests happened to pass.

Scoring is a pure function (`aggregateResults`) over an array of already-
computed `TestOutcome`s — no I/O, no timing dependency, so the same
outcome set always aggregates to the same score
(`tests/unit/scoring.test.ts` asserts this directly). Public tests are
excluded from the score denominator entirely, by construction.

## 6. Output comparison

`lib/engine/comparators.ts` implements `exact`, `whitespace_normalized`,
`numeric_tolerance` (per-token, configurable absolute/relative
tolerance — `"2"` and `"2.0"` compare equal, mismatched non-numeric
tokens don't), and `structured` (order-independent line-set comparison,
a real if modest implementation of "multiple valid outputs"). `custom`
checkers run as trusted-but-still-sandboxed programs via
`lib/engine/custom-checker.ts` — isolated with their own resource limits,
because "trusted" means "the platform wrote it," not "safe to run with no
limits." The checker choice is read from the trusted `hidden_test_cases`
row; nothing about it is ever influenced by the candidate submission.

## 7. AI-assisted test generation

`lib/ai/` implements the interface (`AIProvider`), a deterministic
`MockAIProvider` (what every test and demo script in this repo actually
runs against, since no live API key is configured — see §10), and real
`GroqProvider`/`GeminiProvider` clients that satisfy the same interface
and need only an API key to activate — no other code changes.

The mandatory pipeline (`lib/ai/validation-pipeline.ts`), run for real in
`scripts/ai-generation-demo.ts` against the actual seeded problem:

```
AI proposal (input only, never an expected output)
  -> schema validation (zod)
  -> structural + declared-bounds validation (problem-specific, pluggable)
  -> duplicate detection (SHA-256 of normalized input, against both the
     existing suite and the rest of the current batch)
  -> reference-solution execution (this is what derives expected_output —
     the AI's own answer, if it gave one, would be ignored)
  -> minimal quality gate (rejects degenerate/empty output)
  -> "validated" status (queued for human/admin review — never
     auto-published; publishing still goes through the same immutable
     version-publish flow as a human-authored test)
```

Run against 5 realistic mock proposals (one genuinely good, four
deliberately bad: malformed structure, out-of-bounds value, duplicate of
an existing case, out-of-bounds target), the pipeline accepted exactly the
one valid proposal and rejected the other four with a specific, correct
reason each — see `FINAL_REPORT.md` for the actual run output.

`FallbackAIProvider` (`lib/ai/provider-selector.ts`) tries providers in
`AI_PROVIDER_ORDER`, falls back on timeout/error, and always has
`MockAIProvider` as a final fallback — an AI provider outage degrades to
"no new AI-proposed tests this run," never to a broken evaluation. AI is
never on the path that decides a verdict.

## 8. Mutation testing

`lib/mutation/mutators.ts` applies six source-level mutation rules
(comparison reversal, wrong-formula operator mutation, broken
initialization, off-by-value counting, and two loop-boundary mutations)
to the reference solution, producing real mutant source files.
`lib/mutation/harness.ts` runs each mutant through the actual sandbox
against the actual published hidden suite and records whether any hidden
test caught it (`killed`) or not (`survived`) — a genuinely computed
detection rate, written to `test_quality_reports`, not an invented
number. In the run captured in `FINAL_REPORT.md`, the seeded suite
detected 6/6 mutants (100%); the harness and the demo script both handle
and clearly report the "survived" case too; it just didn't occur this
run. Mutation testing only ever runs mutated copies of the trusted
reference solution — it never touches student submission data.

## 9. What's simplified or not implemented

Named explicitly, per the spec's own truthful-completion rule — full
itemized status is in `FINAL_REPORT.md`:

- **Authentication**: `lib/http/auth.ts` is a header-based stub (`x-user-id`),
  clearly marked as such. There is no real session system in this
  environment to integrate with. Swapping in real Supabase auth is
  contained to that one file.
- **Queueing**: evaluation runs synchronously inside the API request in
  this implementation. The spec's "queues/workers" integration point is
  real in the sense that `evaluateSubmission()` is already a standalone,
  side-effect-tracked async function you can hand to a queue worker
  unchanged — but no actual queue is wired up here.
- **Languages**: Python and Node adapters are real and tested. The
  adapter interface (`lib/sandbox/adapters.ts`) is designed so adding a
  compiled language (C++, Java) means adding an adapter with a `compile`
  step, not touching the rest of the engine — but no compiled-language
  adapter is implemented here.
- **Skill/evidence engine**: `evidence_records` are written with real,
  traceable data (category, outcome, metric) on every evaluation, in the
  shape a future mastery engine would consume — but no such engine exists
  here (the spec explicitly says not to build one).
- **Admin UI**: there is no author/admin web interface for creating or
  reviewing hidden tests — that happens via the seed script and direct
  SQL/service-role calls in this implementation. The API/DB layer
  supports it; the UI does not exist.
- **Production-grade sandbox**: see §4 — bubblewrap + ulimit is real and
  tested, not gVisor/Firecracker-grade.
- **Version-pinning regression test with two live suite versions**: the
  immutability trigger is tested; an end-to-end scenario with two
  *published* versions and a submission still referencing the older one
  is not automated in this repo.
