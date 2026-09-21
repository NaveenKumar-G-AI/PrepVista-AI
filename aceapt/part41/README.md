# ACEAPT Feature 41 — Adaptive Career Strategy Engine (Next-Gen)

Built from the Feature 41 Next-Gen spec you provided. Read
`docs/COMPLETION_REPORT.md` first — it explains the one big assumption this
build had to make (no existing ACEAPT repository was available in this
conversation, only the spec) and exactly what that means for what's real
vs. a placeholder.

## Quick orientation

```
backend/    Express module — engines, AI pipeline, routes, migration, tests
frontend/   React/TypeScript components — Career Command Center + cards
docs/       ARCHITECTURE.md (how it fits together) + COMPLETION_REPORT.md
.env.example  Every secret blank, as requested — see below
```

## Try it in under a minute

```bash
cd backend
npm install
npm test          # 20 tests, all passing, all real assertions on real logic
npm run seed:qa   # runs the spec's own "Final QA Scenario" (section 99)
                   # end-to-end and prints what the engines actually computed
```

No `.env` file is required for either of those — everything defaults to
in-memory storage and deterministic-only recommendations.

## On the keys

`.env.example` has `DATABASE_URL`, `ANTHROPIC_API_KEY`, and `JWT_SECRET` all
blank, as requested. Nothing in the code hardcodes a secret or breaks when
these are blank:
- No `DATABASE_URL` → runs on an in-memory store (`FEATURE41_STORE=memory`).
- No `ANTHROPIC_API_KEY` → recommendation explanations come from a
  deterministic template built from the same engine output an LLM call
  would have explained — not a degraded or fake response, just a plainer
  one (see `backend/src/services/narrativeServices.ts`).
- No `JWT_SECRET` → nothing currently reads it; it's there for when you
  wire in real auth (see below).

Fill these in in a real `.env` (not `.env.example`) when you're ready to
connect a real database and/or enable LLM-generated narrative explanations.

## What this is not

This is not a drop-in replacement for "the existing ACEAPT app" — there was
no existing app in this conversation to replace anything in. It's a
complete, independently-tested implementation of the P0 scope from the spec
(command center, strategy versioning, bottleneck detection, next-best-move,
strategy health, constraints, decision integration, strategy review,
timeline, recommendation explanations, confirmation-gated strategy changes,
student-scope isolation), built so the integration points — where it reads
your real student data, where your real auth goes, where your real database
goes — are explicit interfaces rather than guesses. `backend/README.md` and
`frontend/README.md` each have a "what's real vs. placeholder" section;
`docs/COMPLETION_REPORT.md` has the full spec-mandated report.
