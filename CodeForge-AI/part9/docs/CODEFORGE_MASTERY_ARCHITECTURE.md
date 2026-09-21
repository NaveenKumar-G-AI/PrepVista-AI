# CodeForge Mastery Architecture

## What this is

A standalone, integration-ready implementation of the core loop from the
Adaptive Technical Mastery spec:

```
ROLE → SKILL REQUIREMENTS → EVIDENCE → MASTERY → GAP → NEXT BEST ACTION
  → PRACTICE → TRANSFER → VERIFICATION → RETENTION → MASTERY UPDATE → repeat
```

It was built with no existing CodeForge/PrepVista repository to inspect or
integrate with — see `INTEGRATION_GUIDE.md` for what that means for you.

## Layers

```
domain/         Pure functions. No I/O, no AI, no database. Fully unit
                tested (25 tests). This is the actual "intelligence" —
                mastery calculation, gap diagnosis, ranking, explanation.

ai/             AIProvider interface + Groq/Gemini clients + a router that
                falls back to deterministic text if every provider fails.
                Nothing in domain/ depends on this layer at all.

repositories/   Thin Postgres access (via `pg`). Translates between SQL
                rows and the domain/types.ts shapes. No business logic.

services/       Orchestration: calls repositories, calls domain functions,
                manages transactions. This is where "recalculate mastery
                after a practice submission" actually happens.

api/            A thin Express layer over the services, for standalone
                running/testing. Replace this with your real app's routes
                — see INTEGRATION_GUIDE.md.
```

The dependency direction is one-way: `api → services → repositories/domain`,
and `domain` depends on nothing. This is why the mastery calculation keeps
working even if Postgres and every AI provider are both down — it's pure
functions in, pure data out.

## Why domain logic is pure

PHASE 38 of the spec says AI must never be the source of truth for mastery,
and PHASE 52 says AI shouldn't be used for arithmetic. The strongest way to
guarantee that isn't a comment saying "don't do that" — it's writing the
mastery/gap/ranking functions so they *physically cannot* call an AI
provider or touch a database, because they don't import anything that could.
`calculateMastery(evidence: SkillEvidence[]): MasteryResult` takes an array
and returns a value. There's nothing to fail.

## What's real vs. what's a stand-in

- `students` and `problems` tables (migration `000_integration_stubs.sql`)
  are NOT part of this engine. They exist only so the schema is runnable
  standalone. Your real user and challenge tables replace them.
- `db/local_dev_shim.sql` recreates `auth.uid()`/`auth.role()` so RLS can be
  tested on plain Postgres. Supabase provides these natively — don't run
  this file against a real Supabase project.
- Everything else — the skill graph, evidence, mastery state, recommendation
  tables, RLS policies, and all of `src/` — is the actual deliverable.

## Validation performed in this environment

- `npx tsc --noEmit` — strict mode, zero errors, across domain/ai/repositories/services/api.
- `npx vitest run` — 31/31 unit tests, covering the spec's own PHASE 76 critical scenarios.
- All 6 migrations applied to a real local Postgres 16 instance (`scripts/migrate.sh`).
- `scripts/rls_isolation_test.sh` — 8 security assertions run as a genuine
  non-superuser, non-table-owning Postgres role (superusers and table owners
  bypass RLS regardless of policy, so this distinction matters): own-data
  reads work, cross-student reads are blocked with and without an explicit
  filter, direct client writes to evidence are rejected, the service-role
  path still works, and TPO access is scoped to explicitly assigned students.
- `scripts/smoke_test.ts` — the actual repository→service→domain wiring,
  run against real Postgres, reproducing the spec's own PHASE 91 worked
  example (a role-relevant skill blocked by a weak prerequisite, correctly
  diagnosed and recommended instead of the blocked skill itself).

See `FINAL_TRUTH_REPORT.md` for the honest, capability-by-capability status.
