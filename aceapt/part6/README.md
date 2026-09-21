# ACEAPT Feature 6 — Intelligent Assessment, Exam Simulation & Readiness Engine

A working implementation of Feature 6, built and verified end-to-end (real SQLite database, real
HTTP API, real automated tests — not a design document).

## Read this first

The master prompt assumes an **existing ACEAPT repository** with Features 3–5 already built, and
says to inspect it before writing code (section 52). No such repository was uploaded — only the
spec itself. Rather than guess at a stack or fabricate an "inspection," this was built as a
**standalone, integration-ready module**: a real backend + frontend with clean adapter interfaces
where Features 3/4/5 would plug in, exactly as section 53 instructs for this situation:

> "If Feature 3/4/5 interfaces are not available yet: Create adapters/interfaces. Do not hardcode
> assumptions everywhere."

See `backend/src/adapters/` — each file is a small interface plus a mock implementation that is
explicit and inert (it never invents data on its own; see the file comments). Swapping in the real
Feature 3/4/5 later means implementing those same three interfaces — no other file changes.

The spec is 66 sections long and, taken completely literally, describes a multi-quarter production
system. Section 59 tells the builder how to handle that for a prototype ("prioritize what judges
can actually experience") and gives an explicit MUST HAVE / STRONG WOW / FUTURE split. That's the
framework used here:

- **MUST HAVE (1–12) and STRONG WOW (13–18):** fully implemented with real logic, not stubs.
- **FUTURE (19–24)** — equivalent assessment forms (A/B/C), advanced calibration, advanced
  integrity/anti-cheating, cohort benchmarking, institutional analytics: **not built**. Where the
  architecture already supports them cheaply (e.g. the blueprint system can generate a second
  "form" from the same shape today), that's noted inline; the rest would need real infrastructure
  (auth, multi-tenant DB, an actual Feature 5) this prototype doesn't have.

Every number the system produces (readiness %, dimension scores, accuracy, diagnosis text) is
**computed from real recorded attempt data** through the same code path whether you hit the API,
click through the UI, or run the demo script below — nothing is hardcoded or randomized to look
good. See "Honesty notes" further down for the specific things worth being skeptical of.

## What's actually in here

```
backend/     Node + TypeScript + Express + SQLite (better-sqlite3). The intelligence layer.
frontend/    React + TypeScript + Vite. Exam-taking UI + readiness report UI.
```

Two separate apps (own package.json, own dependencies) — start each independently. See "Running
it" below.

## Architecture

### Backend modules (mirrors spec section 50's naming)

| Module | File | What it owns |
|---|---|---|
| Blueprint | `services/blueprintService.ts` | Resolves a blueprint per assessment type; focus-topic redistribution |
| Question Selection | `services/questionSelectionService.ts` | Blueprint- and exposure-aware picking, with graceful backfill |
| Question Quality | `services/questionQualityService.ts` | The gate — structural/answer/explanation validation, HEALTHY-only |
| Assessment Generation | `services/assessmentGenerationService.ts` | Orchestrates blueprint → selection → persisted Assessment |
| Session | `services/sessionService.ts` | Status state machine, server-authoritative start/expiry |
| Timer | `services/timerService.ts` | Pure time math from server timestamps only |
| Attempt | `services/attemptService.ts` | View/answer/skip/navigate tracking, server-timestamped |
| Scoring | `services/scoringService.ts` | Server-side correctness + raw score (never trusts the client) |
| Time Analysis | `services/timeAnalysisService.ts` | Over/under-investment detection, section time usage |
| Skill/Error Analysis | `services/skillErrorAnalysisService.ts` | Per-skill performance, difficulty curve, rule-based error classification |
| Strategy Analysis | `services/strategyAnalysisService.ts` | Answer-change intelligence, skip strategy intelligence |
| Consistency | `services/consistencyService.ts` | Variance across assessments, not just the latest score |
| Readiness | `services/readinessService.ts` | The 9-dimension model, versioned and configurable |
| Report | `services/assessmentReportService.ts` | The orchestrator — wires everything above into one result + diagnosis |
| Recommendation | `services/recommendationService.ts` | Risk areas → concrete Feature 5 practice request |
| History | `services/historyService.ts` | Assessment history, readiness-history persistence |

Config (all human-editable, not hardcoded inline):
`config/blueprints.ts` (8 assessment types, each with a distinct purpose/length/difficulty mix),
`config/readinessModel.ts` (dimension weights, state bands, confidence rules),
`config/difficultyNorms.ts` (expected-time norms, over/under-investment thresholds).

### API

REST, matching spec section 51's endpoint list plus a couple of additions the frontend needs
(`questionOrder`/`selectedOptionId` in state responses, `/abandon`, `/practice-sessions/:id/complete`
as a demo shim). Auth is `X-Student-Id` header only — see "Honesty notes."

### Data model

SQLite, schema in `backend/src/db/schema.sql`: `students`, `questions`, `assessments`, `attempts`,
`question_exposure`, `assessment_results`, `readiness_history`, `practice_sessions`, `audit_log`.

## Honesty notes (read before trusting the numbers)

- **The readiness weights are a starting configuration, not a calibrated model.** There's no
  historical outcome data (e.g. "did this student actually clear a real placement test") to fit
  weights against yet — see the comment block at the top of `config/readinessModel.ts`. What *is*
  real: every input to the formula is a genuine, server-recorded measurement. `READINESS_MODEL_VERSION`
  exists specifically so these weights can be replaced later without touching the services that
  call them.
- **Error classification is a deterministic rule-based heuristic**, not an ML model — every branch
  in `skillErrorAnalysisService.classifyOne()` is inspectable, and confidence is reported honestly
  (a single wrong answer with ordinary timing gets `LOW` confidence, not a confident-sounding guess).
- **The question bank is 65 questions**, generated with computationally-verified answers (see
  `backend/src/db/seed-data/generate_templated.py` — arithmetic/algebra/series answers are computed
  and asserted in Python, not hand-typed) plus hand-authored reasoning/grammar/reading-comprehension
  items. It's enough to demonstrate the engine convincingly, not enough to be a production-scale
  item bank — `FULL_MOCK_ASSESSMENT` (50 questions) will hit the selection engine's backfill logic
  and may reuse some questions across attempts.
- **Auth is a stub** (`middleware/auth.ts`): an `X-Student-Id` header, no verification. Every other
  file is written against `req.studentId` only, so this is the one file to replace with real
  auth — nothing else needs to change.
- **The Feature 5 "practice completion" is simulated on demand**, via a `/practice-sessions/:id/complete`
  endpoint and a button on the Result screen labeled "Demo: simulate completing this practice."
  This is clearly marked as a demo shim in the code — a real Feature 5 would call back into Feature 6
  automatically.

## Running it

Requires Node 20+.

### Backend

```bash
cd backend
npm install
npm run dev        # http://localhost:4000, auto-seeds 65 questions + a demo student on boot
```

Copy `.env.example` to `.env` if you want to override the defaults — the server runs with zero
config out of the box (see `src/config/env.ts`).

### Frontend

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Open `http://localhost:5173`. Pick an assessment type, take it, submit, read the report. A "Student"
field on the home screen lets you switch identities (stored in `localStorage`) to see that two
students' data stay isolated.

### See the whole loop without clicking through a UI

```bash
cd backend
npm run demo
```

Runs ASSESS → DIAGNOSE → PRACTICE → REASSESS → MEASURE end-to-end against the real service layer
and prints every stage (section 60's demo target), including the before/after readiness delta per
dimension. Nothing here is scripted to look good — it simulates one plausible student attempt
(deliberately weak on Algebra/Data Interpretation, then "practices" that weakness) and lets the real
engine compute whatever it computes. Re-run it and the exact numbers will move around a little
(some behaviors are randomized within realistic bounds) while the *shape* of the story — a real
measured improvement after practice — stays intact.

### Tests

```bash
cd backend
npm test                          # unit + integration tests (node's built-in test runner, no extra deps)
python3 scripts/http_smoke_test.py  # live HTTP test - start the server first (npm run dev), then run this
```

18 HTTP-level checks live in `http_smoke_test.py`, including the security-relevant ones:
correctness/answer-keys/topic-labels are never sent to the client during an exam, cross-student
access is rejected with 403, and invalid state transitions return 409.

## Extending this

- **Wire up real Features 3/4/5:** implement `SkillIntelligenceAdapter`, `MasteryPathAdapter`,
  `PracticeEngineAdapter` (in `adapters/`) against the real services and delete the mocks.
- **Real auth:** replace `middleware/auth.ts`; every service already takes `studentId` as a plain
  parameter, so nothing downstream changes.
- **Equivalent forms (FORM_B, FORM_C):** the blueprint/selection engine is already form-agnostic —
  add a `formLabel` parameter to `selectQuestions` that excludes questions used in other forms of
  the same blueprint, and expand the question bank so there's enough per-cell headroom to do that
  without heavy backfill.
- **AI-assisted question authoring:** `questionQualityService.runQualityGate()` is already the gate
  a generation pipeline would sit in front of (spec section 47/54) — nothing downstream needs to
  change, a new question just needs to come out HEALTHY before entering `questions`.
