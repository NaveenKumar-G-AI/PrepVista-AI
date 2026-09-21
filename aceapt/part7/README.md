# ACEAPT Feature 7 — Backend

**Intelligent Readiness Coaching & Action Engine.** The orchestration/intelligence
layer that sits between Feature 6 (diagnosis) and Feature 5 (practice): it decides
what a student should do next, why, for how long, and whether it worked.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:4007, auto-seeds a demo student on boot
```

No `.env` file is required to run. Copy `.env.example` to `.env` and fill in
values only when you have them — every key defaults to a working local
fallback (see below).

```bash
cp .env.example .env   # optional — edit values whenever you have them
```

## What's wired to what

| Config left blank | What happens instead |
|---|---|
| `DATABASE_URL` | Persists to `data/store.json` (see `src/db/JsonStore.ts`). Swap the implementation behind `src/db/repositories.ts` for a real DB later — no service code changes. |
| `ANTHROPIC_API_KEY` | "Why this?" explanations use deterministic templates built from the same evidence (`src/services/interventionAndExplanation.ts`), not natural-language generation. |
| `FEATURE5_API_URL` / `FEATURE5_API_KEY` | Practice-session dispatch uses a local mock session ref so the loop still runs end-to-end (`src/services/integrations/Feature5Client.ts`). |
| `FEATURE6_API_URL` / `FEATURE6_API_KEY` | Evidence and reassessment reads come from the local store instead of a live call (`src/services/integrations/Feature6Client.ts`). |
| `JWT_SECRET` | No auth is enforced — wire this into ACEAPT's existing auth layer before exposing this outside a trusted network. |

## Architecture — plan section → file

```
§5 §33   Evidence → Problems         src/services/problemAndPriority.ts   (ProblemDetectionService)
§6       Priority scoring            src/services/problemAndPriority.ts   (PriorityEngine)
§17      Regression detection        src/services/problemAndPriority.ts   (RegressionDetectionService)
§5 §18   Intervention selection      src/services/interventionAndExplanation.ts (InterventionService)
§14 §38  "Why this?" explanations    src/services/interventionAndExplanation.ts (ExplanationService)
§4 §7 §8 Next-best-action + board    src/services/actionOrchestration.ts  (NextBestActionService)
§9 §10   Time-aware daily plan       src/services/actionOrchestration.ts  (ActionPlanService)
§24 §11  Action lifecycle            src/services/actionExecution.ts      (ActionExecutionService)
§13      Outcome recording           src/services/actionExecution.ts      (ActionOutcomeService)
§12      Effectiveness analysis      src/services/actionExecution.ts      (InterventionEffectivenessService)
§19      Goals                       src/services/goalsAndMilestones.ts   (GoalService)
§16 §22  Milestones                  src/services/goalsAndMilestones.ts   (MilestoneService)
§20 §21  Readiness gap               src/services/readinessAndProgress.ts (ReadinessGapService)
§27 §28  Progress story / before-after src/services/readinessAndProgress.ts (ProgressStoryService)
§35      Feature 5 / Feature 6 boundary   src/services/integrations/*
§37      Data model                 src/types/index.ts + src/db/repositories.ts
```

Per §36 ("reuse existing services... do not create unnecessary microservices"),
related services are grouped into one file where their responsibilities are
tightly coupled, but every service named in §36 is exported as its own class —
`grep -r "^export class"  src/services` to see all 13.

Per §38/§39, AI (`ExplanationService`) only ever produces phrasing. Every
score, threshold, priority bucket, milestone completion, and before/after
number is computed by plain deterministic code — nothing an LLM call could
alter. Per §32, there is intentionally no recruiter/TPO-facing route here;
that boundary is out of scope for Feature 7.

## API surface

All routes are mounted under `/api` and scoped to one student at a time.

```
GET  /students/:id/summary
GET  /students/:id/next-best-action
GET  /students/:id/priorities                 (§7 top/secondary/maintain board)
GET  /students/:id/action-plan?minutes=30      (§9/§10)
POST /actions/:id/start
POST /actions/:id/skip          { reason? }
POST /actions/:id/complete      { before_metrics, after_metrics }
GET  /students/:id/actions
GET  /students/:id/readiness-gap               (§20/§21)
GET  /students/:id/milestones                  (§22)
GET  /students/:id/progress-story              (§27)
GET  /students/:id/before-after                (§28)
GET  /students/:id/goals
POST /students/:id/goals        { goal_type, target?, deadline? }
GET  /students/:id/regressions                 (§17)
GET  /students/:id/intervention-effectiveness  (§12)
```

`after_metrics` on `/complete` accepts any of `accuracy`, `concept_mastery`,
`avg_solving_time_sec`, `mixed_topic_accuracy`, `timed_accuracy`, `readiness`.
Whichever keys you send are written back into that skill's evidence record —
this is what makes the *next* `/next-best-action` call reflect real
improvement instead of repeating the same recommendation (§11).

## Try the full loop

```bash
npm run dev &
curl -s localhost:4007/api/students/demo-student-01/next-best-action | jq
# → TIMED_PRACTICE on Data Interpretation (matches plan §8 / §42)

ACTION_ID=<id from the response above>
curl -s -X POST localhost:4007/api/actions/$ACTION_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"before_metrics":{"accuracy":74,"readiness":62},"after_metrics":{"accuracy":81,"readiness":73}}'

curl -s localhost:4007/api/students/demo-student-01/next-best-action | jq
# → shifts to ERROR_REPAIR on Calculation Accuracy — the next real bottleneck,
#   not a repeat of the same recommendation (§11 Adaptive Priority)
```

Demo evidence lives in `src/db/seed.ts` — six skills shaped to exercise
`SPEED_GAP`, `ERROR_PATTERN`, `CONCEPT_GAP`, `STABLE_STRENGTH`,
`MIXED_PERFORMANCE_GAP` and `REGRESSION` for real, rather than hard-coding
any output. Edit it freely, or delete `data/store.json` to reset to the
seed.
