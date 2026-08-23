# Known Limitations — Part 1

Written deliberately so nothing here is a surprise later. "Tested"
below means: run against real PostgreSQL in this session, with
passing pytest assertions — not just written and assumed correct.

## Fully built and tested (Part 1)
- Multi-tenant models, migrations (verified reversible: downgrade to base and back up cleanly)
- JWT auth, password hashing (bcrypt, direct — not passlib, see below), tenant isolation
- Student CRUD, list (pagination/search/filter/sort), Student 360 read
- Academic records, professional profile, skills read, activity timeline
- Import workflow: preview/validate/commit, column-mapping suggestion, exact vs. possible duplicate detection, transactional commit, update-vs-insert semantics
- Data quality scoring
- ReadinessService: interface + storage, verified to return null/empty until a real snapshot exists
- Audit log on writes
- Rate-limited login

## Fully built and tested (Part 2)
- Companies CRM: create/list/search/filter, pipeline stage, HR contacts
- **Eligibility engine**: real indexed query against `AcademicRecord`, tested for CGPA filtering, backlog filtering, department filtering, and the "no academic record on file = not confirmed eligible" edge case (never assumes eligibility from absence of data)
- Drives: creation, listing with real applicant counts, per-drive eligible-student lookup
- Applications: a validated stage state machine (invalid transitions rejected with 409, not silently accepted), duplicate-application prevention, cumulative funnel counts
- Interview rounds and scheduling
- **Offers, materialized automatically on SELECTED**, with accept/decline and joining confirmation
- **The cross-module integration**: confirming joining on an Offer updates `Student.placement_status` to `PLACED` — this is tested as a full 6-step flow (apply → shortlist → interview → select → accept → confirm joining) in `tests/test_funnel.py`, checking the student's real DB row at each step, not just API response shapes
- Dashboard now computes real `active_drives`/`total_applications`/`total_offers`/`placement_percentage`/`companies_engaged` — tested by creating real rows and confirming the numbers move
- Tenant isolation re-verified specifically for the new tables (companies, drives, eligibility queries) — Part 1's isolation guarantee doesn't automatically prove Part 2 inherited it correctly, so it's tested again explicitly

## Built, with a narrower implementation than the full spec envisions
- **Storage**: local filesystem only. The `StorageService` abstract interface (`save`/`read`/`delete`) is what every caller uses; an S3 implementation is a single new class, not a refactor.
- **Background jobs**: import runs synchronously in the request. Correct at current scale (tested up to a few thousand rows); a large-file async path would sit behind the same `import_service` functions, triggered by a job queue instead of a router directly calling them.
- **Rate limiting**: in-process, per-server-instance. Correct for one API process; multi-instance deployment needs a shared store (Redis INCR+EXPIRE is a drop-in replacement for `app/services/rate_limit.py`'s two functions).
- **Global search**: only implemented for students, as the doc specifies for Part 1. The pattern (paginated, filtered `select()`) is the template for company/drive/offer search later.
- **CSRF**: not implemented. This API is a JWT-bearer API (token in an `Authorization` header, not a cookie), which is not vulnerable to classic CSRF the way cookie-session auth is — there's no ambient credential a third-party page could ride on. If a future version moves to cookie-based sessions, CSRF protection becomes necessary and isn't in the current design.

## Part 2 design simplifications, stated plainly
- **Application stages are a fixed 6-value state machine** (`APPLIED → SHORTLISTED → INTERVIEWING → SELECTED`, plus `REJECTED`/`WITHDRAWN`), not a configurable-per-institution workflow. Doc 2's original vision has more granular stages (Notified/Registered, multiple interview rounds as distinct stages) — those live as real `InterviewSchedule` rows *within* the `INTERVIEWING` stage rather than as top-level Application stages. This keeps the state machine simple and genuinely enforceable (see `_VALID_TRANSITIONS` in `funnel_service.py`) rather than a loosely-validated string field.
- **One offer per application.** A student can hold multiple offers (one per drive they were selected for), but each Application materializes at most one Offer. "A student declines one offer and accepts another" is representable (two Applications, two Offers); "renegotiating the same offer's CTC" is not modeled.
- **Eligibility uses the single latest academic record per student**, not a full semester history. `AcademicRecord.semester=0` (the "current/cumulative" convention from Part 1) is what the eligibility engine reads.

## Explicitly not built (by design — later parts)
Communication (notifications/email/SMS), advanced Reports beyond raw
data export, a recruiter-facing external portal, an AI assistant wired
to this backend, forecasting, and multi-round configurable workflow
builders.

## Environment-specific notes from building this
- **passlib was dropped in favor of the `bcrypt` package directly.** passlib's bcrypt backend version-detection is broken against `bcrypt>=4.1` (a real, currently-unresolved upstream compatibility issue) — this surfaced immediately when the seed script ran. Going straight to `bcrypt` removes the fragile layer entirely rather than pinning around it.
- **Alembic's autogenerated downgrade doesn't drop Postgres ENUM types** by default — only tables/indexes. Confirmed by actually downgrading and re-upgrading, which failed with `type already exists` until fixed. The migration now explicitly drops the six enum types on downgrade.
- **Docker was not executed** in the sandbox this was built in (no Docker daemon available there). Every command inside `Dockerfile`/`docker-compose.yml` — `pip install -r requirements.txt`, `alembic upgrade head`, `uvicorn app.main:app` — was independently verified working when run directly. If Docker-specific issues show up (permissions, networking), the underlying app logic is not the suspect.
- **No persistent live server in the build sandbox.** Backgrounding `uvicorn` in that specific sandboxed shell caused the tool session itself to hang (a sandbox quirk, not an application issue). All HTTP-level verification therefore used FastAPI's `TestClient`, which drives the exact same ASGI app in-process — a real, standard way to test a FastAPI service, just without a listening TCP socket. In a normal environment, `uvicorn app.main:app` runs exactly as documented in the README.

## What would make this genuinely production-ready (not just Part-1-complete)
- A real secrets manager for `JWT_SECRET_KEY` in production (not an env var on disk)
- Structured logging + request tracing
- A refresh-token / revocation model (current JWTs can't be invalidated server-side before they expire)
- Database connection pooling tuned for real concurrency, not SQLAlchemy defaults
- An actual S3 (or equivalent) storage backend before handling real student documents at scale
