# PrepVista API — Part 1 + Part 2

Real backend for PrepVista: multi-tenant institution/student data (Part
1) plus Companies, Drives, Applications, Interviews, and Offers (Part
2) — a full placement funnel from eligibility through joining, backed
by PostgreSQL throughout.

**Status:** every command below was actually run against a real
PostgreSQL 16 database while building this. **56/56 tests pass**
(36 from Part 1, 20 new for Part 2). See `LIMITATIONS.md` for exactly
what is and isn't covered.

## What's in Part 1 (foundation)

- Multi-tenant data model: Institution → Campus/Department → Program → Batch, plus PlacementSeason
- Auth: JWT-based login, 5 roles, tenant isolation enforced at the query layer
- Student master, academic records, professional profile, skills, documents
- The student **import workflow**: upload XLSX/CSV → column mapping → validation → duplicate detection → transactional commit
- Student list/search/filter, Student 360, activity timeline, data quality scoring
- `ReadinessService` interface — real contract, returns null until a real assessment module writes to it

## What's new in Part 2 (placement funnel)

- **Companies**: recruiter CRM with pipeline stage (Prospect → ... → Repeat Recruiter) and HR contacts
- **Drives**: eligibility criteria (min CGPA / max backlogs / departments) stored as real, queryable columns — not a JSON blob
- **The eligibility engine**: `POST /drives/eligibility-check` runs a real indexed SQL query against actual `AcademicRecord` rows and returns eligible/not-eligible counts with a reason breakdown (CGPA fail / backlog fail / department fail) — draft a drive's criteria and see the real numbers before publishing it
- **Applications**: one row per (student, drive), with a validated stage state machine (`APPLIED → SHORTLISTED → INTERVIEWING → SELECTED`, plus `REJECTED`/`WITHDRAWN`) — invalid jumps (e.g. `APPLIED` straight to `SELECTED`) are rejected with a 409
- **Interviews**: round definitions per drive + a schedule table with status/result/feedback per application
- **Offers**: reaching `SELECTED` automatically materializes an Offer. Accepting it, then confirming joining, is what flips the student's `placement_status` to `PLACED` — verified end-to-end in `tests/test_funnel.py`, the single most important cross-module integration in this codebase
- **Dashboard now reports real placement metrics** (`active_drives`, `total_applications`, `total_offers`, `placement_percentage`, `companies_engaged`) — Part 1 explicitly withheld these because there was no real data; Part 2 computes them for real, proven by tests that create real Drive/Application/Offer rows and check the numbers respond

## What's explicitly NOT built yet

Communication (notifications/email/SMS), advanced Reports beyond raw
data, a recruiter-facing portal, an AI assistant wired to this backend,
and forecasting. See `docs/ARCHITECTURE.md` for how the data model is
already shaped to add these without reworking what's here.

Also still out of scope, unchanged from Part 1: real S3 storage (local
filesystem behind the same interface), async import for very large
files (synchronous is correct at current scale), Docker (written to
standard patterns, not executed in this sandbox — every command inside
it was verified working directly), and frontend integration (backend
only; the existing static HTML frontend doesn't call this API yet).

## Quick start (local, no Docker)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Create the database + a dedicated app user
sudo -u postgres psql -c "CREATE USER prepvista WITH PASSWORD 'prepvista_dev_pw' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE prepvista_dev OWNER prepvista;"

# 3. Configure environment
cp .env.example .env
# edit .env: set DATABASE_URL and JWT_SECRET_KEY at minimum

# 4. Run migrations (applies both Part 1 and Part 2 in order)
python -m alembic upgrade head

# 5. Seed demo data (refuses to run if ENVIRONMENT=production)
python scripts/seed.py
# creates: institution DEMO-LIT, 4 departments/programs/batches,
# 3 users (password DemoPass123!), 6 demo students with academic
# records, 1 company, 1 active drive with 3 interview rounds

# 6. Start the API
uvicorn app.main:app --reload --port 8000
# -> http://localhost:8000/docs for interactive OpenAPI docs
```

## Quick start (Docker)

```bash
docker compose up --build
docker compose exec api python scripts/seed.py
```

**Note:** written but not executed in the sandbox this was built in
(no Docker there) — see `LIMITATIONS.md`.

## Running tests

```bash
sudo -u postgres psql -c "CREATE DATABASE prepvista_test OWNER prepvista;"
DATABASE_URL="postgresql+psycopg://prepvista:prepvista_dev_pw@localhost:5432/prepvista_test" python -m alembic upgrade head

pytest tests/ -v
```

## Try the eligibility engine + funnel (Part 2's centerpiece)

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tpo.head@demo-lit.edu","password":"DemoPass123!"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")

# Preview eligibility for a hypothetical drive before creating it
curl -s -X POST http://localhost:8000/drives/eligibility-check \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"min_cgpa": 7.5, "max_backlogs": 0}'

# See the seeded drive's real funnel
DRIVE_ID=$(curl -s http://localhost:8000/drives -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys;print(json.load(sys.stdin)['items'][0]['id'])")
curl -s http://localhost:8000/drives/$DRIVE_ID/funnel -H "Authorization: Bearer $TOKEN"
```

Full request/response shapes: `docs/API.md`, or `/docs` on a running server.

## Project layout

```
app/
  models/          institution, user, student, import_batch, company,
                     drive, application, offer, activity, audit, readiness
  schemas/          Pydantic request/response shapes
  services/          import_service, funnel_service (eligibility + stage
                       transitions + offer/placement sync), readiness,
                       audit, activity, data_quality, storage, rate_limit
  routers/            auth, institutions, students, academic, profile,
                         skills, activity, imports, data_quality,
                         companies, drives, applications, interviews,
                         offers, dashboard
alembic/versions/        2 migrations (Part 1 initial schema, Part 2 funnel)
tests/                     56 tests across 11 files
scripts/seed.py             Dev-only seed data (Part 1 + Part 2)
docs/                        Architecture, schema, API, security notes
```

## Default login (after seeding)

| Email | Role | Password |
|---|---|---|
| tpo.head@demo-lit.edu | TPO_HEAD | DemoPass123! |
| placement.officer@demo-lit.edu | PLACEMENT_OFFICER | DemoPass123! |
| faculty.cse@demo-lit.edu | FACULTY | DemoPass123! |

Demo data only — never seeds in an environment with `ENVIRONMENT=production`.

