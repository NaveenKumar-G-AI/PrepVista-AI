# CodeForge — Debugging Mode

Session-based, evidence-driven debugging assessment engine: reproduce a real
failure, form and test hypotheses, isolate a root cause, ship a fix, and
verify it actually generalizes — with every stage producing evidence a
skill profile can point back to.

**No existing CodeForge repository was present in this environment** (the
uploads folder was empty), so this was built as a clean, standalone
TypeScript service with explicit integration points, ready to drop into the
real codebase — reusing its auth, its challenge/submission tables, and its
editor, rather than duplicating them. Every place that stands in for
something CodeForge already has is marked `INTEGRATION POINT` in code.

## Quick start

```bash
npm install
cp .env.example .env   # every value is intentionally blank - see below
npm run dev            # http://localhost:4000, in-memory storage, deterministic hints
npm test                # 91 tests; ~9s. Set DATABASE_URL to also run the live-Postgres suite.
```

With zero configuration the service is still fully functional: no
`DATABASE_URL` → an in-memory repository (data doesn't survive a restart);
no AI provider key → the debugging coach falls back to deterministic,
evidence-derived hints instead of calling out anywhere. Nothing pretends to
be configured when it isn't, and nothing crashes because it isn't.

## Architecture

```
src/
  types.ts                shared domain types, runtime capability metadata
  config.ts                env loading with safe defaults
  sandbox/
    executor.ts             process-level sandboxed execution (Python + JS)
    pythonTrace.ts           sys.settrace-based structured execution trace
  debugging/
    session.ts               session state machine
    fingerprint.ts            deterministic failure classification
    investigation.ts         hypotheses, experiments, action log, random-edit detection
    verification.ts          root-cause evidence gate, regression, overfitting, diff
    skillModel.ts             10-dimension scoring, efficiency, timeline, report
  mutation/
    pipeline.ts               operators + Original→Mutate→Validate→Publish pipeline
  ai/
    providers.ts              Groq/Gemini/Anthropic adapters + fallback router
    coach.ts                  hint ladder, prompt-injection defense, schema validation
  repository/
    repository.ts             storage interface + in-memory implementation (default)
    pgRepository.ts            Postgres implementation (used when DATABASE_URL is set)
  api/app.ts                  Express routes wiring all of the above together
  server.ts                   entrypoint
db/schema.sql                 Postgres/Supabase migration, with RLS
web/DebuggingWorkspace.jsx    reference workspace UI (see "Frontend" below)
tests/                        91 tests across all of the above
```

### Why these design choices

- **Repository has two implementations behind one interface.** In-memory by
  default (zero setup, what the tests use), Postgres when `DATABASE_URL` is
  set. Same pattern as the AI router: the system works with nothing
  configured and gets more capable as configuration is added, never the
  other way around.
- **The sandbox executor is an interface (`Executor`), not just a class.**
  `ProcessSandboxExecutor` is real and adversarially tested (see Security,
  below) but is process-level isolation, not container/microVM isolation. A
  production, genuinely multi-tenant deployment should implement `Executor`
  against Firecracker, gVisor, or a managed sandbox (Judge0, Piston) — every
  caller only depends on `Executor.run()`, so that swap touches one file.
- **Root-cause chains and mutations are validated, not trusted.**
  `validateRootCauseChain` rejects any chain missing a link or citing zero
  evidence — this is the literal enforcement of "the AI evaluator must not
  invent this chain without evidence." `generateVerifiedMutation` returns
  `null` rather than a fabricated bug if no operator produces a real,
  reproducible failure.
- **Skill scores are deterministic and evidence-labeled, not an AI verdict.**
  Every dimension score is a small, readable formula over concrete counts
  (hypotheses resolved, tests passed, evidence items cited), and every
  scored dimension carries the `evidence: string[]` that justifies its
  number. AI is used for hint *phrasing*, never for the scores themselves.

## Security model (read before trusting this in production)

Every execution runs as:

```
timeout -s KILL <wallSeconds>
  unshare --net --
    setpriv --reuid=nobody --regid=nogroup --clear-groups
      /bin/bash -c 'ulimit -t <cpu>; ulimit -u <procs>; ulimit -f <size>; ulimit -v <mem>; exec <interpreter> ...'
```

This was **empirically verified in this environment**, not assumed —
`tests/sandbox.test.ts` runs a real infinite loop, a real memory-exhaustion
loop, a real fork bomb, a real attempt to read a permission-protected file,
and a real attempt to reach the network, against the actual executor, and
asserts each one was contained. Two non-obvious things fell out of that
verification and are load-bearing in the code:

1. GNU `timeout` (without `--foreground`) puts itself and the monitored
   command in one new process group and signals that whole group on expiry —
   so `timeout` usually dies *by* the signal (`exitCode: null, signal:
   'SIGKILL'`) rather than exiting cleanly with `128+signum`. An early
   version of this code only checked `exitCode === 137` and silently
   misclassified every real timeout as a plain, reason-less failure. Fixed
   by checking the signal too — see the comment in `sandbox/executor.ts`.
2. A tight `ulimit -v` crashes Node's own V8 startup before any user code
   runs, because V8 reserves a large virtual address space up front. The
   JS runner uses `--max-old-space-size` for the real heap cap and a
   generous `ulimit -v` only as a backstop; Python has no such issue, so
   its `ulimit -v` is tight.

**Honest limitation:** this is process-level sandboxing — namespaces,
rlimits, and a privilege drop — not container or microVM isolation. It
denies network access, denies most filesystem access, and contains the
adversarial cases above, but Python in particular has no restricted-execution
mode worth trusting against a genuinely adversarial actor (`-I` isolated
mode doesn't sandbox `os`/`socket`/`ctypes`). Treat it as a solid first
layer, not a substitute for gVisor/Firecracker/Docker in a real multi-tenant
deployment — hence the `Executor` interface seam.

Row-level security in `db/schema.sql` uses `FORCE ROW LEVEL SECURITY`,
which (also discovered while integration-testing against a live database)
applies to *every* role, including the backend's own pooled connection —
not just other users. The schema documents the standard resolution: the
trusted backend connects with a role granted `BYPASSRLS` (verified against
live Postgres — see `tests/repository.pg.test.ts`), the same way Supabase's
own service-role access works, while RLS does its real job protecting any
more direct access path (a client SDK holding a user's JWT, PostgREST, a
future query that forgets an ownership check). Per-user ownership is also
enforced in the API layer itself (`requireOwnedSession`, covered by an
explicit 403 test).

## Frontend

`web/DebuggingWorkspace.jsx` is a reference implementation of the workspace
layout from the product spec, not the production surface — the real
CodeForge editor/workspace components should replace the code-display and
chrome around it. It follows a deliberate design pass (documented in the
file's header comment): an "evidence board" identity — a diagnostic chain
of five connected nodes (Symptom → Location → Cause → Root Cause → Fix)
whose connecting lines only solidify once that link has cited evidence,
making the "don't invent the chain" rule visible instead of asserted,
rather than a generic dark-mode IDE clone.

## Testing

```
91 tests, 10 files, ~9s (87 always run; 4 more run automatically when DATABASE_URL is set)

tests/sandbox.test.ts         15  real subprocess execution + 5 adversarial security cases
tests/mutation.test.ts         7  real end-to-end mutation generation/validation against the sandbox
tests/api.test.ts              9  full HTTP integration via supertest (in-memory repo, real sandbox)
tests/session.test.ts          6  state machine transitions, valid and invalid
tests/fingerprint.test.ts     13  failure classification from execution evidence
tests/investigation.test.ts    8  hypothesis evidence gate, random-edit detection
tests/verification.test.ts    11  root-cause validation, regression, overfitting, diff
tests/skillModel.test.ts       7  scoring, timeline, report assembly
tests/ai.test.ts              11  provider fallback, injection defense, hint ladder
tests/repository.pg.test.ts    4  live Postgres round-trips (skipped without DATABASE_URL)
```

All of the above were actually executed, not just written — including the
adversarial sandbox cases and the live-Postgres suite (a real local
Postgres 16 instance was installed and migrated to validate `db/schema.sql`
during development). `npx tsc --noEmit` and a full `npm run build` were
also run clean.

---

# Engineering completion report

**Architecture decisions**
- Standalone TypeScript/Express module (no existing repo found to
  integrate into) with a `DebuggingRepository` interface behind in-memory
  (default) and Postgres implementations, and an `Executor` interface
  behind a process-level sandbox implementation — both swappable without
  touching callers.
- AI is provider-abstracted (Groq/Gemini/Anthropic) with a router that
  tries each configured provider and falls back to deterministic,
  evidence-derived hints when none are configured or all fail. Nothing
  about the coaching flow requires a key to function.
- Skill scoring, root-cause validation, regression verification, and
  overfitting detection are deterministic and evidence-labeled; AI is used
  only for hint phrasing, never for the scores or the pass/fail
  verdicts — matching "AI must never fabricate execution results."

**Files created:** 17 source files, 10 test files, 1 SQL migration, 1
reference UI component, plus `package.json`/`tsconfig*.json`/
`vitest.config.ts`/`.env.example` (full list above under Architecture).

**Files modified:** none — nothing existed to modify.

**Database changes:** new migration (`db/schema.sql`) — `debugging_sessions`,
`debugging_fingerprints`, `debugging_hypotheses`, `debugging_experiments`,
`debugging_actions`, `debugging_results`, `debugging_generated_mutations`,
all with indexes, FKs, and RLS+FORCE policies. Deliberately does not touch
users/challenges/submissions — those are assumed to already exist.

**API changes:** new routes — `POST/GET /sessions`, `GET .../history`,
`POST .../reproduce`, `POST .../execute`, `POST/PATCH .../hypotheses`,
`POST/PATCH .../experiments`, `POST .../hints`, `POST .../root-cause`,
`POST .../fix`, `GET .../result`. All request bodies are Zod-validated;
error responses map to 400/403/404/409/422 rather than a bare 500.

**Frontend changes:** one reference component (`web/DebuggingWorkspace.jsx`)
demonstrating the workspace layout and the diagnostic-chain signature
element; not wired to real CodeForge editor components (none exist here to
reuse).

**Execution changes:** new sandboxed executor for Python and JavaScript,
with an opt-in structured tracer for Python (`sys.settrace`-based, capped
at 2000 events, scoped to the student's own file).

**AI changes:** new provider-abstraction layer; no calls are made anywhere
in the test suite (all AI tests inject fake providers; the live routers
have zero keys configured per the "leave keys blank" instruction and
degrade to deterministic hints, verified by an explicit test).

**Security changes:** namespace isolation (network), privilege drop (root
→ nobody), CPU/memory/process/file-size rlimits, Node's
`--experimental-permission` model denying `child_process` and
out-of-sandbox filesystem access for the JS runner, minimal/secret-free
child environment, per-execution ephemeral temp directories. All verified
adversarially, not assumed (see Security model above).

**Tests executed:** `npx tsc --noEmit` (twice — once for `src/`, once for
`src/`+`tests/`), `npm run build`, `npx vitest run` (twice — once without
`DATABASE_URL`, once with a live local Postgres), and a manual smoke test
booting the compiled `dist/server.js` with no `.env` file at all and
issuing real HTTP requests against it.

**Test results:** 91/91 passing (87 always-on + 4 live-Postgres). One real
bug was found and fixed *by* this testing (the `timeout`/process-group
signal-detection issue described above) — the test failed honestly, the
underlying cause was diagnosed from first principles, and the fix was
re-verified rather than the assertion being loosened to match the bug.

**Performance considerations:** sandbox executions run as real subprocesses
(150–2000ms each depending on the test), so `/reproduce` and `/fix`
naturally cost multiple execution-widths; `/result` deliberately does *not*
re-run the test matrix on every view (it reads the last persisted `/fix`
verification instead) specifically to avoid re-executing student code on
every profile view. Output capture is capped at 200KB per stream and
tracing is capped at 2000 events, both to keep a single pathological
program from consuming unbounded memory in the Node process itself.

**Known limitations**
- Process-level sandbox, not container/microVM-level — see Security model.
  Swap `Executor` for a hardened backend before genuinely multi-tenant use.
- No interactive breakpoint/step debugging (`RUNTIME_CAPABILITIES.breakpoints`
  is `false` for both languages) — the structured Python trace is the
  fallback the spec explicitly allows for when live stepping isn't
  implemented; JavaScript has no structured tracer yet, only stdout/stderr
  and a parsed stack trace.
- `analyzeMinimalChange` is a simple multiset line diff, not a real
  (Myers-style) diff — good enough as directional evidence, not exact.
- No dedicated free-text "debugging notes" entity — hypothesis/experiment
  text fields cover this iteration's needs; a notes table is a small,
  clean addition later.
- Multi-file/multi-bug/interview-mode/concurrency-bug flows described in
  the spec are not implemented; the data model (`MinimalChangeAnalysis.
  filesChanged`, session-per-challenge structure) doesn't block adding
  them, but nothing here should be assumed to cover them yet.
- Auth is a header-trusting dev stand-in (`devAuthMiddleware`), clearly
  marked `INTEGRATION POINT` — replace with CodeForge's real auth before
  any real deployment.
- No CI config, no rate limiting, no structured request logging/metrics
  pipeline — `console.warn`/`console.error` only.

**Remaining work:** wire `devAuthMiddleware` to real CodeForge auth; swap
in the real editor/challenge/submission components on the frontend and
backend integration points; decide on and implement a hardened `Executor`
for production multi-tenancy; add the observability/metrics pipeline the
spec describes (session/execution/AI latency, hint usage, sandbox failure
rate); extend the mutation operator catalog beyond the six patterns
implemented (all six are real and validated end-to-end, but the spec's
full list — data-structure misuse, incorrect error handling, etc. — is
broader); add multi-file support once CodeForge's real project structure
is available to build it against.
