# Architecture

## Layers

```
Router (FastAPI)  ->  Service (business logic)  ->  Model (SQLAlchemy)  ->  PostgreSQL
       |                                                    ^
       v                                                    |
   Pydantic schema (request/response shape)          Alembic migrations
```

- **Routers** (`app/routers/`) own HTTP concerns only: parsing the
  request, calling one service function, shaping the response. No
  business logic lives here.
- **Services** (`app/services/`) own business logic and are the only
  layer that should be reused by future modules (e.g. a Drives module
  reusing `audit_service`, `activity_service`, `readiness_service`
  unchanged).
- **Models** are the persistence shape. Every tenant-scoped table
  carries `institution_id`; placement-sensitive ones also carry
  `season_id`.
- Every write path uses **`db.flush()` inside the service, `db.commit()`
  in the router** — this is what makes `import_service.commit_import`
  genuinely transactional: every row processed shares one open
  transaction, and if anything raises, the router's `except` block
  rolls back before re-raising. Nothing is committed until the whole
  batch succeeds.

## Multi-tenancy

`institution_id` is never taken from the request body or query string
for scoping — it comes from `get_tenant_institution_id()` in
`app/deps.py`, which reads it off the authenticated user's own row.
A malicious or buggy client cannot pass a different `institution_id`
to read another tenant's data; there's no code path that would honor
it. This is enforced identically in every router (see
`tests/test_tenant_isolation.py` for three independent proofs of this).

## Why the import workflow parses once and reuses the parse

`import_service.create_preview()` parses the uploaded file with
pandas/openpyxl exactly once and stores the resulting rows as JSON on
the `ImportBatch` row (`report` column). `validate_import()` and
`commit_import()` both read from that stored copy. This guarantees:

1. What the TPO previewed is exactly what gets committed — no risk of
   the underlying file changing between steps.
2. Validation and commit can never disagree about row counts, because
   they're iterating the identical data.
3. Re-running `commit_import()` twice on the same batch is caught
   (`status != VALIDATED` after the first commit) rather than silently
   double-importing.

## How later modules (Drives, Offers, ...) plug in without rewrites

- `ActivityEvent` is already generic (`entity_type` + `entity_id` +
  `event_type`), so a Drive module emits `activity_service.emit(...,
  entity_type="drive", ...)` with zero schema changes.
- `AuditRecord` is the same shape for any entity type.
- `ReadinessService`'s read contract (`get_student_readiness`,
  `get_cohort_readiness`, `get_department_readiness`) is what a future
  Analytics/Command-Centre layer calls; a future assessment engine just
  needs to *write* `ReadinessSnapshot` rows, and every existing reader
  starts returning real numbers with no code changes on the read side.
- `Student.placement_status` is deliberately a small, permanent enum
  (SEEKING/PLACED/...) — NOT overloaded with application-stage values
  (applied/shortlisted/interviewed/...). Those stage values belong to a
  future `Application` model with its own `student_id` foreign key;
  they must never be crammed into the student's own status field.

## Storage abstraction

`StorageService` (`app/services/storage_service.py`) is an `ABC` with
`save`/`read`/`delete`. `LocalFilesystemStorage` is the only concrete
implementation shipped. No router or service constructs a filesystem
path directly — everything goes through `get_storage_service()`. An S3
implementation is a new class satisfying the same three methods, swapped
in via `settings.storage_backend`.

## The funnel: Application → Offer → Student.placement_status

This is Part 2's central design decision, worth spelling out.

- `Application` (one row per student-drive pair) holds a `stage` enum
  enforced by an explicit transition table (`_VALID_TRANSITIONS` in
  `funnel_service.py`) — you cannot PATCH an application straight from
  `APPLIED` to `SELECTED`; the API returns 409. This is what "never
  silently accept an impossible state" looks like in practice.
- Reaching `SELECTED` is the one stage transition with a side effect:
  `transition_application_stage()` materializes an `Offer` row in the
  same transaction. An application can have at most one Offer.
- `Offer.status` moves `EXTENDED → ACCEPTED → JOINED` (or `DECLINED` /
  `WITHDRAWN`). Accepting an offer does **not** place the student —
  `Student.placement_status` stays `SEEKING` through `ACCEPTED`.
- The *only* thing that flips `Student.placement_status` to `PLACED` is
  confirming joining (`PATCH /offers/{id}` with `joining_confirmed:
  true`, which also auto-sets `status: JOINED`). This mirrors Part 1's
  own principle #8 taken seriously: a student's permanent status
  changes only on a real, final, unambiguous event — not on an
  intermediate funnel stage.
- This whole chain is covered by one test
  (`test_full_funnel_apply_through_joining_updates_student_placement_status`)
  that asserts on the real `Student` row after every step, not just
  the API response — so it can't pass on a response schema that looks
  right while the underlying data is wrong.

## The eligibility engine

`funnel_service.compute_eligibility()` and `get_eligible_student_ids()`
both read `AcademicRecord.cumulative_cgpa` / `backlog_count` via a
`DISTINCT ON`-style "latest record per student" subquery, then filter
in a single pass. Two consequences worth knowing:
- A student with **no** academic record on file is never counted as
  eligible, regardless of criteria — absence of data is not treated as
  a passing grade (tested explicitly).
- `Drive.min_cgpa` / `max_backlogs` / `eligible_department_ids` are
  real columns on the `drives` table (an `ARRAY(UUID)` for
  departments), not a JSON blob — so `GET /drives/{id}/eligible-students`
  can be recomputed live at any time as academic records change,
  without re-parsing anything.

## Request lifecycle for a typical write (e.g. `PATCH /students/{id}`)

1. `get_current_user` decodes the JWT, loads the real `User` row.
2. `get_tenant_institution_id` reads `institution_id` off that user.
3. Router loads the `Student` by id, double-checks
   `student.institution_id == tenant_id` (belt-and-suspenders on top of
   every list/query already being tenant-filtered).
4. Service applies the change, recomputes derived fields
   (`profile_completion_pct`), flushes.
5. `activity_service.emit()` + `audit_service.record()` both write in
   the same transaction as the actual change — an audit entry can never
   exist for a change that didn't happen, or vice versa.
6. Router commits.
