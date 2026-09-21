# Database

SQLite (`app/db.py`), file at `codeforge_eval.db` by default (override with
`CODEFORGE_DB_PATH`). Stand-in for the host's real Postgres/Supabase — see
`CODEFORGE_EVALUATION_ARCHITECTURE.md` for the swap plan.

## Migrations

Plain, ordered `.sql` files in `migrations/`, applied idempotently and
tracked in a `schema_migrations` table (`run_migrations()` in `app/db.py`).
Never applies schema changes silently outside this mechanism.

## Stand-in tables (would not exist in a real integration)

`students`, `challenges`, `challenge_tests`, `skill_prerequisites` — these
model the pre-existing CodeForge challenge/skill system that this sandbox
doesn't have. A real integration deletes these and points the evaluation
engine's queries at the real tables instead.

## Core entities (this capability)

`attempts` — immutable per-submission record. `attempt_number` increments
per student+challenge+version; `client_request_id` gives idempotency via
a `UNIQUE(student_id, challenge_id, client_request_id)` constraint.
**Attempts are never updated after creation except for status fields**
(`execution_status`, `evaluation_status`) as the pipeline progresses — the
`source_code` and identity columns are write-once.

`execution_results` — one row per test case per attempt.

`evaluation_results` — one row per attempt, the deterministic authority.

`test_failure_analysis` — one row per failed test case; hidden-test
expected values are never persisted here (`NULL` for hidden failures).

`code_analysis_results`, `complexity_analysis` — one row per attempt,
`UNIQUE(attempt_id)`.

`mistake_instances` — many rows per attempt possible; indexed on
`(student_id, skill_id, category)` for the repeated-mistake query.

`diagnoses` — one row per attempt; stores the full structured AI/rule
output plus `ai_status`.

`potential_misconceptions` — one row per `(student_id, skill_id,
category)`, upserted as evidence accumulates; never deleted.

`evidence` — the evidence engine's output; append-only.

`skill_assessments` — current snapshot per `(student_id, skill_id)`,
upserted on every recompute.

`skill_history` — append-only trail of every recompute, tied to the
triggering attempt.

`feedback_reports` — one row per attempt.

`audit_events` — lightweight structured log of pipeline milestones
(see `CODEFORGE_API.md` / observability notes in the final report).

## Data-integrity constraints actually enforced

- Foreign keys ON throughout (`PRAGMA foreign_keys = ON`).
- `CHECK` constraints on every enum-like column (`execution_status`,
  `evaluation_status`, `confidence`, `strength`, `source`, `difficulty`,
  `level`, `ai_status`, etc.) — an invalid value raises at the DB layer,
  not just in application code.
- `UNIQUE` constraints preventing duplicate evaluation/analysis/complexity
  rows per attempt, duplicate misconception rows per student+skill+category,
  and duplicate attempts per idempotency key.
- No orphan evidence: `evidence.attempt_id` is a foreign key; a real
  Postgres deployment should add `ON DELETE RESTRICT`/`CASCADE` policy per
  the host's retention rules (SQLite here doesn't enforce delete behavior
  the same way).

## Known gap

No `ON DELETE` cascade policy is specified (SQLite's FK support doesn't
require one to be declared, but a real Postgres migration should decide
explicitly per Phase 41's "no orphan" requirement).

## Migration 002: background processing, complexity AI columns, explanations

`migrations/002_background_and_explanation.sql` adds:
- `attempts.analysis_status` (`NOT_APPLICABLE|PENDING|COMPLETE|FAILED`) —
  tracks the Phase 35 background-analysis stage separately from
  `execution_status`/`evaluation_status`, which stay synchronous.
- `complexity_analysis.ai_status` / `ai_reasoning` — whether AI-assisted
  complexity refinement ran, and its raw reasoning text, kept separate
  from the static heuristic's own `reasoning` column.
- `explanation_evaluations` — one row per attempt (`provided`,
  `conceptual_understanding`, `consistency_with_code`,
  `algorithm_reasoning_notes`, `ai_status`), written even when the
  student gave no explanation (`provided=0`, `ai_status='NOT_APPLICABLE'`)
  so the distinction between "not given" and "pending/failed" is never lost.

## Multi-threaded SQLite hardening

Two real bugs surfaced once `POST /attempts` started genuinely returning
before background analysis finished (Phase 35 — see
`CODEFORGE_EVALUATION_ARCHITECTURE.md`), because the request thread and
the background-task thread now hold two independent `sqlite3.Connection`
objects (one per OS thread, via `threading.local` in `app/db.py`) open at
the same time:

1. **`FOREIGN KEY` crash on an unseeded student.** This sandbox's dev-token
   auth can mint a token for any string; a real deployment's student row
   already exists by the time someone can submit code. Fixed by lazily
   provisioning a minimal `students` row (`INSERT OR IGNORE`) at the top
   of `submit_attempt`, rather than crashing on a legitimately-authenticated
   but not-yet-seeded student.
2. **That unhandled exception left a dangling open transaction** on
   Python's default (legacy) implicit-transaction sqlite3 behavior — a
   failed `INSERT` still opens a transaction that never gets rolled back,
   poisoning that thread's cached connection for the rest of the process
   and causing `database is locked` on every later write that contends
   with it. Fixed by connecting with `isolation_level=None` (true
   autocommit — no statement can ever leave a dangling transaction), plus
   `PRAGMA journal_mode=WAL` and a 30s `busy_timeout` for any remaining
   brief write/write contention. Documented tradeoff: autocommit means a
   loop of several INSERTs followed by one `commit()` now commits
   row-by-row rather than atomically as a batch — acceptable here, and
   irrelevant to a real Postgres deployment's real connection-pooled
   transactions.

Both are covered by `tests/test_integration_e2e.py::test_rate_limit_blocks_excessive_submissions`
(12 rapid sequential submissions from one student — the scenario that
originally reproduced both bugs) and by a standalone timing repro
documented in `CODEFORGE_FINAL_REPORT.md`.
