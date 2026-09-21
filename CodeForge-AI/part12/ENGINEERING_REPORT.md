# CodeForge AI — Submission System: Engineering Report

## 0. Before anything else: what environment this was built in

The build prompt instructs: *"Inspect the existing repository... reuse existing
infrastructure... do not invent architecture that already exists."* There is no
existing CodeForge repository in this environment — no upload, no connected
repository, no code in context. This matches the established pattern from prior
CodeForge sessions (the diagnostic engine, the Engineering Simulator): a self-contained
reference implementation, designed to the same conventions and demo-verified against
real execution, delivered with an honest account of what's proven vs. what needs the
real repository to finish wiring.

Two consequences follow directly from that, and shape everything below:

- **No live Postgres/Supabase.** No network access, nothing installable. The DB layer
  (schema, RLS, SECURITY DEFINER functions) is written as complete, real SQL, but has
  **never executed against a live database** — verified by careful manual re-reading,
  not by `psql`.
- **Why zero-dependency.** No `npm install` succeeds here (no network egress). Every
  file under `src/` and `tests/` runs on Node built-ins only — no Express, no Supabase
  client, no Zod, no test framework. TypeScript, `tsx`, React, and `react-dom` happen to
  be *globally* preinstalled in this sandbox (a sandbox convenience, not a project
  dependency), which is what made it possible to write this in real TypeScript and
  actually execute it, rather than write pseudocode. `@types/node` and `@types/react`
  are **not** available anywhere (no network to fetch them), so `types/node-shims.d.ts`
  and `types/react-shims.d.ts` are small, hand-rolled, deliberately-scoped ambient
  declarations — just enough surface for `tsc --noEmit` to be a real gate, not a
  replacement for the real `@types/node` / `@types/react` the host repo already has.

Everything claimed as "real" below was actually executed in this environment. Where
something wasn't (Supabase, the real hidden-test engine, real deployment), it's marked
**BLOCKED** and says exactly why, per the spec's own instruction not to claim
functionality that wasn't implemented and tested.

---

## 1. Architecture

### Discovered
Nothing — no repository was present to inspect (see §0).

### Implemented
A layered module (`db/` + `src/`) designed to slot into a Supabase/Postgres + TypeScript
CodeForge backend, structured so every external dependency (storage, execution sandbox,
problem data) is an interface with exactly one call site:

```
Client
  → src/api/handlers.ts            (framework-agnostic HTTP handlers)
    → src/services/submissionService.ts   (validate → hash → freeze → enqueue)
      → src/services/validation.ts        (auth/deadline/quota/size/language checks)
      → src/services/hashing.ts           (SHA-256 source fingerprinting)
      → src/repository/*Repository.ts     (idempotent atomic creation)
        → db/migrations/0002_functions.sql (create_submission_atomic, Postgres)

src/worker/worker.ts                (claim → compile → run → aggregate → finalize)
  → src/repository/*Repository.ts   (claim/finalize — exactly-once)
  → src/execution/*Provider.ts      (compile/run — pluggable sandbox)
  → src/worker/problemDataResolver.ts (pluggable: public/hidden test data)
  → src/services/resultAggregation.ts (deterministic verdict, zero AI)

src/worker/sweeper.ts               (stuck-job recovery → JUDGE_ERROR, never silent)
src/frontend/*.tsx                  (workspace-embedded status/history UI)
```

The **repository interface** (`src/repository/submissionRepository.ts`) is the single
seam between business logic and storage: `InMemorySubmissionRepository` (fully tested,
real async locking) and `SupabaseSubmissionRepository` (written correctly, untested here
— see §0) both implement it. Nothing in `services/`, `worker/`, or `api/` imports either
implementation directly.

The **execution provider interface** (`src/execution/executionProvider.ts`) is the
seam to CodeForge's real sandbox. `LocalProcessExecutionProvider` is a dev/test
reference implementation — real subprocess isolation controls, **not** production-secure
kernel-level sandboxing. Its file header and §7 explain exactly why, including a real
incident found by testing it.

---

## 2. Files created

**49 files, ~6,600 lines**, zero of it boilerplate padding — every file is real,
type-checked, and (where executable) test-covered.

| Area | Files |
|---|---|
| DB migrations | `db/migrations/0001_enums_and_core_tables.sql`, `0002_functions.sql`, `0003_rls_policies.sql`, `0004_optional_external_fk_hooks.sql` |
| Domain | `src/domain/{enums,types,stateMachine,config,asyncUtils}.ts` |
| Services | `src/services/{validation,hashing,submissionService,resultAggregation,dto,rateLimiter,sanitize}.ts` |
| Execution | `src/execution/{executionProvider,languageRuntimes,localProcessExecutionProvider}.ts` |
| Repository | `src/repository/{submissionRepository,inMemorySubmissionRepository,supabaseSubmissionRepository}.ts` |
| Worker | `src/worker/{worker,sweeper,problemDataResolver,fixtureProblemDataResolver}.ts` |
| API | `src/api/handlers.ts` |
| Frontend | `src/frontend/{SubmissionStatusPanel,SubmitButton,SubmissionHistoryPanel}.tsx` |
| Tests | 14 files under `tests/`, see §6 |
| Types (sandbox-only) | `types/{node-shims,react-shims}.d.ts` |
| Project | `package.json`, `tsconfig.json`, `.env.example`, `README.md`, this report |

## Files modified
None — no repository existed to modify (§0).

---

## 3. Database migrations

`0001` — enums (`submission_status`, `verdict`, `evaluation_job_kind/status`, etc.) and
9 tables: `attempts`, `submissions`, `submission_files`, `idempotency_keys`,
`evaluation_jobs`, `evaluation_results`, `re_evaluations`, `audit_events` — plus every
constraint/index/unique-index described below. `problem_id`/`assessment_id` are left as
bare `uuid` columns rather than guessed foreign keys; `0004` has the commented-out `ALTER
TABLE` statements to wire them to your real `problems`/`assessments` tables once
confirmed (spec: *"do not invent architecture that already exists"* — guessing your
schema and shipping a migration that fails to apply would violate that worse than
leaving an explicit gap).

`0002` — 8 SECURITY DEFINER functions, the **only** write path after a submission row
exists (see §5, RLS has no client UPDATE policy on `submissions`/`evaluation_jobs`/
`evaluation_results` at all):

- `create_submission_atomic` — idempotency claim, row-locked quota check, snapshot
  insert, job enqueue, all in one transaction.
- `claim_next_evaluation_job` — `FOR UPDATE SKIP LOCKED`, reclaims expired leases.
- `mark_evaluation_job_running`, `extend_evaluation_job_lease`, `mark_evaluation_job_failed`
- `finalize_evaluation` — the exactly-once guard: `UPDATE ... WHERE claimed_by = X AND
  status IN (...)`, so a stale/zombie claimant's finalize affects zero rows instead of
  double-writing.
- `initiate_reevaluation` — role-checked, links old/new results, never deletes.
- `recover_stuck_evaluation_jobs` — expired-lease sweep, DEAD_LETTERs exhausted jobs.
- `transition_submission_status` — general-purpose guarded transition for
  CANCELLED/JUDGE_ERROR, defense-in-depth alongside `stateMachine.ts`.

`0003` — RLS enabled on all 8 client-facing tables. Three integration-point functions
(`current_app_role`, `is_problem_author`, `is_interviewer_for_attempt`) are stubs that
**fail closed** until pointed at CodeForge's real role/authorship/interview tables —
student own-row access doesn't depend on them and works immediately.

---

## 4. State machine

`src/domain/stateMachine.ts` — a single frozen transition table, exhaustively unit
tested (`tests/stateMachine.test.ts`, 9 checks: every spec-named legal transition, every
spec-named forbidden client jump, all 12×12 = 144 pairs classified, terminal states
verified to have zero outgoing edges). `0002_functions.sql`'s
`transition_submission_status` enforces the same rules at the DB layer independently.

**Design decision, stated plainly:** `SUBMITTED → VALIDATING → QUEUED` all happen inside
one DB transaction rather than as three durable row states, because deep validation
(auth, deadline, language, size, quota-precheck) runs in `submissionService.ts` *before*
`createSubmissionAtomic` is ever called — a row is only created once already valid (spec:
*"reject invalid submissions early... before consuming expensive execution
resources"*). The transition table still enforces these as real, separately-checkable
steps; they're just not separately durable in this design. `DRAFT` is in the enum for
schema completeness but is never a persisted submission row — the workspace/editor is
pre-submission, per spec's own "Workspace vs Submission" section.

---

## 5. Security controls

| Control | Where | Verified |
|---|---|---|
| No client-writable submission status | RLS: no UPDATE policy on `submissions`/`evaluation_jobs`/`evaluation_results` for the client role; only SECURITY DEFINER functions write | Read carefully; not executed against live PG (§0) |
| Server-authoritative IDs | `gen_random_uuid()` server-side everywhere; nothing accepts a client-supplied ID | Code review |
| IDOR protection | `src/services/dto.ts`'s `canViewSubmission` (owner / instructor / admin / problem-author / assigned-interviewer only) | `tests/api.test.ts` — 2 explicit IDOR attempts (fetch + cancel another student's submission), both 403, state provably untouched |
| Mass-assignment protection | `SubmissionRequest` has no ownership field at all; `actor.userId` comes only from the resolved session | `tests/api.test.ts` |
| Hidden-test leakage | `HiddenResult` type is aggregate-only by construction (4 numeric fields, no case/input/output/id/weight field exists) | `tests/resultAggregation.test.ts`, `tests/dto.test.ts` (deliberate contamination test — injected fake `rawExpectedOutput`/`hiddenTestIds`/`checkerSource` via `as unknown as`, confirmed the DTO's field-by-field reconstruction strips them), and `tests/endToEnd.test.ts`'s leakage check against **real** hidden fixture values through the **full** real pipeline |
| Admin-only diagnostics | `canViewAdminDebugInfo` — stricter than general view access; instructor/interviewer excluded | `tests/api.test.ts` |
| Re-evaluation authorization | Checked in both `dto.ts` (API-layer 403) and the DB function itself (defense in depth) | `tests/api.test.ts`, `tests/reEvaluation.test.ts` |
| Rate limiting | Generic token bucket, keyed by caller (`user:`, `ip:`, extensible to `assessment:`/`problem:`) | `tests/rateLimiter.test.ts` (deterministic clock), `tests/api.test.ts` (429s under a configured cap) |
| Path traversal | Rejected in `validation.ts` (pre-creation) **and independently** in `localProcessExecutionProvider.ts` (pre-write, resolves and checks the path stays inside the work dir) | `tests/validation.test.ts`, `tests/executionProvider.test.ts` |
| Secret isolation | Execution subprocess env is `{PATH, HOME, LANG}` only — no Supabase/Groq/Gemini keys ever reach candidate code | Code review; `LocalProcessExecutionProvider`'s `spawnWithLimits` |
| Error responses never leak internals | `handlers.ts` maps every error to a human string + code; no stack/path ever serialized | `tests/api.test.ts` |
| No AI in the trust path | `resultAggregation.ts` has zero network/LLM calls — pure functions over `RunResult` | Code review — grep for `fetch`/`http` in that file returns nothing |

---

## 6. Tests — 14 files, 138 checks, all real, all passing

```
npm test
```

runs all of them; ~60–90s (the execution-provider and end-to-end suites really compile
and run Python/C/C++/Node programs).

| File | Checks | What it actually proves |
|---|---|---|
| `stateMachine.test.ts` | 9 | Exhaustive transition table, spec-named legal/forbidden cases |
| `hashing.test.ts` | 7 | SHA-256 against a known test vector, order-independence, UTF-8 byte counting |
| `validation.test.ts` | 18 | Deadline before/at-boundary/after (inclusive), size/file-count/path-traversal limits, quota precheck |
| `dto.test.ts` | 9 | Authorization matrix (owner/staff/interviewer), **deliberate leakage-contamination test** |
| `rateLimiter.test.ts` | 6 | Token bucket refill math, per-key isolation, deterministic clock |
| `idempotency.test.ts` | 7 | **12 concurrent** double-submits → exactly 1 row; **8 concurrent** requests against quota-3 → exactly 3 succeed, numbered 1-3 with no gaps |
| `workerLifecycle.test.ts` | 9 | **12 workers racing 5 jobs** → no duplicate claims; lease-expiry reclaim; **stale-claim rejection** (zombie worker's write is refused, official result unchanged); **concurrent duplicate finalize** → exactly one wins |
| `reEvaluation.test.ts` | 4 | Role check, in-flight rejection, original result preserved + new one linked |
| `sweeper.test.ts` | 3 | DEAD_LETTER → JUDGE_ERROR surfaced (the piece that stops a student waiting forever) |
| `resultAggregation.test.ts` | 17 | Verdict priority ordering, weighted scoring, aggregate-only `HiddenResult` |
| `executionProvider.test.ts` | 10 | **Real** python3/gcc/g++/node compile+run: accepted, runtime error, compile error, C++, Node, **real** TLE/output-limit/memory-limit enforcement, path-traversal block |
| `api.test.ts` | 10 | **2 IDOR attempts**, mass-assignment, rate-limit 429s, idempotent-replay 200-vs-201, no-internals-in-errors |
| `reactRender.test.ts` | 22 | **Real** `react-dom/server` render across all 12 submission states + 3 verdicts; non-color-only text checks; exact spec-mandated JUDGE_ERROR message |
| `endToEnd.test.ts` | 7 | Full pipeline, real code, real verdicts: **ACCEPTED, WRONG_ANSWER, COMPILATION_ERROR, RUNTIME_ERROR, TIME_LIMIT_EXCEEDED, malicious-code-contained, and a leakage check against real hidden fixture values** |

### Concurrency tests (spec: "test two submissions at the same instant... duplicate
requests... worker retry... worker duplication")
`idempotency.test.ts` and `workerLifecycle.test.ts` above — real `Promise.all`/
`Promise.allSettled` races against a repository with genuine async mutexes (not
"correct because JS is single-threaded"; see `src/domain/asyncUtils.ts` and
`InMemorySubmissionRepository`'s file header for why the race windows are real).

### Failure-injection tests (spec: "simulate... worker crash... sandbox crash")
Worker crash → `_debugExpireLease` + reclaim (`workerLifecycle.test.ts`), exhausted
retries → DEAD_LETTER → JUDGE_ERROR (`sweeper.test.ts`), any unexpected exception during
evaluation → `worker.ts`'s catch-all finalizes JUDGE_ERROR rather than hanging or
mis-marking the student (exercised implicitly by the malicious-code E2E test, which hits
real subprocess failure paths).

### What's genuinely NOT covered
Load testing at real scale (would need staging infrastructure — §8), and any test that
requires a live Postgres connection (RLS enforcement is *designed* and *read carefully*,
not *executed* — see §5's "Verified" column and §0).

---

## 7. Malicious-code testing: what actually happened

This section exists because the spec explicitly says "attempt to break the system, fix
what fails" and "never claim functionality that was not actually implemented and
tested" — and something genuinely broke during testing. Reporting it is more useful
than a clean-sounding summary that omits it.

**What happened:** The first version of the fork-bomb containment test
(`os.fork()` in a loop) hung for the full 90-second outer timeout and left **18,592**
Python processes running, because (1) this container runs as **root**, and Linux's
`RLIMIT_NPROC` (`ulimit -u`) has never applied to root, and (2) the wall-clock-timeout
kill only targeted the single tracked child PID — every forked descendant was orphaned
and kept running independently.

**The fix:** `spawn(..., { detached: true })` makes the child the leader of its own
process group; the timeout handler now sends `SIGKILL` to the whole group
(`process.kill(-pid, 'SIGKILL')`), not just the tracked PID. Verified in isolation
(a 300ms-window fork bomb settled from a spike back to baseline process count within
~2s) and end-to-end (the full test suite, including the fork bomb, now passes and
settles cleanly). An attempted further improvement — actively polling process-group
size via `pgrep` and killing early — was tried, measured, and **reverted**: the
monitoring subprocess itself competed for CPU with the fork bomb under contention and
made the transient spike *worse*, not better. That's documented in
`localProcessExecutionProvider.ts`'s git history / comments rather than hidden.

**What this proves, honestly:** the fix works and is verified — but it *bounds* a fork
bomb's blast radius (via a short wall-clock window), it does not *prevent* one outright.
A real production sandbox needs a cgroup `pids.max` controller or PID-namespace
isolation to cap process count outright. `LocalProcessExecutionProvider`'s file header
says this explicitly and is not a boilerplate disclaimer — it's a direct writeup of what
was actually found.

---

## 8. IMPLEMENTED / PARTIALLY IMPLEMENTED / BLOCKED / NOT IMPLEMENTED

**IMPLEMENTED** (real code, real tests, passing in this environment):
state machine · idempotent atomic creation · quota enforcement (sequential + concurrent)
· source validation (size/count/path-traversal/language) · server-side deadline
enforcement · SHA-256 source fingerprinting · worker claim/lease/exactly-once-finalize ·
stuck-job recovery + JUDGE_ERROR surfacing · re-evaluation workflow with immutable
history · deterministic verdict classification (compile/runtime/TLE/MLE/OLE/WA/AC) ·
aggregate-only hidden results · role-aware DTOs + IDOR/mass-assignment tests · rate
limiting · audit event recording · dev-reference sandboxed execution (real gcc/g++/
python3/node, real `/proc`-based CPU+memory measurement, verified malicious-code
containment after a fix) · API handlers with authorization on every route · 3 React
components with real SSR verification across every state.

**PARTIALLY IMPLEMENTED**:
- **RLS** — full policies + SECURITY DEFINER-only write path are written and read
  carefully multiple times, but never executed against live Postgres (§0). The
  student-own-row logic doesn't depend on the integration-point stub functions; the
  staff/author/interviewer branches do and fail closed until wired.
- **Multi-language support** — 4 runtimes registered and tested (python, javascript,
  c, cpp); the registry pattern (`languageRuntimes.ts`) is designed for CodeForge's full
  list to be added the same way, but only these 4 were actually exercised.
- **Realtime status** — `useSubmissionPolling` is real and tested-by-render; a Supabase
  Realtime channel implementation is described (comment in the hook) but not written,
  since there's no live Supabase connection to write it against meaningfully.

**BLOCKED** (needs infrastructure this environment doesn't have):
- Executing the SQL migrations against a live Postgres/Supabase project (no network, no
  project).
- `SupabaseSubmissionRepository` actually connecting (written correctly against the
  real `@supabase/supabase-js` API surface; needs the package installed + real
  credentials + network — none available here).
- Integrating `ProblemDataResolver` and `ExecutionProvider` against CodeForge's real
  problem system and real secure sandbox — both are clean interfaces with exactly one
  call site each, specifically so this wiring is additive, not a rewrite.
- Real load testing at scale (needs a staging deployment).

**NOT IMPLEMENTED**: nothing was scoped out silently — everything in this category is
listed under BLOCKED above with a reason.

**DEMO ONLY**: `FixtureProblemDataResolver` (one hardcoded A+B problem, used by the E2E
tests) and `LocalProcessExecutionProvider` (see §7) — both explicitly labeled as such in
their own file headers, not just here.

---

## 9. Final production audit — answered directly

*(spec's own checklist, answered as this implementation currently stands)*

| Question | Answer |
|---|---|
| Can a student modify a submission after submission? | No — no UPDATE policy exists for the client role; only SECURITY DEFINER functions write, and none of them accept student-supplied field values for existing rows. |
| Can a student access another student's source? | No — RLS + `canViewSubmission`/`assertCanView`, tested via 2 explicit IDOR attempts. |
| Can a student manipulate their score? | No — score is computed only in `resultAggregation.ts` from real execution output and written only by `finalize_evaluation`, which the client cannot call directly (SECURITY DEFINER, invoked only by the worker). |
| Can a student bypass the deadline? | No — `validateDeadline` uses only server-injected `now()`; no code path reads a client timestamp. |
| Can a student bypass submission limits? | No — enforced atomically inside `create_submission_atomic`'s row-locked transaction; tested under 8-way concurrency against a limit of 3. |
| Can duplicate requests corrupt submissions? | No — idempotency key + unique constraint; tested with 12 concurrent identical requests → exactly 1 row. |
| Can two workers finalize the same submission? | No — `finalize_evaluation`'s claim-ownership WHERE clause; tested with a real stale-claim scenario and a real concurrent-duplicate-finalize race. |
| Can a worker execute the wrong source? | No by construction — `run()` re-writes files from the submission snapshot on every call, never trusting prior on-disk state. |
| Can a submission execute against the wrong problem version? | No — versions are frozen at creation (`problem_version_id` etc. on the row) and never re-resolved. |
| Can hidden-test data leak? | No — `HiddenResult` is aggregate-only by type, and a deliberate contamination test confirms the DTO layer strips extra fields even if something upstream were buggy. |
| Can malicious code access secrets? | No — subprocess env is `{PATH, HOME, LANG}` only. |
| Can malicious code escape the sandbox? | **Partially mitigated, not prevented** — see §7. The dev/test provider is explicitly not production-secure; this is the most honest answer in this table. |
| Can a worker crash permanently lose a submission? | No — lease expiry + sweeper + DEAD_LETTER → JUDGE_ERROR; tested. |
| Can infrastructure failure incorrectly mark a student wrong? | No — any unexpected exception in the worker finalizes JUDGE_ERROR, a distinct terminal state, never COMPLETED. |
| Can an admin operation bypass authorization? | No — checked at both the API layer and inside the SECURITY DEFINER function itself (defense in depth). |
| Can RLS be bypassed? | Designed not to be, **not executed against live Postgres to confirm** — see §0/§8. |
| Can historical evaluations change unexpectedly? | No — `evaluation_results` rows are never updated, only inserted; `is_official` is reassigned, the row itself is immutable. |
| Can the system handle many simultaneous submissions? | Concurrency-*correctness* proven (12-way, 8-way races); throughput/scale *not* tested (needs real infra — §8). |

---

## 10. Environment variables

See `.env.example` — every value ships blank. Summary: `SUPABASE_URL` /
`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` (blank, integration
point), `GROQ_API_KEY` / `GEMINI_API_KEY` (blank — and unused by any authoritative
verdict/score path, see §5's "No AI in the trust path"), worker tuning
(`WORKER_CONCURRENCY`, `WORKER_LEASE_SECONDS`, ...), submission limits
(`MAX_SOURCE_SIZE_BYTES`, ...), rate limits, and `EXECUTION_PROVIDER` (defaults to
`local-process`; set to whatever key you register the real sandbox under).

## 11. Commands

```bash
npm test                 # all 14 test files
npm run typecheck        # tsc --noEmit
npm run worker           # NOT runnable here — needs a real SubmissionRepository (§8)
npm run sweeper          # same
```

## 12. Deployment considerations
Run `db/migrations/*.sql` in order on a fresh Postgres/Supabase project → wire
`current_app_role`/`is_problem_author`/`is_interviewer_for_attempt` (§3) → implement and
register a real `ExecutionProvider` (never `LocalProcessExecutionProvider` — §7) → run
`worker.ts`'s loop as a long-lived process (or several, per `WORKER_CONCURRENCY`) and
`sweeper.ts`'s loop on a schedule → mount `api/handlers.ts` behind real auth middleware
that resolves `AuthenticatedActor` server-side.

## 13. Known limitations
Everything in §8's BLOCKED/PARTIALLY IMPLEMENTED sections, plus: `submission_files`
stores source as a `text` column rather than object storage — fine at the configured
128KB/file limit, but worth revisiting if CodeForge allows larger multi-file projects;
`computeRequestFingerprint` in `handlers.ts` is a simple JSON-based hash rather than a
dedicated content-hash function, adequate for idempotency-key-reuse detection but not
optimized.
