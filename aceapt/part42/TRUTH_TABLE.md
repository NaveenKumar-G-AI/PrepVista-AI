# TRUTH TABLE — ACEAPT Feature 42: Advanced Aptitude Diagnostic Engine

Honest accounting of what's real, what's a port, and what isn't built.
Consistent with every prior ACEAPT/PrepVista/CodeForge part: **no reachable
ACEAPT repository existed in this session**, so this was built as a
complete, integration-ready reference implementation using the same
stack and security pattern established by Feature 4 and Feature 28
(TypeScript, Fastify, Postgres 16 with RLS FORCED and SECURITY
DEFINER-only writes) — not guessed at against files that might not match
your real repo.

**~5,970 lines across 63 files.** Every number below reflects tests that
were actually executed in this session, not estimated.

## What's REAL (implemented, tested, verified against a running Postgres 16)

| Area | Status | Evidence |
|---|---|---|
| Diagnostic session lifecycle (start/resume/pause/resume/complete/abandon/expire) | **Real** | State-machine guarded by conditional `UPDATE ... WHERE status = X`, not a blind write. Tested for every transition including invalid ones. |
| Adaptive question selection (coverage + uncertainty + difficulty match − exposure/quality penalty) | **Real** | `src/engine/questionSelection.ts`. Retired questions hard-excluded; previously-seen questions penalized, not excluded (graceful pool exhaustion). |
| Response-time intelligence (fast/slow × correct/wrong, relative to expected time) | **Real** | `src/engine/timingIntelligence.ts` |
| Evidence-quality weighting (hint discount, exposure decay, implausible-timing discount) | **Real** | `src/engine/evidenceQuality.ts` — every discount traces to a specific spec rule, not an arbitrary tuning knob |
| Hierarchical capability estimation with explicit uncertainty state | **Real** | Beta-Binomial pooling with a flat, weakly-informative prior (deliberately not hierarchical-shrinkage — see "Design choices" below) |
| Confidence calibration (over/underconfidence) | **Real** | `src/engine/confidence.ts` — refuses to call a pattern from fewer than 3 observations in the relevant bucket |
| Consistency / CONFLICTED detection | **Real** | Chunked-accuracy spread detection; a 90/30/90/40-style pattern is flagged, not averaged |
| Difficulty boundary detection | **Real** | `src/engine/difficultyProfile.ts`, with a bespoke SVG visualization (Capability Skyline) |
| Bottleneck detection | **Real, two modes** | A real prerequisite-graph mode (needs real prerequisite edges — see Ports) AND a working sibling-weakness fallback heuristic, clearly labeled as weaker evidence |
| Diagnostic stopping rule | **Real** | Coverage + confidence + fatigue + safety-valve max, sharing the same evidence-count thresholds as the confidence-state calculator so the two can't disagree |
| Fatigue detection | **Real** | Signals only (accuracy drop + timing trend + consecutive implausibly-fast answers) — never a psychological claim |
| Explainability (conclusion/evidence/confidence trace) | **Real** | Falls back to the spec's exact required phrase — "We need more evidence to confidently identify the reason" — when evidence is genuinely insufficient |
| Recommendation engine | **Real** | Priority-ranked, bottleneck-aware |
| Reassessment / baseline-vs-current | **Real** | Non-causal language enforced ("your measured performance increased," never "because you...") |
| Anti-memorization exposure tracking | **Real** | Persisted per student+question; discounts evidence weight and selection score |
| Database schema + RLS + SECURITY DEFINER access layer | **Real, security model directly verified** | See below |
| Groq-backed AI explanation with deterministic fallback | **Real** | LLM only rephrases an already-final conclusion; a missing key, timeout, or malformed response silently falls back with zero loss of correctness |
| Fastify API layer | **Real** | Tested via `fastify.inject()` against the real running server + real Postgres, not mocked |
| React result-experience UI + bespoke SVG visual | **Real** | Server-rendered in tests across full, empty, and boundary-detected profile shapes |

### Security model — directly verified, not assumed

- `diag_app` (the app's DB role) has **zero grants** on any per-student
  table — confirmed by querying `information_schema.role_table_grants`
  and by a live test asserting a raw `SELECT` throws `permission denied`.
- Every per-student table has RLS **enabled and FORCED**, and the owner
  role (`diag_owner`) is explicitly `NOSUPERUSER NOBYPASSRLS` — confirmed
  by querying `pg_roles`/`pg_class`, because (lesson carried over from
  Feature 28) a superuser owner makes `FORCE ROW LEVEL SECURITY` silently
  do nothing.
- Cross-student isolation tested in both directions: student B cannot
  read student A's session, and cannot write into it (rejected with
  `DIAG_SESSION_NOT_FOUND`, not a leaked error revealing it exists).
- A genuine two-way concurrency race (`Promise.all` of two identical
  submissions against real Postgres) produces exactly one row.

### Test count (all executed this session — `npx vitest run`)

**58 tests, 6 files, all passing.**
- 21 unit tests — core algorithms, boundary conditions
- 10 tests — every Module 55 student archetype (A through J), run through
  the real `computeEvidence` → `buildStudentProfile` pipeline, not
  hand-set evidence weights
- 10 tests — Module 56 edge cases (zero/one response, all-correct,
  all-incorrect, skip, duplicate submission, invalid transitions,
  exhausted question pool, reassessment with no baseline)
- 7 tests — real Postgres integration (RLS isolation ×2, grant
  verification, idempotency, concurrency race, session expiry, full
  write path)
- 3 tests — real HTTP-shaped requests via `fastify.inject()` against the
  live app
- 7 tests — React SSR render checks across full/empty/boundary profile
  shapes

## Real bugs found via testing (not fabricated for narrative purposes)

1. **RLS policies could throw instead of failing safely, depending on a
   connection's prior history.** Postgres registers a custom GUC
   (`app.current_student_id`) as a session-level placeholder the first
   time `set_config(..., true)` touches it; after that transaction ends,
   it reverts to an **empty string**, not NULL. The original policy did
   `current_setting(...)::uuid`, which throws `invalid input syntax for
   type uuid` on that empty string. Verified this was never a data
   exposure (a fresh connection and a "polluted" one both denied all
   access), but it made one test assertion fragile and the failure mode
   inconsistent. **Fixed** (migration 006) with `nullif(x, '')` before
   the cast, so the reverted-placeholder case and the never-set case are
   now identical. Found by running the real integration suite, not by
   inspection — a faithful minimal repro was needed to isolate it from
   connection-pool nondeterminism.
2. **A fragile join-by-coincidence in `sessionManager.ts`'s `complete()`
   method**, caught during self-review before it was ever tested: the
   first draft tried to re-associate duration/difficulty/confidence back
   onto evidence rows by matching `evidence_weight` or `created_at`
   incidentally, instead of just selecting those columns in the query
   that already joined the right tables. Fixed (migration 005) by
   enriching `diag_get_all_session_evidence`'s return shape directly.
3. Three rounds of foreign-key-ordering bugs in test cleanup (sessions
   before blueprints, questions before blueprints, exposures before
   questions) — all in test teardown code, not production paths, but
   worth being upfront about since they're in the delivered test files.

## Ports (interfaces built; no real system existed to integrate against)

Same pattern as every prior part — these are contracts, not stubs that
pretend to be real:

- **`StudentContext` / auth (Module 41)** — `src/api/middleware/auth.ts`
  is an explicit dev-mode stand-in that trusts two headers directly and
  refuses to run at all if `NODE_ENV=production`. Wire it to ACEAPT's
  real session/JWT verifier; nothing else in the codebase depends on how
  that verification happens, only on receiving a verified
  `{studentId, tenantId}`.
- **`QuestionBankPort` (Module 3)** — the Postgres implementation reads
  from `_fixture_questions`, an explicitly-marked stand-in for ACEAPT's
  real question table. Re-point the same interface at the real table
  once its exact columns are known; the engine never assumes more than
  the fields listed in `DiagnosticQuestion`.
- **`MistakeIntelligencePort` (Module 15)** — the spec says "use existing
  Mistake Intelligence if available; do NOT create duplicate mistake
  classification." None was reachable, so `errorSignals.ts` is a
  deliberately conservative fallback: it only claims what timing +
  difficulty can actually ground (rushing, guessing, a slow multi-step
  breakdown pattern), and explicitly does NOT claim finer distinctions
  (formula misuse vs. interpretation error vs. calculation error) that
  would need either a real Mistake Intelligence system or per-question
  "common wrong answer" annotations this build doesn't have.
- **Prerequisite graph for bottleneck detection (Module 14)** — the real
  mode (`detectViaPrerequisiteGraph`) is implemented and would activate
  automatically once real prerequisite edges are supplied (presumably
  derived from the question-level `prerequisite` field once that data
  exists for real). Until then, the sibling-weakness fallback runs
  instead, and is labeled as weaker evidence everywhere it appears in
  copy ("possible foundational bottleneck," never a confirmed cause).
- **Feature 1 (student context) / Feature 3 (skill intelligence)** —
  referenced the same way prior parts did: as ports, not rebuilt.

## Explicitly NOT implemented (scope boundaries, stated plainly)

- **TPO/institutional aggregate dashboards (Module 36)** — the aggregate
  data shape is anticipated in the schema design (tenant-scoped tables,
  clean per-student/skill rows to roll up), but no aggregation queries or
  TPO-facing views were built. Out of scope for a student-facing
  diagnostic engine; belongs with whatever consumes Feature 36-class
  aggregate reporting.
- **Question integrity population-level flagging (Module 35)** — the
  logic is real (`questionIntegrity.ts`) but is explicitly a batch
  utility meant for a periodic job, not wired into a scheduler here,
  because it needs many students' responses to the same question, which
  a single diagnostic session never has visibility into.
- **Premium/institution tiering (Module 51)** — no gating logic was
  added; the spec says to use ACEAPT's existing pricing architecture,
  which wasn't reachable to inspect.
- **Analytics event emission (Module 49)** — the event names are
  documented in the spec and this build's structure would support adding
  them at each service-method call site, but no analytics pipeline
  (segment/mixpanel/etc.) was reachable to wire into.
- **Mobile-specific CSS polish and a full accessibility audit (Modules
  43/44)** — the CSS uses relative units, visible focus states, and
  `prefers-reduced-motion` handling, and the layout is a single responsive
  column rather than a desktop-first grid, but no device-lab testing or
  screen-reader pass was performed.
- **A real hierarchical-shrinkage capability model** — deliberately
  scoped out. See "Design choices" below.

## Design choices worth knowing about (not gaps, but judgment calls)

- **Flat priors, not hierarchical shrinkage, at every blueprint level.**
  A domain/topic/subtopic estimate pools all its descendant skills'
  evidence and applies the same neutral Beta(2,2)-equivalent prior a leaf
  skill gets, rather than shrinking toward a parent's current estimate.
  Hierarchical shrinkage converges faster under sparse evidence, but it's
  an extra modeling assumption this build had no real ACEAPT data to
  validate — the flat-prior version is simpler to explain to a student
  ("we started neutral and updated on your evidence") and simpler to
  test. Revisit if early production data shows sparse-evidence estimates
  are too prior-dominated in practice.
- **Every submission recomputes the full estimate tree from all
  evidence-to-date, rather than an incremental partial update.**
  Guarantees topic/domain rollups can never drift out of sync with their
  underlying evidence — the alternative (patch just the affected
  ancestors) needs every sibling skill's evidence anyway to be correct,
  so a full recompute is both simpler and no less correct. At realistic
  session sizes (a few dozen responses) this is trivial CPU cost; it
  would need revisiting only if session lengths grow by orders of
  magnitude.
- **`target_difficulty_weight` on blueprint nodes is currently metadata
  only.** The shipped selector achieves difficulty spread adaptively (via
  the ability-matching term), but doesn't enforce the declared mix as a
  hard quota. A stricter quota-constrained assignment is a reasonable v2
  on top of the same blueprint field, not a schema change.

## Final acceptance criteria — honest checklist

- [x] Start / pause / resume diagnostic
- [x] Intelligent question selection
- [x] Question metadata present where the fixture question model supports it
- [x] Responses securely stored (RLS + SECURITY DEFINER, directly verified)
- [x] Response time captured
- [x] Confidence captured strategically (not every question)
- [x] Domain/topic/subtopic/skill capability estimated
- [x] Difficulty, speed, accuracy profiles generated
- [x] Consistency analyzed; evidence quality considered; uncertainty represented
- [x] Weaknesses/strengths identified
- [x] Bottleneck signals identified where evidence supports them (two modes, see Ports)
- [x] Report explains WHY and WHAT TO DO NEXT
- [x] Personalized-learning-consumable output (`RecommendedAction[]`, machine-readable)
- [x] Reassessment and baseline-vs-current work
- [x] No unsupported conclusions presented as fact (insufficient-evidence phrasing enforced)
- [x] No fake AI intelligence (LLM only rephrases final, deterministic conclusions)
- [x] No cross-student data leakage (directly tested, both directions)
- [x] Mobile-reasonable responsive CSS (not device-lab verified)
- [x] Error recovery (duplicate submission, invalid transitions, expired session, exhausted pool)
- [ ] "Existing ACEAPT functionality remains intact" — not applicable; no
      reachable existing codebase to modify or break this session
- [x] Automated tests pass (58/58)
- [x] TypeScript build passes (`tsc --noEmit`, zero errors)

## Running it yourself

```bash
npm install
# one-time, as a Postgres superuser (see db/migrations/000_bootstrap_roles.sql):
#   creates diag_owner / diag_app roles, sets real passwords, installs pgcrypto
npm run migrate            # applies 001+ as diag_owner
npm run dev                # starts the Fastify server on :4042
npm test                   # all 58 tests (needs DIAG_*_PASSWORD env vars set)
```

See `.env.example` for every environment variable — all secrets are left
blank, per instruction, for you to fill in.
