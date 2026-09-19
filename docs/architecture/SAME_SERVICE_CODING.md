# Coding on the existing PrepVista database and backend

Coding uses the existing Supabase identity and `DATABASE_URL`. All coding,
artifact, mission, review and readiness APIs are registered on the same FastAPI
application. Drafts, artifacts, evidence, snapshots and mentor usage records live
in additive tables in the same PostgreSQL database. No second Supabase project,
CodeForge database, login, backend URL, or Redis instance is required.

The evidence processor now starts inside the backend after its database pool is
ready. It shares that pool, processes at most 10 events per tick, has a 20-second
tick deadline and waits 10 seconds between ticks. Failures do not stop interview
requests; committed events remain available for retries. Existing transaction
locks and uniqueness constraints support overlapping replicas. Shutdown cancels
the processor before closing the pool. No code submissions execute in this loop.
Capacity and queue freshness still depend on backend uptime and workload.

## Enable the integrated student experience

Keep the current database, Supabase, Groq and Redis environment values. After
reviewing/applying the schema and deploying the updated frontend and backend,
add these to the **existing backend service**:

```env
CODING_WORKSPACE_ENABLED=true
CODING_ALL_STUDENTS_ENABLED=true
CODING_SERVER_SYNC_ENABLED=true
CODING_GUEST_IMPORT_ENABLED=true
CODING_AI_ENABLED=true
CODING_AI_PROVIDER=groq
CODING_AI_MODEL=llama-3.1-8b-instant
UNIFIED_EVIDENCE_ENABLED=true
UNIFIED_EVIDENCE_IN_PROCESS_ENABLED=true
UNIFIED_READINESS_VISIBLE=true
PREPVISTA_DEBUG=false
```

The mentor uses the existing `GROQ_API_KEY`. No OpenAI or Gemini key is needed for
this configuration. Mentor request budgets remain separate from interview credit
counts: defaults are 10 requests per student per day, 1,000 across the service per
day and 10 concurrent service-wide requests. These are request limits, not a
guaranteed monetary spend cap. Choose limits appropriate to the existing account.

The student can switch between Interview and Coding, resume synced drafts, save
artifacts, obtain hints and view a common preparation list. Imported/browser test
results retain their declared authority; showing readiness does not certify it.

## Apply the additions to the same database

Do not create another database. Inspect the real migration ledger before applying
anything: migrations 036/037 supply interview dependencies; 038–042 add coding
and evidence/review storage. The reviewed migration tool requires 001–037 to
already match the baseline. It blocks on missing prerequisites or changed hashes.

Follow [the schema release runbook](UNIFIED_SCHEMA_RELEASE_RUNBOOK.md) to inspect,
back up, plan, apply and verify. Its explicit `UNIFIED_MIGRATION_DATABASE_URL` and
`UNIFIED_PREFLIGHT_DATABASE_URL` select the **same existing database** for those
administrative commands; they are not new application databases. Use an
administrative connection to that database where DDL permissions are required.
After the reviewed migration flow, set `DATABASE_MIGRATIONS_ON_STARTUP=false` so
web restarts do not apply unreviewed schema changes. Do not change that setting
until the required schema has been installed.

For an enabled-flags preflight, supply the above booleans and
`DATABASE_MIGRATIONS_ON_STARTUP=false` to the existing flag-plan JSON format; the
flag-plan file accepts boolean rollout controls, not provider names or secrets.
Verify `/coding/access` with a real signed-in account, save and reload a draft,
save an artifact and verify pending evidence is processed into a snapshot. Verify
another account cannot read that student's work and an existing interview still
finishes normally. Local tests do not replace those deployed checks.

## Execution and optional workflows

Practice checks already run in the browser's bounded QuickJS/WASM worker. They
need no additional hosted runner. Server-verified execution still requires the
isolated runner because untrusted code must not run on the credential-bearing
FastAPI/database host. It is not necessary for ordinary practice, saving, mentor
hints or advisory readiness. Reviewer access and institutional sharing retain
their explicit recipient/consent controls rather than becoming public.

The old standalone evidence command remains available for larger installations:
`python -m scripts.process_unified_evidence`. Set
`UNIFIED_EVIDENCE_IN_PROCESS_ENABLED=false` if moving processing out of the web
service. For explicit historical backfill, use its bounded `--once --backfill`
mode against the same database; normal backend startup does not scan all history.

This documents an implemented hosting option, not confirmation that the remote
database was migrated or that environment settings were applied.
