# ACEAPT Feature 42 — Advanced Aptitude Diagnostic Engine

A diagnostic engine that measures a student's current aptitude across a
skill hierarchy — not just a score, but capability, evidence quality,
uncertainty, speed/accuracy patterns, and a difficulty breakdown point —
and turns that into a prioritized, explainable next step.

**Start with `TRUTH_TABLE.md`** for an honest, specific account of what's
real, what's a port, and what's explicitly out of scope. This README is
just orientation; that file is the accurate one.

## Stack

TypeScript · Fastify · PostgreSQL 16 (RLS FORCED, SECURITY DEFINER-only
writes, zero direct grants for the app role) · React (server-rendered
result experience) · Groq for AI explanation prose, behind an always-on
deterministic fallback · Vitest

This matches the stack and security pattern established by ACEAPT
Feature 4 and Feature 28, not a fresh guess.

## Layout

```
db/migrations/     Schema, RLS policies, SECURITY DEFINER functions (000–006)
src/types/         Domain types + the ports (contracts.ts) where real
                    ACEAPT systems (auth, question bank, mistake
                    intelligence) would plug in
src/engine/        Pure, unit-tested domain logic — no DB or HTTP inside
src/ai/            Groq adapter + deterministic fallback for explanation prose
src/repositories/  In-memory (fast tests) and Postgres (real) implementations
src/api/           Fastify routes + the dev-mode auth stand-in
frontend/          Result-experience React components + one bespoke SVG visual
tests/             58 tests across unit / archetypes / edge cases / real
                    Postgres integration / real HTTP / React SSR
```

## Running it

```bash
npm install
npm run migrate      # applies db/migrations/001+ as diag_owner
npm run dev           # Fastify on :4042
npm test              # full suite — needs DIAG_OWNER_PASSWORD / DIAG_APP_PASSWORD set
```

`db/migrations/000_bootstrap_roles.sql` is a one-time superuser step
(creates the `diag_owner` / `diag_app` roles) — see its header comment
for why that's deliberately separate from the app's normal migration
path. All secrets are blank in `.env.example`; nothing was filled in.

## The one thing worth reading in the code first

`src/engine/studentProfileBuilder.ts` — it's the orchestrator that shows
how every other engine module's output fits together into the thing a
student actually sees. `tests/archetypes/studentArchetypes.test.ts` is
the second thing — it proves (not asserts) that the engine actually
tells apart all ten patterns Module 55 specified, including the two that
are easy to get wrong: fast-but-wrong vs. slow-but-right, and
overconfident vs. underconfident.
