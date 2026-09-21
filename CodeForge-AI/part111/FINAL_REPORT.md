# Final Report — Hidden Test Engine

Status labels below follow the spec's own rule: IMPLEMENTED / PARTIALLY
IMPLEMENTED / BLOCKED / NOT IMPLEMENTED / DEMO ONLY. Nothing is marked
IMPLEMENTED unless it was actually run in this environment and the output
is reproducible with the commands in `README.md`.

## Architecture discovered

**None.** The prompt required inspecting an existing "CodeForge AI"
repository before writing any code. That repository was searched for
explicitly (`find / -iname "*codeforge*"`, checked `/mnt/user-data/uploads`,
checked for any `.git` directory) at the very start of this session and
does not exist anywhere in this environment. Everything below was built as
a standalone codebase, architected to match the vocabulary in the spec
(Supabase/Postgres, RLS, Groq, Gemini) so it can be merged into a real
CodeForge repo. See `docs/ARCHITECTURE.md` §0 for the full explanation.

## Existing systems reused

None available to reuse (no existing repo). Where the spec said "reuse
X," this implementation instead built a clearly-scoped, swappable
equivalent and documented the integration seam: `lib/http/auth.ts` for
authentication, `evaluateSubmission()` as a queue-worker-ready function
for queues/workers, `lib/sandbox/adapters.ts` for language execution.

## New components — IMPLEMENTED and verified in this session

- **Data model & migrations** (`db/migrations/0001`–`0008`): problems,
  problem_versions, test_suites, test_suite_versions, hidden_test_cases,
  checkers, reference_solutions, test_generators, submissions,
  evaluation_runs, submission_test_runs, evidence_records, audit_log,
  test_quality_reports. Applied to a real local PostgreSQL 16 instance;
  reset-and-reapply verified clean multiple times this session.
- **Immutability enforcement** (`0005_immutability_triggers.sql`):
  database triggers, not app-layer convention. Verified live: an UPDATE
  to a published `test_suite_version`, and an UPDATE to a
  `hidden_test_case` under a published suite, were both actually attempted
  (including as the privileged service role) and both actually rejected.
- **RLS + authorization** (`0006_rls_policies.sql`, `0007_safe_result_rpc.sql`,
  `0008_grants.sql`): verified via `scripts/rls-security-demo.ts` — **15
  real attack attempts, 15/15 blocked or correctly allowed**, including a
  real bug this session found and fixed live (an over-broad initial GRANT
  configuration that accidentally blocked legitimate admin access too,
  not just students — see the commit history in `db/migrations/0008_grants.sql`'s
  comments).
- **Sandbox** (`lib/sandbox/`): unprivileged user + bubblewrap namespace
  isolation + ulimit + timeout + an RSS watchdog for Node's memory limit
  (ulimit -v doesn't work for V8 — verified empirically, not assumed; see
  `docs/ARCHITECTURE.md` §4). All of network isolation, filesystem
  isolation, CPU/wall-clock limits, memory limits (both languages), output
  size limits, and fork-bomb containment were verified against real
  adversarial programs, not simulated.
- **Verdict engine & scoring** (`lib/engine/verdict.ts`,
  `lib/engine/scoring.ts`): all 9 verdicts implemented; infrastructure
  failures provably cannot become student-fault verdicts (unit-tested).
  Deterministic aggregation (unit-tested for determinism directly).
- **Output comparison** (`lib/engine/comparators.ts`): exact,
  whitespace-normalized, numeric-tolerance (per-token, configurable),
  structured (order-independent), and custom/special-judge (sandboxed,
  isolated from candidate code).
- **Anti-leakage safe-result serializer** (`lib/engine/safe-result.ts`):
  the sole function allowed to produce a student-facing result; verified
  by fuzzing real secret-shaped strings through it across all 4 assessment
  modes and asserting none appear.
- **AI-assisted test generation + validation pipeline** (`lib/ai/`): real
  provider interface, a deterministic mock provider (used in every test/demo,
  since no live key is configured), real Groq/Gemini client code (untested
  live — no key), and the full validation pipeline (schema → structure/bounds
  → duplicate detection → reference-solution execution → quality gate).
  Run for real: 5 proposals in, 1 correctly accepted, 4 correctly rejected
  with specific reasons.
- **Mutation testing** (`lib/mutation/`): 6 real source-level mutators,
  run against the actual published hidden suite via the actual sandbox.
  Result this run: 6/6 mutants killed (100% detection), a computed number,
  written to `test_quality_reports`.
- **API layer** (`app/api/`): 3 real Next.js route handlers (submit, get
  result, get problem), tested by invoking the actual handler functions
  with constructed requests AND by curl against a real running
  `next start` server.
- **UI** (`app/`): one real, compiling, working Next.js page — problem
  statement, public tests, code editor, submit flow, and a safe-result
  panel that visually mirrors the trust boundary. Verified via `next build`
  and a live `curl` round-trip. **Not visually screenshotted/QA'd** — this
  environment has no browser to render it in; the design was built
  carefully but its actual on-screen appearance is unverified.
- **Audit logging** (`lib/db/audit.ts`): type-enforced allowlisted
  metadata shape (can't pass arbitrary/sensitive fields), real inserts on
  every evaluation.

## Database changes

9 migration files, all applied and re-applied cleanly from a blank
database multiple times this session (`npm run db:migrate`, idempotent via
a `_migrations` tracking table).

## API changes

`POST /api/submissions`, `GET /api/submissions/[id]`,
`GET /api/problems/[slug]` — all new (no prior API existed).

## Frontend changes

One new page (`app/page.tsx` + `app/workspace-client.tsx`) — all new.

## Execution changes

New sandbox execution stack entirely (`lib/sandbox/`,
`sandbox-runtime/execute.sh`, `/opt/hidden-test-engine/execute.sh`).

## Security boundaries

Documented in full in `docs/ARCHITECTURE.md` §1 and §4. Summary: DB-level
(RLS + grants + SECURITY DEFINER RPC), application-level (safe-result
allowlist), and execution-level (namespace isolation + resource limits) —
three independent layers, each tested independently, per the spec's
"defense in depth" instruction rather than a single choke point.

## Test-generation implementation

IMPLEMENTED for one problem shape (`pairSumFormatValidator` in
`lib/ai/validation-pipeline.ts`) with a pluggable interface for others.
Boundary-value generation is manual (hand-authored in
`scripts/seed-demo-problem.ts`) rather than a generic constraint-driven
generator — PARTIALLY IMPLEMENTED relative to the spec's "systematically
consider min/max/zero/one/..." request for arbitrary problem schemas.

## Checker implementation

IMPLEMENTED: exact, whitespace-normalized, numeric-tolerance, structured,
and custom (sandboxed). All exercised by real unit tests.

## Versioning implementation

IMPLEMENTED and trigger-enforced (see above). The specific "two published
versions, old submission still pinned to the first" end-to-end scenario is
NOT IMPLEMENTED as an automated test, though the underlying mechanism
(submission → problem_version_id, evaluation_run →
test_suite_version_id, both immutable foreign keys) is in place and
covered indirectly by the immutability trigger tests.

## AI integration

PARTIALLY IMPLEMENTED / DEMO ONLY for live providers: the interface,
validation pipeline, and fallback chain are real and tested; Groq and
Gemini clients are real code that has never made a real network call in
this session, because `GROQ_API_KEY`/`GEMINI_API_KEY` are intentionally
empty. Every AI-related test and demo in this repo runs against
`MockAIProvider`.

## Observability

PARTIALLY IMPLEMENTED: structured audit logging is real; resource-usage
recording (`evaluation_runs.resource_summary`) is real. A metrics/alerting
pipeline (evaluation latency percentiles, queue latency, dashboards) is
NOT IMPLEMENTED — there's no queue or metrics backend in this repo to
report on.

## Tests executed

```
npm test  ->  5 test files, 48 tests, 48 passed, 0 failed
```
Breakdown: 11 sandbox integration tests (real bwrap/ulimit/timeout), 8
anti-leakage tests, 10 scoring unit tests, 12 comparator unit tests, 7 API
route integration tests. Reproducible from a blank database via the
commands in `README.md`.

## Security tests executed

`scripts/rls-security-demo.ts`: **15/15 passed**, against a real
Postgres instance — direct hidden-table access (6 tables), IDOR on
another student's submission (both direct SELECT and via the safe RPC),
impersonation via INSERT, parameter tampering (weight mutation),
immutability bypass attempts (2, including as the privileged role), and
confirmation that legitimate admin/self access still works (2). One real
vulnerability was found and fixed during this process (see above).

Not executed: SQL injection / command injection / path traversal /
sandbox-escape fuzzing beyond the specific probes in
`scripts/sandbox-safety-demo.ts` (filesystem read, network connect,
directory listing — all blocked). Parameterized queries are used
throughout (no string-concatenated SQL), which structurally prevents
classic SQL injection, but this claim was not adversarially fuzzed.

## Performance tests executed

`scripts/e2e-demo.ts` includes a real O(n²) vs O(n) distinction: a
150,000-element hidden test that the correct O(n) solution passes in
normal time and the correct-but-brute-force O(n²) solution fails via a
real `TIME_LIMIT_EXCEEDED` (not simulated — the brute-force solution
actually ran until the wall-clock timeout killed it). No load/concurrency
testing (many simultaneous submissions) was performed — NOT IMPLEMENTED.

## End-to-end result

`scripts/e2e-demo.ts`, run against the real seeded problem (13 hidden
tests across all 8 categories) and 5 real candidate solutions:

| Solution | Verdict | Score | Matches prediction? |
|---|---|---|---|
| correct.py | ACCEPTED | 100/100 | yes |
| buggy_duplicate_blind.py | WRONG_ANSWER | 46.15/100 | yes — fails exactly the duplicate/self-pair hidden tests (edge, adversarial, regression), passes basic/boundary |
| bruteforce_inefficient.py | TIME_LIMIT_EXCEEDED | 73.08/100 | yes — fails only large_input/performance, passes all correctness categories including the duplicate-heavy ones |
| resource_violator.py | MEMORY_LIMIT_EXCEEDED | 0/100 | yes |
| malicious_probe.py | ACCEPTED | 100/100 | yes — filesystem read, network connect, and directory listing were all confirmed blocked (verified via stderr capture), and containment did not affect the (correct) verdict |

Also confirmed in the same run: hidden input/expected-output content does
not appear in any of the 5 SafeResult payloads returned.

## Files created

62 files (see `README.md` "Layout" for the directory map), ~4,700 lines
of TypeScript/SQL across the engine, API, migrations, tests, and demo
scripts (excludes `node_modules`, `.next`, `package-lock.json`).

## Files modified

None — no existing files, because no existing repository.

## Environment variables

See `.env.example`. `DATABASE_URL`, Supabase keys, `GROQ_API_KEY`,
`GEMINI_API_KEY`, and `EVIDENCE_SIGNING_SECRET` are all present but
**intentionally left empty** for you to fill in, as requested.

## Commands to run

See `README.md` "Setup" and "Verifying it for yourself" — every command
listed there was actually run to produce the results in this report.

## Known limitations

Listed in full, honestly, in `docs/ARCHITECTURE.md` §9. The short version:
no real auth system (header stub), synchronous evaluation instead of a
queue, two working language adapters (Python/Node) rather than a full
compiler matrix, no admin UI, sandbox is namespace-based (bubblewrap) 
rather than hardware-virtualized (gVisor/Firecracker), and AI providers
are real code that has never been called live.
