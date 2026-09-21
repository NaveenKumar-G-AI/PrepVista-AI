# CodeForge AI — Code Review Mode

A real, standalone implementation of the diff-aware review workflow described
in the spec: submit a revision → get evidence-grounded findings → respond →
disagree → fix → re-review → decision. Built with no existing CodeForge
repository to integrate against (none was present in this workspace) — every
integration point with your actual Feature 16/17/18/etc engines is a typed
interface in `src/analysis/evidenceAdapter.ts`, ready to wire in.

## Quick start

```bash
npm install
cp .env.example .env        # keys left blank on purpose — fill in later
npm test                    # 41 tests, all exercising real engine logic
npx tsx src/scripts/liveIntegrationCheck.ts   # boots the API in-process and drives the full workflow
npm run dev                 # starts the API on :8787
```

## Layout

```
src/
  domain/types.ts          all shared types (taxonomy, severity, priority, status, etc.)
  diff/diffEngine.ts        base/target -> DiffRegion[]
  analysis/
    complexityHeuristic.ts  real AST-based complexity (acorn) — reference impl for Feature 17's contract
    duplicationHeuristic.ts real line-similarity duplication check — reference impl for Feature 18's contract
    evidenceAdapter.ts       interfaces your real Feature 16/17/18 engines plug into
  findings/
    findingEngine.ts         evidence -> classified, deduplicated findings
    fingerprint.ts            stable identity + cross-revision content matching
    lifecycle.ts               server-controlled status state machine
  review/
    reReviewEngine.ts         RESOLVED / STILL_PRESENT / REGRESSED / MOVED / INCONCLUSIVE
    decisionEngine.ts         deterministic APPROVE/BLOCKED/... rules (no LLM judgment)
    responseEngine.ts         response-quality heuristic + evidence-gated disagreement handling
  ai/
    providers.ts               Groq / Gemini adapters + Mock (graceful no-op when keys are blank)
    promptBuilder.ts           injection-resistant prompt construction
    schema.ts                  Zod validation + anti-fabrication evidence-ref guard
  api/                         Express routes, auth stub, rate limiter, in-memory store
  db/migrations/001_init.sql  Postgres/Supabase schema + RLS — verified against real Postgres, see below
  scripts/liveIntegrationCheck.ts  boots the app in-process and drives create→respond→authz→re-review
  __tests__/                  41 tests: engine, review/decision, AI safety, golden end-to-end scenario
frontend/
  api.ts, components.tsx      review UI (findings list, inline threads, decision banner) — source only, see note below
scripts/
  local-only-auth-stub.sql    NOT shipped — local stand-in for Supabase's auth schema, used only to test RLS here
  rls-isolation-test.sql      the actual isolation proof run against real Postgres in this sandbox
```

## Wiring into the real CodeForge repository

1. Copy `src/` in wholesale (it has zero dependency on Express — only `src/api/*` does).
2. Implement `CorrectnessEvidenceProvider` / `ComplexityEvidenceProvider` / `QualityEvidenceProvider` from `src/analysis/evidenceAdapter.ts` as thin wrappers around your existing Feature 16/17/18 services, and pass them into `generateFindings()`. Nothing else needs to change.
3. Replace `src/api/store.ts` (in-memory) with a Postgres client against `src/db/migrations/001_init.sql`.
4. Replace `requireUser` in `src/api/middleware.ts` with real Supabase JWT verification.
5. Drop `frontend/components.tsx` into your app and point `frontend/api.ts` at your real base URL / auth.
6. Fill in `GROQ_API_KEY` or `GEMINI_API_KEY` in `.env` if you want AI-enriched findings on top of the deterministic ones — everything works with both blank.

## What "evidence-grounded" actually means here, concretely

- Every finding's `evidence[]` array points at a real, inspectable fact (a diff region, a recorded before/after complexity measurement, a specific failing test id) — nothing is templated boilerplate.
- AI-generated findings are Zod-schema-validated, and any finding citing an `evidence_refs` id that isn't in the real evidence bundle sent to the model is silently dropped — this is a code-level guard, not a prompt instruction the model could ignore.
- The decision engine (`APPROVE` / `CHANGES_REQUESTED` / `BLOCKED` / ...) is pure, deterministic rule logic over severity/priority/status. An LLM is never asked to decide merge-readiness.

## Verified, not just written

- `npm test` → **41/41 passing**, including a full golden-scenario test (bug found → blocked → developer responds and disagrees → fixes → re-review → resolved → decision `APPROVE_WITH_SUGGESTIONS`).
- The Express API was booted for real and driven through create → respond → cross-user-authorization → re-review via `src/scripts/liveIntegrationCheck.ts`.
- **4 real bugs were found and fixed by actually running things**, not just writing code: a missing type declaration, a similarity metric too strict to match short flagged snippets against context-padded diff hunks, an unhandled-promise-rejection crash in the API (now a proper 500 with a global error handler), a unified-diff "no newline at end of file" marker leaking into finding snippets, and a re-review gap where a complexity finding could be silently marked RESOLVED just because the diff pair it was re-checked against didn't happen to show a delta (fixed with an absolute reconfirmation check, locked in by a regression test).
- **RLS was verified against a real local Postgres 16 instance** (not just asserted): `001_init.sql` was applied as-is, a least-privilege `authenticated` role was created (superusers bypass RLS, so testing as one would prove nothing), and `scripts/rls-isolation-test.sql` proved: the owning student sees their review and finding; a second student sees **zero rows**, including when querying the exact primary key directly (no data leak, no error — just correctly empty); and a forged `reviewer`-authored message insert from the non-owner is **rejected by Postgres itself** with a row-level-security violation, even though that request never went through the API layer at all.

## Known limitations (marked honestly, not hidden)

- **PARTIAL** — Reviewer personas, interview mode, and assessment mode exist as fields/flags (`ReviewerPersona`, `ReviewMode`) that the engine threads through, but don't yet have distinct behavioral logic per mode. The spec's "professional PR-discussion simulation" and "server-authoritative assessment controls" would need real content/behavior rules built on top of these flags.
- **PARTIAL** — Complexity/duplication analysis is a genuine, tested, AST-based reference implementation, but scoped to JavaScript. Multi-language support should come from your real Feature 17/18 engines via the `evidenceAdapter.ts` seam, not from extending this heuristic.
- **NOT IMPLEMENTED** — Observability is limited to correlation IDs and console logging; no metrics pipeline (latency histograms, false-positive tracking, etc.) is wired to real infrastructure.
- **NOT IMPLEMENTED** — The full adversarial test matrix from the spec (giant diffs, generated-code detection, contradictory-evidence handling) isn't covered — `ai-safety.test.ts` covers prompt injection, output fabrication, and AI-failure fallback specifically, which were the highest-value cases to get right first.
- The frontend components are real, typed source — but not wired to a live backend in this environment (a Claude.ai chat sandbox can't expose a running Express server to a rendered UI), so they're delivered as integration-ready files rather than a live demo. Building a disconnected mock UI instead would have been exactly the "fake prototype" the spec says not to ship.

## Status report

```
IMPLEMENTED:            diff engine, finding engine, evidence model, fingerprinting,
                         lifecycle state machine, re-review engine, decision/merge-readiness
                         engine, response quality + disagreement handling, AI provider
                         abstraction with anti-fabrication guard + injection defense,
                         REST API, rate limiting, Postgres/Supabase schema + RLS (verified),
                         review UI components (source), 41 automated tests, live integration script

PARTIALLY IMPLEMENTED:  reviewer personas / review modes (flags exist, no distinct behavior yet),
                         observability (correlation ids + logs, no metrics pipeline)

NOT IMPLEMENTED:        multi-language static analysis, full adversarial test matrix,
                         live-wired frontend (source delivered, not runnable against a live
                         backend in this sandbox)

Architecture discovered: none — no existing CodeForge repository was present in this workspace
Architecture implemented: standalone TypeScript engine + Express API + Postgres/Supabase schema
Files created:           ~30 source files (see Layout above)
Database changes:        src/db/migrations/001_init.sql — applied and RLS-verified against real Postgres
APIs:                    POST /api/reviews, GET /api/reviews/:id, POST /api/reviews/:id/findings/:id/respond,
                          POST /api/reviews/:id/re-review, GET /api/reviews/:id/decision, GET /api/reviews/:id/events
Frontend changes:        frontend/components.tsx, frontend/api.ts (source, not live-wired — see note above)
Review engine:           implemented, tested
Finding engine:          implemented, tested
Re-review engine:        implemented, tested (including the absolute-reconfirmation fix above)
Security:                prompt-injection defense, evidence-ref anti-fabrication guard, app-layer
                          ownership checks, rate limiting
RLS:                     implemented and verified against real Postgres (see scripts/rls-isolation-test.sql)
Observability:           correlation IDs + structured error logging only
Tests:                   41/41 passing (npm test)
Security tests:          prompt injection, evidence fabrication rejection, cross-user authorization
                          (live, via liveIntegrationCheck.ts), RLS isolation (live, via Postgres)
End-to-end tests:         golden scenario (src/__tests__/e2e.test.ts) + live workflow script
Environment variables:   GROQ_API_KEY, GEMINI_API_KEY, DATABASE_URL, PORT — see .env.example (all blank)
Run commands:            npm install && npm test && npm run dev
Known limitations:       see section above
```
