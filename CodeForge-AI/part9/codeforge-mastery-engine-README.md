# CodeForge Mastery Engine

A standalone, integration-ready implementation of the core loop from the
Adaptive Technical Mastery spec: **Role → Skill Requirements → Evidence →
Mastery → Gap → Next Best Action → Practice → Verification → Retention →
Mastery Update → repeat.**

Built with no existing CodeForge/PrepVista repository to inspect — see
`docs/INTEGRATION_GUIDE.md` for exactly what that means and what to rewire.
See `FINAL_TRUTH_REPORT.md` for an honest, capability-by-capability status
instead of a blanket "done."

## What's actually been verified in this environment

- **Domain logic**: 31/31 unit tests passing (`npx vitest run`), covering
  the spec's own critical scenarios — no evidence → UNKNOWN never WEAK,
  same-problem farming capped, solution-viewed evidence discounted,
  MASTERED requires independent+transfer+high-stakes evidence together,
  STRONG/MASTERED decays to STALE, AI-down still returns a recommendation.
- **Type safety**: `npx tsc --noEmit` is clean in strict mode across the
  whole project.
- **Database**: all 6 migrations applied successfully to a real local
  Postgres 16 instance.
- **Security**: `scripts/rls_isolation_test.sh` runs 8 real assertions as a
  genuine non-superuser Postgres role (superusers bypass RLS, so this
  distinction is load-bearing) — cross-student reads are blocked, direct
  client writes to evidence are rejected, TPO access is scoped to
  explicitly assigned students only.
- **Wiring**: `scripts/smoke_test.ts` runs the full
  repository→service→domain stack against real Postgres, reproducing the
  spec's own worked example (Dynamic Programming blocked by a weak
  prerequisite, correctly diagnosed and recommended instead of DP itself).

## Quickstart

```bash
npm install
npm test                    # 31 domain/AI-layer unit tests, no DB needed

# Against a real Postgres database:
export DATABASE_URL=postgres://user:pass@localhost:5432/codeforge_mastery
npm run db:migrate          # applies db/migrations/000-005 in order
npx tsx scripts/smoke_test.ts   # seeds a tiny example and prints the recommendation

npm run dev                 # standalone API on :3001 (see docs/INTEGRATION_GUIDE.md)
```

## Layout

```
src/domain/       Pure functions — mastery calc, gap diagnosis, ranking,
                   explanation, retention scheduling, anti-gaming, transfer
                   classification. No I/O. Fully unit tested.
src/ai/           Groq + Gemini clients behind a router that falls back to
                   deterministic text if every provider fails.
src/repositories/ Postgres access (pg). No business logic.
src/services/     Orchestration — transactions, recalculation triggers.
src/api/          Thin Express layer for standalone running.
db/migrations/    6 numbered SQL migrations, RLS included.
demo-ui/          One React panel (see below).
docs/             Architecture, mastery model, evidence model,
                   recommendation engine, integration guide.
scripts/          Migration runners, the live RLS test, the smoke test.
```

## Demo UI

`demo-ui/NextBestActionPanel.jsx` — a "calibration console" styled panel
showing a primary recommendation, its evidence, and reasons, with a toggle
that switches between AI-polished and deterministic-fallback phrasing (both
real strings from this project, not placeholders) to make the fallback
guarantee visible, not just asserted in a test. Sample data mirrors the
actual output of `scripts/smoke_test.ts`.

## Known rough edges (see FINAL_TRUTH_REPORT.md for the full list)

- `npm audit` reports some transitive dependency vulnerabilities (moderate/high) —
  worth a `npm audit fix` pass before production, not chased here.
- The RLS test harness (`scripts/rls_isolation_test.sh`) is for local/CI use
  against a throwaway database — it creates its own test role and depends
  on `db/local_dev_shim.sql`, which must never be run against real Supabase.
- `learning_recommendations` has a schema but the service doesn't persist
  ranked results into it yet (see `docs/CODEFORGE_RECOMMENDATION_ENGINE.md`).
