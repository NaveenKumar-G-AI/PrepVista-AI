# ACEAPT RECALL

Intelligent Weakness Recovery & Long-Term Retention Engine — Feature 24 of ACEAPT.

## Before anything else: a note on what this actually is

The build prompt asks to audit ACEAPT's existing codebase before building anything. **No existing ACEAPT codebase was provided** — this repository was generated from the spec alone, with no frontend, backend, database, or prior features to inspect or reuse. So rather than guessing at filenames or inventing a fake audit, this is a **standalone, self-contained reference implementation** of Feature 24: a real backend with a real (small) database of demo evidence, a real deterministic retention engine, a real interactive frontend, and real tests — built so it can be read end-to-end and then folded into the real ACEAPT codebase later. Every place that would normally plug into an existing system (auth, the real question bank, Feature 22 Pathfinder, Feature 23 Proof, a production database) is a clearly marked seam, not a guess.

Every API key is left blank, as requested — see [Configuration](#configuration).

## The vertical slice this implements

Per the spec's own instruction not to overbuild the prototype, this implements the one end-to-end story the spec calls the "wow moment" (section 51), plus the surrounding states needed to make it legible:

```
LEARN → PERFORM WELL → TIME PASSES → PERFORMANCE DROPS → ACEAPT DETECTS IT
  → EXPLAINS WHY → TARGETED RECOVERY → IMMEDIATE CHECK → DELAYED CHECK → STABLE
```

The seeded demo student has one skill in each state the spec calls out:

| Skill | State | What it demonstrates |
|---|---|---|
| Time & Work | `AT_RISK` | Fresh decay, no recovery yet — the hero flow, live end-to-end |
| Probability | `AT_RISK` + recurring weakness | Two prior recover-then-relapse cycles → the "we've noticed a pattern" experience + an escalated intervention |
| Permutation & Combination | `RECOVERING` (awaiting delayed check) | Recovered recently, immediate check passed, delayed check still pending — the short "verification required" flow |
| Percentages, Ratio & Proportion, Averages | `STABLE` | Consistently high across several delayed checks — correctly generates **no** review task |
| Data Interpretation | `RECENTLY_LEARNED` | Learned yesterday, no delayed check yet — correctly reports insufficient evidence rather than guessing |
| Logical Reasoning | `NOT_LEARNED` | Zero evidence anywhere — the true empty-state edge case |

All of this is demo/seed data for a fictional `student_demo_1`, clearly labeled as such in `backend/src/db/seed.ts` — every number the UI displays (mastery %, retention %, risk, confidence, priority order) is **computed live by the engine from that seed data**, not hardcoded to match the spec's illustrative numbers.

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│   frontend (React + Vite)   │  HTTP  │     backend (Express + TS)        │
│                              │◄──────►│                                    │
│  Dashboard  ── RecoveryFlow  │        │  routes → RecallService           │
└─────────────────────────────┘        │             │                      │
                                        │   ┌─────────┼─────────┐            │
                                        │   ▼         ▼         ▼            │
                                        │ retention  recovery  priority      │
                                        │  Engine     Engine    Engine       │
                                        │ (deterministic — no LLM ever       │
                                        │  decides state, per spec §48)      │
                                        │             │                      │
                                        │             ▼                      │
                                        │      explanationEngine             │
                                        │   (Claude API, optional; always    │
                                        │    has a deterministic fallback)   │
                                        │             │                      │
                                        │             ▼                      │
                                        │   InMemoryRecallRepository         │
                                        │   (behind a RecallRepository       │
                                        │    interface — swap in a real DB   │
                                        │    without touching any engine)    │
                                        └──────────────────────────────────┘
                                                      │
                                        events: ASSESSMENT_COMPLETED,
                                        MEMORY_STATE_CHANGED, RECOVERY_*,
                                        VERIFICATION_*, PATHFINDER_UPDATED,
                                        READINESS_UPDATED  (spec §58)
                                                      │
                                        ┌─────────────┴─────────────┐
                                        ▼                           ▼
                              integrations/pathfinder.ts   integrations/proof.ts
                              (Feature 22 contract —        (Feature 23 contract —
                               no real Pathfinder to         no real Proof to call;
                               call; payload shape only)      payload shape only)
```

**Why in-memory storage:** there's no existing ACEAPT database to plug into, and adding a real DB engine here would mean guessing at connection details that would just be thrown away later. Every engine and route talks to the `RecallRepository` *interface* in `backend/src/db/repository.ts`, never to the in-memory class directly — swapping in Postgres (or ACEAPT's real store) later is a matter of writing one new class.

## What's real vs. what's a stub

**Real and load-bearing:**
- Retention decay detection, mastery-vs-retention separation, confidence levels, and retention-risk scoring — all deterministic, all in `backend/src/engine/retentionEngine.ts`, all unit-tested
- Failure-type diagnosis (retrieval / concept / application / execution / transfer) mapped to distinct interventions, with real escalation logic that stops repeating a failed intervention (`recoveryEngine.ts`)
- Target-aware, workload-capped memory priority queue with a genuine "no review required" path (`priorityEngine.ts`)
- A small hand-verified question bank for Time & Work, Probability, and Permutation & Combination — every answer key was checked by hand, not generated
- The full interactive loop: recovery → immediate score → simulated delayed check → verified/failed, computed from real answers you give it, not scripted numbers

**Explicitly stubbed, with a clear seam:**
- **Question content** for any skill beyond the three above (`contentAuthored: false` in the API response) — production should pull from ACEAPT's real question bank (spec §12), not this file
- **Feature 22 (Pathfinder) / Feature 23 (Proof)** — the payload contracts are real and exposed over HTTP (`/pathfinder-signals`, `/proof-evidence`), but there's no real service on the other end to call
- **Auth** — there's a single demo student ID and no login; a real deployment should sit behind ACEAPT's existing auth middleware
- **Background scheduling** — delayed checks are triggered by a demo "simulate N days later" control instead of a real job queue (see `DEMO_MODE` below)
- **Institutional/B2B analytics** (spec §45–47) — explicitly out of scope for the vertical slice per the spec's own instruction not to overbuild

## Configuration

Copy `.env.example` to `.env` in both `backend/` and `frontend/` (already done in this delivered copy, with everything left blank as requested).

**`backend/.env`:**
```
ANTHROPIC_API_KEY=      # optional — leave blank, fill in when you have one
ANTHROPIC_MODEL=claude-sonnet-5
PORT=4000
DEMO_MODE=true          # enables the "simulate N days later" demo control
```

With `ANTHROPIC_API_KEY` blank, retention explanations ("why did I forget this?", "we've noticed a pattern") use hand-written deterministic templates in `backend/src/engine/explanationEngine.ts` — the app is fully functional without a key. Add a key later and explanations get AI-polished automatically; nothing else changes, because the AI layer only ever rephrases facts the deterministic engine already computed (spec §48).

## Running it

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev        # http://localhost:4000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Open `http://localhost:5173`. To see the full "wow moment": click **Time & Work** → answer the four recovery questions → you'll see your immediate score → click "Simulate: 5 days later (demo)" → answer the short follow-up → see it resolve to **STABLE** with "no additional review required." Then try **Probability** to see the recurring-weakness treatment, and **Permutation & Combination** for the short verification-only flow.

## Testing

```bash
cd backend
npm test        # 37 unit tests: decay classification, confidence, failure
                 # diagnosis, escalation, priority ranking, and every edge
                 # case from spec §63 (new student, single good/bad score,
                 # missing timestamps, target changes, workload overload)
```

Three real bugs were caught this way and while live-testing the running server (not just the unit tests) during this build — worth knowing about if you extend this:
1. The "why this appeared" explanation was briefly computed *after* a new recovery session was created, so it described "you're mid-recovery" instead of the actual diagnosis. Fixed by explaining from the pre-session assessment.
2. A perfect post-recovery immediate score was being used as the decline baseline for the *next* check, so a genuinely good delayed score looked like decay by comparison. Fixed by excluding intervention-boosted checkpoints from the "peak" baseline.
3. The `verified` flag on a delayed check was computed before the session's status was updated, so it could read `false` even when the assessment had already correctly resolved to `STABLE`. Fixed the ordering, plus tightened a boundary case where a score sitting exactly at the risk threshold slipped through as fine.

## API surface

All endpoints are under `/api/recall`; see `backend/src/routes/recallRoutes.ts`. Every mutating endpoint accepts only *evidence or answers* — never a retention state, risk score, or readiness value directly (spec §60); those are always server-computed.

## Repository layout

```
aceapt-recall/
├── backend/
│   ├── src/
│   │   ├── types.ts, config.ts, utils/math.ts
│   │   ├── db/            # repository interface + in-memory impl + seed data
│   │   ├── engine/        # retention, recovery, priority, explanation, question bank
│   │   ├── ai/            # Anthropic SDK wrapper (graceful no-key fallback)
│   │   ├── events/        # event bus
│   │   ├── integrations/  # Feature 22 / Feature 23 payload contracts
│   │   ├── services/      # RecallService — orchestrates everything above
│   │   └── routes/        # Express API
│   └── tests/             # 37 vitest unit tests
└── frontend/
    └── src/
        ├── api/client.ts
        ├── components/    # RetentionTrace (signature signal-trace visual), shared bits
        └── pages/         # Dashboard, RecoveryFlow
```
