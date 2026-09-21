# Database

## Schema

`db/schema.sql` is written in standard, Postgres-compatible SQL — explicit types, explicit `REFERENCES` foreign keys, explicit `CHECK` constraints, explicit indexes — and executed as-is against SQLite (`node:sqlite`) for this reference build.

Core tables: `students`, `skills`, `skill_relationships`, `roles`, `role_skill_priority`, `challenges`, `challenge_skills`, `challenge_test_cases`, `attempts`, `evaluation_results`, `diagnoses`, `evidence`, `student_skill_state`, `recommendations`. See the file itself for the full column list and constraints — it is the source of truth, not reproduced here.

## Why SQLite for this build

`node:sqlite` is a zero-dependency, built-in module (Node ≥ 22.5, used here behind `--experimental-sqlite`), which avoids native-binary installation risk entirely in a sandboxed build environment. It supports foreign keys, `CHECK` constraints, and `ON CONFLICT` upserts, which is enough to genuinely enforce the data-integrity properties described in `CODEFORGE_SECURITY.md` (this was not just assumed — a foreign-key violation was hit and fixed for real during test development, see `CODEFORGE_FINAL_REPORT.md`).

## SQLite vs. Postgres differences to handle on migration

- **UUIDs**: this build uses `crypto.randomUUID()` in application code for generated ids (`attempts`, `evidence`, `recommendations`, etc.) rather than a database default, specifically so the same code works unchanged against Postgres (`gen_random_uuid()` or `uuid_generate_v4()` could be added as a column default there, but isn't required).
- **Timestamps**: stored as ISO 8601 text (`datetime('now')` default), which parses identically in both engines; a Postgres migration could switch the column type to `timestamptz` without changing application code, since all reads go through `new Date(...)`.
- **RLS**: SQLite has no RLS engine. `db/rls_policies.sql` is written for Postgres/Supabase and is not executed in this build — see `CODEFORGE_SECURITY.md` for how the equivalent boundary is enforced here.
- **JSON columns**: stored as `TEXT` with `JSON.stringify`/`JSON.parse` in application code (`languages_supported`, `evidence_snapshot_json`, `raw_result_json`) rather than a native `jsonb` column — this also works unchanged against Postgres, though a Postgres deployment could switch these to `jsonb` for queryability and drop the manual parse/stringify.

## Indexes

`evidence(student_id, skill_id)`, `evidence(student_id, created_at)`, `attempts(student_id)`, `attempts(student_id, challenge_id)`, `student_skill_state(student_id)`, `recommendations(student_id, status)`, `skill_relationships(from_skill_id)`, `skill_relationships(to_skill_id)`, `challenges(primary_skill_id)`, `role_skill_priority(role_id)` — covering the actual query patterns used by `EvidenceService`, `MasteryStateService`, `CandidateRetrieval`, and `RecommendationService`.

## What is NOT implemented

- No connection pooling / read replicas / caching layer — appropriate for a reference build, not evaluated for production load (see `CODEFORGE_FINAL_REPORT.md`, Performance).
- No database migration tool (Prisma/Knex/etc.) — `runMigrations()` just executes `schema.sql` with `CREATE TABLE IF NOT EXISTS`, which is idempotent but not a versioned migration history. A real deployment should adopt Supabase's own migration tooling.
