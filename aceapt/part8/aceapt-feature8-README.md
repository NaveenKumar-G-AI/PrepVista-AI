# ACEAPT — Feature 8: Intelligent Mastery Verification, Retention & Transfer Engine

A standalone, adapter-based reference implementation of Feature 8, built to
the master implementation prompt. **No existing ACEAPT repository was
available to extend** (none was uploaded/connected for this build), so this
is delivered as a real, working, independently-runnable system — a
deterministic evidence engine, a Postgres schema with row-level security, a
REST API, and a React frontend — meant to be merged into the real ACEAPT
codebase via its interfaces (see [Integration points](#integration-points)),
not run standalone in production as-is.

Core problem it solves: a high practice score doesn't prove genuine
learning. Feature 8 continuously gathers evidence — across understanding,
transfer to unfamiliar variations, retention over time, timed application,
and consistency — before it will call a skill "mastered," and it can always
explain *why* it believes what it believes.

## What's real here

Nothing in the decision engine is hardcoded or faked. Every mastery state
transition, confidence level, and threshold comparison is computed from
evidence rows actually stored in Postgres, using a versioned, configurable
model (`src/config/mastery-model-config.json`). AI is used only where the
spec allows it (equivalent-question generation, natural-language summaries)
and is never allowed to decide correctness or a mastery state — every
answer is graded by exact server-side comparison against a stored answer
key, never by asking a model.

This was built and verified end-to-end in the build environment, not just
written and assumed correct:
- **31 automated tests pass** (`npm test`): 17 against the decision engine
  using the spec's own worked examples (the 92→88→86→84 retention example,
  the 88/91/86 vs 94/61/89 stability example, etc.), 6 against the question
  quality pipeline, and 8 live-Postgres integration tests.
- **Row-level security is proven, not assumed** — both manually via `psql`
  (a session with no student scope set sees zero rows; a student cannot
  read or update another student's row even by exact id) and in the
  automated suite (`src/__tests__/rls.integration.test.ts`).
- **A full end-to-end walkthrough** (`scripts/demoWalkthrough.ts`) replays
  the spec's own section-56 demonstration over real HTTP against a real
  running server: practice evidence improves 61%→88%, a verification
  session is required before "mastered" is ever claimed, and the skill
  genuinely progresses `LEARNING → IMPROVING → PROVISIONALLY_MASTERED →
  VERIFIED_MASTERED → STABLE_MASTERED` through real evidence, not a scripted
  demo state.
- Running that walkthrough repeatedly **found and fixed four real bugs**
  along the way (see [Bugs found and fixed](#bugs-found-and-fixed-during-build))
  — including one that would have silently corrupted evidence in most
  verification sessions. All are now covered by regression tests.

## Quick start

```bash
# 1. Backend
cd backend
cp .env.example .env                 # fill in JWT_SECRET, ANTHROPIC_API_KEY (optional), etc.
npm install
./scripts/setup-local-db.sh          # creates Postgres roles + database (see below)
npm run migrate
npm run seed                         # 52 hand-verified questions across 6 skills
npm run dev                          # http://localhost:4008

# 2. Frontend (separate terminal)
cd frontend
cp .env.example .env                 # defaults are fine for local dev
npm install
npm run dev                          # http://localhost:5173

# 3. Try it
#    Open http://localhost:5173, create an account, and either practice
#    (there's no student-facing practice UI here - that's Feature 5's job;
#    use the ingest endpoint or scripts/demoWalkthrough.ts to seed practice
#    evidence) or just click into a skill and "Begin verification" directly.

# Optional: replay the full spec section-56 demo against your running server
npx tsx scripts/demoWalkthrough.ts
```

Requires Node 20+ and a local PostgreSQL 16 (the sandbox this was built in
used `apt-get install postgresql`; adjust for your OS). `setup-local-db.sh`
assumes a `postgres` superuser is reachable — edit `PSQL_SUPERUSER` at the
top if yours differs.

## Why Postgres, and why no ORM

Other recent builds in this ecosystem (CodeForge AI's growth-intelligence
and security/audit layers) used real Postgres with row-level security
verified against a live local instance, so this follows the same
convention rather than defaulting to SQLite. Prisma was deliberately
avoided — its engine-binary download step looked likely to fail against
this build environment's restricted network allowlist (it isn't on the
allowed-domains list), so the risk wasn't worth it for a prototype. Instead:
the `pg` driver directly, hand-written SQL migrations, and a typed
repository layer per table. `pg` is pure JavaScript (no native compilation),
which also made it the lower-risk choice generally.

### Row-level security model

Two Postgres roles (see `sql/schema.sql` and `scripts/setup-local-db.sh`):

| Role | Used by | RLS |
|---|---|---|
| `aceapt_service` | migrations, seeding, background jobs (review sweep) | **bypasses** RLS (owns the schema) |
| `aceapt_app` | every per-request API handler | **subject to** RLS |

Every student-scoped table (`mastery_evidence`, `mastery_state`,
`verification_attempts`, `review_schedule`, `mastery_history_events`,
`question_exposures`) has `FORCE ROW LEVEL SECURITY` and a policy requiring
`student_id = current_setting('app.current_student_id')`. Each authenticated
request runs inside a transaction that sets this via `withStudentScope()`
(`src/lib/db.ts`) before touching any of these tables. A route handler bug
that forgets an ownership check still can't leak another student's data —
it would just see zero rows, not someone else's.

## The mastery model

Six dimensions, each computed from real evidence, each independently
nullable when there's no evidence yet (a missing dimension is "we don't
know," never silently `0`):

| Dimension | What it measures | Computed from |
|---|---|---|
| Concept | Can they get the right answer at all, under familiar conditions | `PRACTICE`/`ASSESSMENT` evidence |
| Execution | Can they reliably run the procedure at familiar/slightly-variant novelty | `PRACTICE`/`VARIATION` evidence |
| Transfer | Can they apply it to unfamiliar surface forms, not just a memorized pattern | Weighted across direct/variation/novel novelty tiers, novel weighted heaviest |
| Retention | Does it hold up after time has passed | `DELAYED` evidence, trend-aware (a gentle decline that stays well above threshold reads as retained, not at-risk) |
| Timed | Correct-but-slow counts against this even though it counts fully toward Concept | `correctness × min(1, expectedTime / actualTime)` |
| Consistency | Variance across the last few verification-style attempts — one lucky attempt is never enough | `stddev` of the last N attempts vs. a configured tolerance |

State machine (`src/services/masteryDecisionService.ts`) never skips a
stage: `UNKNOWN → INTRODUCED → LEARNING → PRACTICING/IMPROVING →
PROVISIONALLY_MASTERED → VERIFIED_MASTERED → STABLE_MASTERED`, with
`AT_RISK`/`REGRESSED` as a drop-from-peak overlay measured against a
snapshot taken the moment a skill was last verified — not against a
global threshold, against the student's *own* prior evidence. Every
decision returns a `rationale: string[]` explaining exactly which evidence
and thresholds produced it (`GET /mastery/:skillId/explain`).

All thresholds live in `src/config/mastery-model-config.json`, versioned
(`mastery_model_version` is stamped on every `mastery_state` row) and
nowhere hardcoded in application logic.

## API reference

Auth: `Authorization: Bearer <token>` from `/auth/login` or `/auth/register`.

| Method | Path | What |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | Student auth |
| GET | `/auth/me` | Restore a session from a stored token |
| GET | `/skills` | Skill catalog |
| GET | `/mastery` | Mastery map, grouped by category |
| GET | `/mastery/:skillId` | State + dimension scores for one skill |
| GET | `/mastery/:skillId/evidence` | Raw evidence rows |
| GET | `/mastery/:skillId/explain` | Full rationale trail (recomputed live, read-only) |
| POST | `/mastery/:skillId/verify/start` | Start a verification session (objective auto-inferred from current state, or pass one explicitly) |
| GET | `/mastery/verify/:attemptId` | Current question (answers/correctness never included) |
| POST | `/mastery/verify/:attemptId/answer` | Submit an answer; scored server-side, deterministically |
| POST | `/mastery/verify/:attemptId/complete` | Finalize; returns the calm `MASTERY_VERIFIED` / `NOT_STABLE_YET` result |
| POST | `/mastery/verify/:attemptId/abandon` | Mark an interrupted session abandoned |
| GET | `/mastery/reviews` | Prioritized, capped review queue |
| POST | `/mastery/reviews/:skillId/skip` | Skip a due review |
| GET | `/mastery/history/:skillId` | Timeline + before/after evidence |
| POST | `/mastery/ingest/evidence` | **Server-to-server** — Feature 5/6 feed practice/assessment evidence in. Requires `X-ACEAPT-Service-Key`, not a student JWT. |
| GET | `/signals` | Debug view of signals that would reach Feature 3/4/7 for the current student |

## Integration points

Features 3–7 don't exist in this build environment, so integration is via
explicit, documented interfaces rather than assumed:

- **Inbound (Feature 5/6 → Feature 8):** `POST /mastery/ingest/evidence`,
  service-key authenticated. Feature 5's practice results and Feature 6's
  assessment results are legitimate mastery evidence and go through the
  exact same decision pipeline as Feature 8's own verification sessions.
- **Outbound (Feature 8 → Feature 3/4/6/7):** `src/services/integration/signalBus.ts`
  is a durable outbox — every signal is committed to `signal_outbox` in the
  same transaction as the mastery-state change, *before* any delivery
  attempt, so a webhook failure never loses evidence that a signal was
  owed. `src/services/integration/featureAdapters.ts` defines the
  `FeatureAdapter` interface; the default `LoggingFeatureAdapter` logs and
  marks delivered (so the system is fully runnable standalone); set
  `FEATURE{3,4,6,7}_WEBHOOK_URL` in `.env` to switch to real HMAC-signed
  webhook delivery once those services exist. Signal payloads match the
  spec's own example shape exactly (`signal`, `severity`, `confidence`,
  `evidence`).
- **AI provider:** `src/services/ai/` is adapter-based (`AIProvider`
  interface); `anthropicProvider.ts` is the only implementation, using
  forced tool-use for guaranteed-schema question generation (never
  free-text JSON parsing). Swap in a different provider by implementing the
  same interface.

## What's fully built vs. lighter-touch

Mapped to the spec's own prototype-priority list (section 55):

**MUST HAVE (all 10) — fully implemented and tested:** skill mastery
verification, fresh/variation questions, transfer testing, mastery state +
confidence, retention verification, regression detection, mastery map,
Feature 7/6 integration (as interfaces, since those features don't exist
here to receive them).

**WOW features — implemented:** before/after evidence, mastery timeline,
smart verification scheduling (priority-scored, capped queue), anti-
memorization logic (tested — a repeated exact question is excluded from
scoring, not just flagged), mixed-context transfer (hidden topic labels).

**Lighter-touch, honestly:**
- **Skill/difficulty validation** in the question quality pipeline is a
  cheap token-overlap heuristic plus the AI's own self-reported tag/
  difficulty, not a trained classifier — flagged as such in
  `questionQualityPipeline.ts`'s comments. Deterministic checks (answer
  validity, ambiguity, duplicates, explanation presence) are real and
  strict; the semantic checks are a reasonable prototype-grade
  approximation, not production-grade content moderation.
- **Cross-skill verification, real-world context generation, cohort
  intelligence, long-term mastery prediction** (spec's FUTURE tier) are not
  built — the data model and event architecture don't preclude them, but
  they're out of scope here.
- **Question pool depth**: Percentages and Data Interpretation have full
  novelty/context coverage (18 hand-verified questions each) so a complete
  verification loop runs with zero AI calls; the other four seeded skills
  (Ratio & Proportion, Time & Work, Syllogisms, Reading Comprehension) have
  lighter coverage (4 familiar/labeled questions each) — enough to populate
  the mastery map realistically, not enough alone to run every verification
  objective without an AI key configured.
- **No real Feature 3/4/6/7 services exist to integrate against** — the
  interfaces are real and tested (durable outbox, retry, HMAC signing), but
  "Feature 7 receives the signal and acts on it" is necessarily unverifiable
  without Feature 7 existing.

## Bugs found and fixed during build

Left in as a record, and each is now covered by a test:

1. **Express route ordering** — `GET /mastery/reviews` was being matched by
   `masteryRouter`'s `GET /:skillId` (treating "reviews" as a skill id)
   because the catch-all was mounted first. Caught by the live demo script.
   Fixed by reordering mounts in `src/index.ts`.
2. **Concurrent queries on one pg client** — several `Promise.all([...])`
   calls were running multiple queries against the *same* client
   simultaneously, which `pg` allows but silently serializes with a
   deprecation warning (real risk of subtle bugs under load). Fixed by
   making them sequential everywhere (`masteryMapService`,
   `masteryEvidenceService`, two route handlers).
3. **Within-plan duplicate question selection** — the most significant one.
   `question_exposures` is only written when a question is *answered*, not
   when it's selected into a verification plan. Building a 5-question plan
   by calling the selector once per slot, with no exclusion of
   already-selected-but-not-yet-answered questions, could return the exact
   same question for multiple slots — which then triggered a false
   `MEMORIZATION_RISK` flag on the *second* time it was answered, within
   the very session meant to verify transfer, silently reducing the
   effective evidence count. Fixed by threading `excludeQuestionIds`
   through the whole selection chain (`startVerificationSession` now
   accumulates ids as it fills each slot). Regression test in
   `rls.integration.test.ts`.
4. **`nextRecommendedFocus` could suggest an already-strong dimension** — a
   student in early `LEARNING` state (nothing mastered yet) could get
   pointed at "Transfer Practice" because the gap-finding loop wasn't
   state-aware. Fixed by scoping which dimensions are even candidates to
   the gate the student is actually stuck at, and by requiring a genuinely
   positive gap before recommending anything.
5. **A missing-state API response omitted dimension fields entirely**
   instead of setting them to `null`, which would have rendered as `NaN` in
   the frontend's calibration arcs for any never-attempted skill. Caught by
   manually cross-checking the API response shape against the frontend's
   TypeScript interfaces (a class of bug neither side's isolated typecheck
   catches). Fixed in `mastery.routes.ts`.

## Frontend

React + Vite + TypeScript + Tailwind, no component library. Design
direction is a "calibration instrument" rather than a gamified quiz app —
the spec explicitly wants "calm, premium, professional... never make the
student feel punished" (section 57) and asks that failed verification read
as "MASTERY NOT STABLE YET," never "FAILED." The one deliberately bold,
repeated visual device is a graduated arc gauge (`CalibrationArc.tsx`) used
identically for every dimension score and the verification result — because
the product's actual mechanic *is* evidence measured against a threshold,
not a percentage to celebrate.

Pages: mastery map, skill detail (dimensions, explainability, before/after,
history), the verification session flow (intro → questions → calm result),
and the review queue. No design system existed to match (none was provided
in this build), so this is an original, restrained one — reconcile it with
ACEAPT's real design system when merging.

## Project layout

```
backend/
  sql/schema.sql              # tables, enums, RLS policies
  src/
    services/                 # the actual decision engine + orchestration
    repositories/              # typed data access, one file per table
    routes/                    # Express handlers
    services/ai/               # adapter-based AI provider
    services/integration/      # signal bus + Feature 3/4/6/7 adapters
    __tests__/                 # 31 tests: unit + live-Postgres integration
  scripts/
    setup-local-db.sh          # Postgres roles + db
    migrate.ts / seed.ts       # schema + 52 hand-verified questions
    demoWalkthrough.ts         # full section-56 demo over real HTTP
frontend/
  src/
    components/CalibrationArc.tsx   # the signature element
    components/StateTrack.tsx       # the mastery pipeline visualized
    pages/                          # map, skill detail, verify, reviews
```

## Environment variables to fill in

Both `.env.example` files list everything; the ones that need a real value
before anything beyond the deterministic core will work:

- `backend/.env` → `JWT_SECRET` (any random string for dev; `openssl rand
  -hex 32` for anything real), `DATABASE_URL` / `SERVICE_DATABASE_URL`
  passwords (match whatever `setup-local-db.sh` created),
  `INTERNAL_INGEST_KEY` (for the Feature 5/6 ingest endpoint).
- `backend/.env` → `ANTHROPIC_API_KEY` — **left blank on purpose**. Nothing
  breaks without it; AI-generated question variation just isn't available,
  and the system falls back to the seeded pool. Fill it in and equivalent-
  question generation, transfer scenarios, and mastery summaries activate
  with no other code changes.
