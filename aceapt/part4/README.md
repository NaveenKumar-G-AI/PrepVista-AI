# ACEAPT Feature 4 — Personalized Mastery Path & Learning Intelligence Engine

Turns Feature 3's skill intelligence ("Percentage Application = DEVELOPING") into Feature 4's action intelligence ("practice Percentage Application next, because — here's the evidence"). See `TRUTH_TABLE.md` for exactly what's real, stubbed, or not built, and why.

## Stack

Real TypeScript, Fastify, Postgres 16 with row-level security, `zod` for validation, an OpenAI-compatible client pointed at Groq (optional — falls back to deterministic content with no key). No ORM: the schema and the two `Store` implementations (in-memory + Postgres) are hand-written so the RLS/`SECURITY DEFINER` security model in `migrations/` is exactly what runs, not something an ORM abstracts away.

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL / MIGRATION_DATABASE_URL for your Postgres; leave GROQ_API_KEY blank to run on the deterministic fallback
npm run migrate         # applies migrations/*.sql in order, tracked in schema_migrations
npm run seed             # seeds the skill catalog + two demo students with identical evidence but different deadlines
```

`DATABASE_URL` must point at a role that is **not** a superuser and does **not** have `BYPASSRLS` — the whole point of the RLS design is that the app is exactly as constrained as an attacker who obtained its credentials. `MIGRATION_DATABASE_URL` is a superuser/owner role used only by `npm run migrate`, never by the running server. See the role-creation commands in `migrations/001_init.sql`'s header comment if you're setting this up from scratch — the important part is:

```sql
CREATE ROLE aceapt_app WITH LOGIN PASSWORD '...';
-- no SUPERUSER, no BYPASSRLS
```

## Run it

```bash
npm run dev              # starts the Fastify server on :4000 (DEMO_MODE=true by default)
npm run demo              # generates real paths for both seeded students and prints them side by side
```

`npm run demo` also mutates one student's evidence partway through to demonstrate the replan loop (Phase 46) for real. If you run it a second time without re-seeding, you'll see a *different* — but equally real — result, because the evidence really did change last time. Run `npm run seed` again first if you want the canonical starting scenario back. This isn't a bug; it's what a stateful demo against a real database does, and it's documented here instead of hidden behind a silent auto-reset.

```bash
npm run test:unit         # 70 tests (55 domain-engine + 15 React SSR), no external dependencies
npm run test:integration  # 20 tests, requires a real migrated Postgres (DATABASE_URL/MIGRATION_DATABASE_URL)
npm run typecheck
```

## Try the API directly

With `npm run dev` running:

```bash
curl -H "x-student-id: priya-demo" http://localhost:4000/api/path
curl -H "x-student-id: priya-demo" http://localhost:4000/api/plan/today
curl -X POST -H "x-student-id: priya-demo" http://localhost:4000/api/path/regenerate
```

`x-student-id` is a **dev-mode-only** stand-in for real auth — see the comment block at the top of `src/plugins/auth.ts` for exactly what to replace and why every route already reads `request.studentId` and nothing else, so no route handler needs to change when you wire real auth in.

## Where things live

```
src/domain/          the actual intelligence — pure functions, no I/O, fully unit-testable
src/repositories/     Store interface + in-memory and Postgres implementations
src/services/         orchestration: wires domain engines to a Store
src/api/               Fastify app, routes, auth plugin
src/data/skillCatalog.ts   the demo skill graph — replace with your real curriculum data
migrations/            schema, RLS policies, SECURITY DEFINER functions, in order
scripts/seed.ts        catalog + two demo students with identical evidence, different context
scripts/demo.ts        the end-to-end walkthrough referenced throughout TRUTH_TABLE.md
web/components/        4 React components (MasteryPath, NodeDetail, WhyThisPanel, TodaysMission)
tests/unit/            domain engine tests + React SSR tests, no external dependencies
tests/integration/     RLS, transition, and live-HTTP tests against real Postgres
```

## Integrating Feature 3 for real

Feature 4 never computes skill mastery itself — it only reads `skill_evidence` (shape: `SkillEvidenceRecord` in `src/domain/types.ts`) and reacts to it. Point your real Feature 3 (e.g. a Skill Signal Intelligence Engine) at writing that table — either directly, or by calling `Store.upsertEvidence`, which is the same `SECURITY DEFINER`-guarded path `scripts/seed.ts` and the dev-only `/api/dev/evidence` route use. Then call `POST /api/path/regenerate` (or wire it to Feature 3's own evidence-write event) — that's the entire integration surface.

## A note on the source prompt's scope

The prompt this was built from specifies 73 phases across an "elite MNC" build process, several rounds of audits, and P0/P1/P2 priority tiers. This delivers **P0 for real** — built, tested against a live database, and honestly reported where it falls short — rather than a shallow pass at all 73. `TRUTH_TABLE.md` is the accounting of exactly where that line falls.
