# Database

SQLite via `better-sqlite3` (synchronous, transactional, zero external
service to stand up — appropriate for this environment; see "Why SQLite"
below). Full schema: `src/db/schema.sql`. Verified working with a real
native binding (`PRAGMA foreign_keys = ON`, WAL mode) — this was checked by
running an actual insert/select against it before any application code was
written on top of it.

## Entity summary

| Table | Purpose | Mutability |
|---|---|---|
| `skills`, `skill_prerequisites` | The skill graph | Append/update; prerequisite edges checked for cycles at read time |
| `roles`, `role_competencies` | Role blueprint (Phase 3/4) | Data-driven — adding a role never touches engine code |
| `students`, `student_targets` | Who, and their goal/role/date/time | `student_targets` never overwrites — switching role/goal inserts a new row and deactivates the old one, preserving history (Phase 27/28) |
| `skill_evidence` | Raw evidence log | **Append-only. Never UPDATEd or DELETEd**, by design and by the fact that no code path does either |
| `skill_mastery_state` | Materialized current mastery | Derived *only* from `skill_evidence` via `masteryUpdate.ts`; never written directly by any API route |
| `roadmaps`, `roadmap_versions` | The roadmap and its version history | `roadmap_versions` rows are immutable once written; recalculation always INSERTs a new version and flips `is_current`, never UPDATEs a prior version's content (Phase 34) |
| `roadmap_milestones`, `roadmap_skills` | The generated plan content for one version | Written once per version, at version-creation time |
| `student_milestone_progress`, `daily_plans`, `weekly_plans` | Derived planning artifacts | Regenerated per recalculation / per day-or-week; not hand-edited |
| `roadmap_events` | Audit log | Append-only |

## Integrity guarantees actually enforced

- **Foreign keys**: on (`PRAGMA foreign_keys = ON`), enforced by SQLite itself, not just implied by naming.
- **One active roadmap per student**: `CREATE UNIQUE INDEX uq_active_roadmap_per_student ON roadmaps(student_id) WHERE status = 'ACTIVE'` — a partial unique index, not an application-level check that could race.
- **One active target per student**: same pattern on `student_targets`.
- **No orphan milestone/skill**: `roadmap_milestones.roadmap_version_id` and `roadmap_skills.roadmap_milestone_id` are both `NOT NULL REFERENCES`.
- **No invalid enum values**: every status/enum column has a `CHECK` constraint (e.g. `gap_status IN ('UNKNOWN','COMPLETE',...)`) — an invalid value is rejected by SQLite, not just by TypeScript types that a raw SQL statement could bypass.
- **No self-referential prerequisite**: `CHECK (skill_id != prerequisite_skill_id)` on `skill_prerequisites`.

## Why SQLite, not the Postgres/Supabase the brief assumes

The brief assumes an existing Supabase/Postgres project. None exists here,
and standing one up is out of scope for what can be verified inside this
sandbox. SQLite was chosen deliberately over a hand-rolled JSON-file store
specifically so the schema, constraints, and transaction semantics are
*real* and portable — every table above maps directly to a Postgres table
with the same columns and constraints; the main things that don't
transfer 1:1 are:

- **RLS**: SQLite has no row-level security. Every ownership check that RLS
  would enforce at the database layer is instead enforced in
  `src/repositories/*.ts` and `src/api/routes/*.ts` (every query is scoped
  by a `studentId` that comes only from the verified auth token — see
  `docs/SECURITY.md`). A reference Postgres RLS policy equivalent to that
  enforcement is included in `docs/SECURITY.md` for a real deployment.
- **WAL/journal specifics** are SQLite-specific pragmas; Postgres's MVCC
  gives the same isolation guarantee `withTransaction()` relies on by
  default.

This is disclosed here and in `docs/FINAL_REPORT.md` rather than presented
as "the same as production."
