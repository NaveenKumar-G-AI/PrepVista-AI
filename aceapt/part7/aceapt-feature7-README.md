# ACEAPT — Feature 7: Intelligent Readiness Coaching & Action Engine

A build of the full product plan you provided: the orchestration layer that
sits between Feature 6 (diagnosis) and Feature 5 (practice) and answers
*"I know why I'm not ready — what do I do next?"*

## What's in this download

| File | What it is |
|---|---|
| `aceapt-feature7-backend.zip` | Node/TypeScript/Express API — the real intelligence layer. All 13 named services from §36, deterministic scoring, evidence-driven. |
| `aceapt-feature7-frontend.zip` | React/Vite/TypeScript dashboard — Action Center, Priority Board, Readiness Gap, Milestones, Progress Story. Talks to the backend over HTTP. |
| The interactive artifact rendered in this chat | A self-contained walk-through of the same experience with sample data, so you can see it work right now without installing anything. |

## Run it

```bash
# Terminal 1 — backend (http://localhost:4007)
unzip aceapt-feature7-backend.zip -d backend && cd backend
npm install && npm run dev

# Terminal 2 — frontend (http://localhost:5173)
unzip aceapt-feature7-frontend.zip -d frontend && cd frontend
npm install && npm run dev
```

Open `localhost:5173`. It's pointed at the backend's seeded demo student out
of the box — no config needed.

## About the blank keys

Every credential and external URL (`DATABASE_URL`, `ANTHROPIC_API_KEY`,
`FEATURE5_API_URL`, `FEATURE6_API_URL`, `JWT_SECRET`) is left blank in
`backend/.env.example`, as requested. Nothing needs to be filled in to run —
each one has a working local fallback that keeps the product fully
functional:

- **No database** → persists to a local JSON file, swappable later behind one repository file.
- **No AI key** → "why this?" explanations use deterministic templates built from the same evidence, not a live model call.
- **No Feature 5 / Feature 6 URLs** → local mocks stand in so the full loop still runs end-to-end.

Fill in real values whenever you have them; nothing else in the code needs
to change.

## Scope and assumptions

I built this directly off your plan without stopping to ask anything, per
your note — a few calls I made along the way, so you can course-correct
anything that doesn't match what you had in mind:

- **§41 prioritization respected.** All 8 MUST HAVE items are fully built and working (readiness gap, priority engine, next-best-action, action center, Feature 5/6 integration contracts, before/after measurement, improvement explanation) — plus most of the WOW tier (milestones, regression detection, intervention effectiveness, goal-aware recommendations, progress story). FUTURE-tier items (cohort modeling, predictive optimization) are intentionally not built.
- **§32 boundary respected.** No recruiter/TPO-facing routes exist here — every endpoint is scoped to one student.
- **§38/§39 respected.** AI touches phrasing only (the "why this?" explanation). Every score, threshold, priority bucket, and before/after number is plain deterministic code.
- **Demo data, not a real dataset.** `backend/src/db/seed.ts` seeds one student with six skills shaped to genuinely exercise the engine's different branches (I verified the priority math by hand against the API output). Swap it for real Feature 6 evidence whenever that integration is live.
- **§36 consolidation.** Related services share a file where the plan itself invites it ("do not create unnecessary microservices") — every service is still exported under its own name; see the map in `backend/README.md`.

## Try the adaptive loop yourself

This is the part worth actually clicking through: complete the recommended
action in the Action Center, and watch the *next* recommendation change to a
genuinely different bottleneck — not a repeat of the same one. That's §11
working for real, not scripted.
