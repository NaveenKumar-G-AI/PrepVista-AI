# CodeForge AI — Skill Signal Intelligence Engine
## Delivery Report

Everything marked IMPLEMENTED below was built in this session, actually run,
and actually verified in this session — commands and real output are in the
"Validation results" section, not just described. Nothing here claims a test
passed that wasn't executed, or a security control that wasn't tested against
real Postgres. Where something is out of reach in this sandboxed session, it
says so plainly rather than being marked done.

**Stack note:** no existing CodeForge repository was available in this
session (this is a fresh container), so this is a complete standalone
reference implementation — same pattern as the Diagnostic, Engineering
Simulator, and Submission System builds — in real TypeScript, ready to
integrate. Postgres 16 was installed and run for real in-sandbox specifically
so the RLS/security claims below could be genuinely tested rather than
asserted.

---

### IMPLEMENTED

- **Evidence pipeline, end to end.** Normalize → skill-map → aggregate →
  confidence → freshness → state → trend → transfer/retention → persist →
  explain. Runs for real against Postgres; see golden scenario below.
- **Evidence normalization** (`engine/normalize.ts`) — 9 evidence types
  (correctness, challenge, complexity, quality, reasoning, debugging,
  understanding, transfer, assessment) with zod-schema validation, each
  converted to a common 0–1 value without discarding the raw payload.
  Self-reported (`UNDERSTANDING_RESULT`) evidence is reliability-capped so it
  can't silently outrank deterministic execution results.
- **Aggregation engine** (`engine/aggregate.ts`) — recency-weighted
  (exponential half-life), difficulty-weighted, diversity-aware
  (distinct-context-based), recent-vs-historical split, contradiction
  magnitude detection.
- **Confidence engine** (`engine/confidence.ts`) — a separate axis from
  signal strength, built from evidence count (diminishing returns),
  diversity, source reliability, contradiction penalty.
- **Freshness engine** (`engine/freshness.ts`) — RECENT/AGING/STALE/
  VERY_STALE/UNKNOWN from configurable time windows.
- **State engine** (`engine/state.ts`) — 9-state machine. Mastery requires
  confidence + diversity, not just a signal threshold. Demotion from an
  established state protects against a single non-authoritative bad result
  (goes to AT_RISK, not straight to REGRESSING) and only escalates on
  sustained or authoritative contradiction. Verified by dedicated tests, not
  just asserted.
- **Trend engine** (`engine/trend.ts`) — OLS slope over signal history;
  volatility (stddev) checked first and takes priority over slope, so an
  unstable-but-strong sequence reads as VOLATILE, not DECLINING.
- **Contradiction handling** — built into aggregation + state, not a
  separate bolt-on: recent evidence that diverges sharply from an
  established history reduces confidence and (if the prior state was
  established) moves to AT_RISK rather than being blindly averaged in.
- **Transfer + retention** (`engine/transferRetention.ts`) — transfer
  confidence is 0 (= untested) when no transfer-tagged evidence exists,
  distinct from a demonstrated poor transfer; retention reads from a genuine
  gap-then-recheck pattern in the evidence timeline, or `null` when there
  isn't one.
- **Technical profile** (`engine/profile.ts`) — strengths / weaknesses /
  uncertainties / improving / declining / transfer gaps / retention risks,
  never a single score. One failure can't produce a "weakness" (requires
  evidence-count + confidence floors).
- **Deterministic, evidence-grounded explanations** (`engine/explain.ts`) —
  no LLM call (matches the build prompt's own cost-control guidance, §75);
  every explanation is generated from the same aggregation the signal came
  from, so it's reproducible and cheap.
- **Idempotency** — deterministic evidence identity
  (`normalize.ts#evidenceIdentity`), enforced by both an application-level
  dedup check and a real Postgres unique constraint. Verified with 12
  concurrent identical submissions collapsing to exactly one record.
- **Optimistic concurrency** — version-checked signal updates via a
  transaction-scoped Postgres advisory lock inside the write function (real
  row-level serialization, not just a version check race). A losing writer
  gets the actual current row back and retries against it. Verified under
  real concurrent load (see below) — including a bug this surfaced (see
  "Known limitations / issues found and fixed").
- **Database schema + migrations** (`db/migrations/001_init.sql`,
  `002_rls.sql`) — 7 tables, indexes, a unique constraint enforcing
  idempotency, all applied to and verified against a real Postgres 16
  instance, twice, from a clean `DROP DATABASE` — once manually, once via the
  `scripts/run-migrations.mjs` runner.
- **RLS + write-path security** — `authenticated` gets SELECT-only,
  own-rows-only via RLS; every write (evidence ingestion, signal upsert,
  history, explanations, audit) goes through one of 5 `SECURITY DEFINER`
  functions; neither role has raw table write grants, including the trusted
  service role itself. All of this is asserted by a **permanent, re-runnable
  test file** (`tests/security.integration.test.ts`), not just a one-off
  manual check — see Validation results.
- **Audit trail** (`skill_audit_events`, `sig_append_audit`) —
  evidence_received / evidence_validated / evidence_rejected /
  evidence_deduplicated / signal_created / signal_updated / state_changed /
  confidence_changed / trend_changed, each correlation-ID-tagged. Invisible
  to the `authenticated` role by construction (no RLS policy = default deny),
  verified.
- **Policy versioning** (`policy/policy.ts`) — every threshold/weight is
  named and versioned (`SignalPolicy`, `POLICY_VERSION`); every persisted
  signal stamps the policy + model version it was computed under.
- **API layer** (`api/server.ts`, `api/routes.ts`) — Fastify, 11 routes
  (ingestion + profile/signal/evidence/explanation/trend/strengths/
  weaknesses/uncertainties/skill-graph/health), with per-request
  authorization as defense-in-depth (the service DB role bypasses RLS by
  design, so the API itself is what stops a student token from reading
  another student's `:studentId` in the URL — tested live, see below).
- **2 React components** (`frontend/`) — a student skill-profile list and a
  skill-detail panel, both consuming the real API's JSON shape, both
  type-check cleanly against `react`+`@types/react`. Design is a deliberate
  "calibration instrument" concept (a signal-position marker bracketed by a
  confidence-width indicator, tokens.css) rather than a generic dashboard —
  see the design rationale in `SignalTrace.tsx`.
- **Prompt-injection resistance** — normalizers only ever read
  schema-declared numeric/boolean/enum fields; free-text fields are carried
  in `rawValue` for display and never reach `normalizedValue`. Verified with
  a test embedding an injection string in a field the normalizer doesn't
  read.
- **Migration runner** (`scripts/run-migrations.mjs`) — real, executed
  against a throwaway database from a clean state, not just written.

### PARTIALLY IMPLEMENTED

- **Skill catalog** — 6 skills seeded (algorithms, state_reasoning,
  complexity_reasoning, debugging, code_quality, understanding) against the
  spec's 19 possible dimensions. The type system and schema support any
  number; extending the catalog is adding rows, not code (§7 as designed).
  Chose depth (a fully-exercised, tested pipeline) over seeding all 19 with
  no real evidence behind most of them.
- **Evidence types** — 9 of the spec's 14 (missing CONSISTENCY_RESULT,
  REVIEW_RESULT, PROJECT_RESULT, INTERVIEW_RESULT specifically). The
  normalizer registry is designed for these to be additive — same pattern as
  the 9 that exist — but they weren't built since nothing in this session
  exercises them.
- **Performance testing** — ran with real seeded + generated evidence (tens
  of records per skill, hundreds of audit events) and the schema has the
  indexes req #85 asks for (student+skill, occurred_at, correlation_id), but
  this was not load-tested at the 100k/1M-evidence-record scale the spec
  describes. That needs infrastructure (sustained load generation, a
  non-ephemeral DB) this sandboxed session doesn't have.
- **Skill graph** — prerequisite edges exist as real data
  (`SKILL_PREREQUISITES`, `skill_prerequisites` table, `GET /skills/graph`),
  consumed as plain JSON. No interactive visualization was built (see
  Frontend below).

### BLOCKED (needs something this session doesn't have)

- **Integration with the actual existing CodeForge systems** — the
  execution/complexity/quality/reasoning/debugging/consistency analyzers,
  the adaptive challenge engine, the role framework, and the assessment
  engine are described in the build prompt as pre-existing CodeForge
  systems (§3, §31, §56–60). This session has no code for them (each prior
  CodeForge delivery — Diagnostic, Engineering Simulator, Submission
  System — was itself a standalone reference build in its own session, per
  memory). What's built here is the consuming contract
  (`RawEvidenceInput`, the evidence-type registry) those systems would call
  into, plus the signals contract (`GET /students/:id/profile` etc.) an
  adaptive engine would read from — not a live integration, because there
  is nothing on this side to integrate with yet.
- **Real JWT/session auth** — `parseAuthHeader()` is a labeled placeholder.
  Wiring real Supabase JWT verification (or whatever CodeForge's actual auth
  is) needs that system's actual configuration.
- **Instructor UI** — not built. It needs an RBAC/instructor-identity model
  this session has no source for (the API's auth placeholder only
  distinguishes "service" from "student," not "instructor"); building a
  fake one would mean inventing an authorization model that wouldn't match
  whatever CodeForge actually uses.
- **True 100k+-record / sustained concurrent-user load testing** — needs
  non-ephemeral infrastructure and a load-generation setup outside a single
  chat session's sandboxed container.

### NOT IMPLEMENTED

- **Interactive skill-graph visualization.** The data is real and served;
  no D3/visualization UI was built for it (time/scope call — the two
  components built are where req #67's confidence-vs-strength requirement
  actually lives, which felt like the higher-value UI to get right).
- **AI-assisted semantic evidence interpretation** (§73–75's "AI may assist
  with... ambiguous evidence interpretation, natural-language summaries").
  Explanations are fully deterministic instead. This was a deliberate
  choice, not an oversight — it's what the build prompt's own cost-control
  section asks for by default, and it means every explanation in this
  build is reproducible and was actually exercised by tests, rather than an
  LLM call this session can't make on the backend and couldn't verify
  end-to-end anyway. The explanation generator is structured so a real LLM
  pass could sit on top of `generateExplanation()`'s output later.
- **Rate limiting.** Not implemented in the API layer. Real ingestion
  volume, auth, and infra would need to exist first to size this
  sensibly; noted rather than faked with an arbitrary number.
- **Caching layer.** Signals are recomputed from evidence on every write;
  reads hit Postgres directly. At this evidence volume that's fine (see
  performance note above); a real cache-invalidation-on-write layer (§94)
  would be the next thing to add if read volume grows, not before.

---

### Security

| Control | Status | How it was verified |
|---|---|---|
| RLS: student can only read own rows | ✅ tested | `security.integration.test.ts`, real Postgres |
| Default-deny with no identity set | ✅ tested | same file |
| Client cannot INSERT evidence directly | ✅ tested | same file |
| Client cannot UPDATE a signal directly | ✅ tested | same file |
| Client cannot call the write functions directly | ✅ tested | same file |
| Audit trail invisible to the student role | ✅ tested | same file |
| **Service role has no raw table write grants either** — writes only via `SECURITY DEFINER` functions | ✅ tested | same file — this is what makes "client cannot inject evidence" actually true rather than just RLS-shaped |
| Stale-version write is rejected, doesn't clobber real state | ✅ tested | same file |
| API rejects a student token reading another student's ID | ✅ tested live | curl against a running server, see below |
| Prompt-injection-shaped field never reaches a score | ✅ tested | `engine-core.test.ts` |
| Forged/future timestamp rejected | ✅ tested | `engine-core.test.ts` |
| Malformed/oversized evidence payload handled without crashing | ✅ tested | `security.integration.test.ts` + live curl |
| Real JWT verification | ❌ not implemented | placeholder, documented |
| Rate limiting | ❌ not implemented | — |
| Full adversarial pentest (fuzzing, replay attacks over the network, enormous payload DoS) | ⚠️ partial | representative cases tested; not a full pentest |

### Known limitations / issues found and fixed

Three real bugs were hit and fixed during this build, not hidden:

1. **`RETURNS TABLE` column collision.** `sig_upsert_signal`'s output columns
   were named the same as the underlying table's columns
   (`student_id`, `skill_id`, ...). Postgres makes `RETURNS TABLE` column
   names implicit PL/pgSQL variables inside the function body, which made
   the bare column list in `ON CONFLICT (student_id, skill_id)` genuinely
   ambiguous — `ERROR: column reference "student_id" is ambiguous`. Fixed by
   prefixing every output column with `out_`.
2. **RLS silently zeroed the service role's own reads.** `app_service` isn't
   the table owner, so once RLS was enabled it was subject to the same
   `sig_select_own_*` policies as a student — and since it never sets
   `app.current_student_id`, every SELECT returned zero rows, including
   its own writes. Fixed with `ALTER ROLE app_service BYPASSRLS`, matching
   how Supabase's `service_role` actually behaves — then re-verified that
   this did *not* also grant it raw write access (it didn't; writes still
   require the functions).
3. **Retry ceiling too tight under real concurrent load.** The optimistic-
   concurrency retry loop (5 attempts, no backoff) worked fine in isolation
   but threw `exceeded retries` when the full test suite's several
   connection pools plus an intentional 11-way race on one row ran
   together. Fixed with a higher ceiling (25) and small randomized backoff
   between attempts (standard thundering-herd mitigation) — then verified
   by running the full suite **4 times back to back**, not just once.

None of these were visible from reading the code — all three only showed up
by actually running it against a real database under real concurrent load,
which is the reason this build prioritized standing up real Postgres over
writing more SQL that looked right.

---

### Validation results (commands actually run this session)

```
$ npm run typecheck
> tsc --noEmit && tsc --noEmit -p frontend/tsconfig.json
(clean — backend + frontend)

$ npx vitest run                      # x4 back-to-back, post-fix
 Test Files  5 passed (5)
      Tests  53 passed (53)
```

Breakdown: 18 evidence-normalization/aggregation/confidence/freshness tests +
18 state/trend/transfer/retention tests + 4 idempotency tests (all against
`InMemoryRepository`, no infra) + 3 golden-scenario tests + 10 security tests
(both against real Postgres 16).

Golden scenario (`tests/golden-scenario.integration.test.ts`), real numbers
from a real run — reported as they came out, not smoothed to match the build
prompt's illustrative fixture exactly:

```
Starting point (10 baseline algorithms submissions, 3 debugging, 1 weak state_reasoning):
  algorithms      : PROFICIENT  signal=0.90  confidence=0.65
  debugging       : UNCERTAIN   signal=0.56  confidence=0.26
  state_reasoning : UNCERTAIN   signal=0.25  confidence=0.06

state_reasoning after Challenge 1 (correct, weak reasoning):   signal=0.59
state_reasoning after Challenge 2 (correct, strong reasoning): signal=0.75  trend=VOLATILE
state_reasoning after failed Transfer Challenge: transferConfidence=0.00 (base signal 0.60)
debugging after new debugging success: signal=0.75 (up from 0.56)
algorithms, untouched by any of the above: still 0.90, same evidenceCount
```

Two honest notes on this real output: `state_reasoning`'s trend came out
VOLATILE, not a clean IMPROVING — correctly, because the volatility check
(req #28) takes priority over slope, and jumping from 0.25 to 0.75 across
only 3 points *is* volatile in a small sample, even though it's also
genuinely trending up. And the starting `debugging` baseline (3 pieces of
evidence) landed as UNCERTAIN rather than a clean "moderate" — its signal
(0.56) would land in a moderate range, but confidence from only 3 points
(0.26) is below the floor where the engine is willing to commit to a state
at all. Both are the confidence/signal-separation and volatility-priority
behavior the spec explicitly asks for (§21, §28) doing what it's designed to
do on real evidence with a small sample — not a bug, but not what a
simplified illustrative narrative would suggest either, so it's reported as
it actually came out.

Live API smoke test (server actually started, real HTTP requests, real
Postgres behind it):

```
GET  /health                                          -> 200 {"ok":true}
POST /evidence  (no auth)                              -> 403
POST /evidence  (service token, real payload)           -> 200, real evidence + signal persisted
GET  /students/:id/profile  (service token)             -> 200, real computed profile
GET  /students/:id/profile  (a DIFFERENT student's token) -> 403
GET  /students/:id/profile  (that student's own token)   -> 200
POST /evidence  (malformed body)                        -> 400 with real zod field errors, no crash
GET  /skills/graph                                       -> 200, real catalog
GET  /students/:id/signals/algorithms/explanation         -> 200, real evidence-grounded text
```

Migration runner, run against a throwaway database from a clean
`DROP DATABASE`/`CREATE DATABASE`, then verified with `\dt` / `\df sig_*` and
torn down:

```
$ DATABASE_URL_MIGRATOR=... node scripts/run-migrations.mjs
applying 001_init.sql ... ok
applying 002_rls.sql ... ok
applied 2 migration file(s).
-> 7 tables, 5 sig_* functions confirmed present
```

### Files

36 files, 3,184 lines (TypeScript/TSX/SQL/JS, excluding node_modules and the
lockfile): 12 engine/domain/policy modules, 3 db-layer TS files + 2 SQL
migrations, 3 API files, 4 frontend files, 5 test files, 1 migration script,
plus package.json/tsconfig (×2)/`.env.example`/README/this report. Full
structure in `README.md`.

### Environment variables

See `.env.example` — `DATABASE_URL_SERVICE`, `DATABASE_URL_MIGRATOR`,
`SERVICE_AUTH_TOKEN`, `PORT`, and the Supabase-equivalent variables, all left
blank as asked. Local dev values used to produce every result in this report
are noted in that file's comments only (throwaway local passwords, not
secrets — they only ever pointed at a Postgres instance inside this session's
disposable container).

### Run commands

```
npm install
cp .env.example .env            # fill in DATABASE_URL_SERVICE / _MIGRATOR
npm run migrate
npm run typecheck
npm test
npm run dev:api
```
