# CodeForge AI — Personalized Coding Challenge Engine

A standalone reference implementation of the CodeForge capability described in
the master build prompt: the technical coding mastery component of the
PrepVista ecosystem. Built without access to the real PrepVista repository —
read `docs/IMPLEMENTATION_MANIFEST.md` first, it explains exactly what that
does and doesn't mean for what's in this folder.

## Quick start

```bash
npm install          # or ensure tsx/typescript/@types/node are available globally
npm run demo         # runs the full §58 scenario end to end, with real execution
npm test             # 57 tests, all against real subprocess execution — no mocked executor
npm run validate-seed # independently re-verifies every seed challenge's solution
npm run typecheck    # tsc --noEmit
npm run serve        # starts the real HTTP API on :8787 (npm run test:http exercises it end to end)
npm run test:frontend # executes the real frontend script against a DOM stub (no browser needed)
```

Open `src/web/index.html` directly in a browser to try the coding workspace —
it works standalone with real captured data, no server required. Check "Use
live API" and point it at `npm run serve` to execute arbitrary code for real.

Nothing above needs an API key. `npm run demo` will show the AI-coaching and
AI-generation steps correctly falling back to an explicit "pending" /
"rejected" state (§44), which is the intended behavior with no
`GROQ_API_KEY`/`GEMINI_API_KEY` set — not an error.

To try it with a live AI provider:

```bash
export GROQ_API_KEY=...      # or
export GEMINI_API_KEY=...
npm run demo
```

`buildDefaultProviderChain()` in `src/ai/providers.ts` picks either up
automatically.

## Where things are

```
db/migrations/0001_init.sql   Postgres/Supabase schema (RLS included)
docs/                         Architecture, data model, adaptation & evaluation,
                               security, testing, research, and the manifest —
                               read IMPLEMENTATION_MANIFEST.md first
src/domain/                   Types, enums, skill taxonomy — no logic
src/data/seedChallenges.ts    5 hand-authored, fully-verified challenges
src/execution/                Real sandboxed subprocess execution (Python/JS)
src/engine/                   Selection, difficulty policy, mistake classification, hints
src/evaluation/                Deterministic (final) + AI (advisory) evaluation
src/ai/                       Provider abstraction, Groq/Gemini adapters, resilience chain
src/generation/                AI-draft → independently-validated challenge generation
src/service/codeforgeService.ts  The orchestrator — the §46 API surface
src/api/server.ts             Dependency-free HTTP layer over the service
src/web/index.html            The coding workspace UI — open directly in a browser
src/store/store.ts            In-memory repository (swap for Supabase behind the same interface)
src/demo/runDemo.ts           The end-to-end demonstration — start here to see it work
tests/                        57 tests, real execution, no mocked executor
scripts/validate-seed.ts      Independently re-verifies the seed challenge data
scripts/http-integration-check.ts  Exercises the real HTTP server end to end
scripts/dom-smoke-test.cjs    Executes the real frontend script against a DOM stub
```

## The one-paragraph version

Given a student profile (skill levels backed by real evidence, not vibes),
`getNextChallenge()` picks a challenge through an interpretable weighted score
— gap urgency, role relevance, difficulty fit, freshness, task diversity —
and explains its own reasoning. `submitAttempt()` runs the student's code for
real, in a resource-limited subprocess, against public and hidden tests;
scores it deterministically; classifies any failure into a real mistake
category driven by the actual exception/test pattern; and only then layers
optional AI coaching on top, which can fail without ever changing the grade.
A resolved attempt updates the student's skill evidence and the next
difficulty recommendation through explicit rules, not a black box. Run
`npm run demo` and read along — every number it prints is computed live, not
hardcoded.
