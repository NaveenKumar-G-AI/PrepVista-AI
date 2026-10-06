# PrepVista Old-Push College Production Batch 0

Date: 2026-10-04 (Asia/Calcutta)

Decision: **A — Batch 0 qualified for Batch 1**. Runtime containment is complete,
and the final backend suite passes **437 tests with zero failures**. Local git
history proves the remaining migration-025 test retained an obsolete path and
repair-script assumption after deliberate consolidation into migration 036.
The test now validates the authentic current contract. This qualifies local
Batch 0 work; the production release blockers below still apply. Do not deploy.

Workspace: `G:\PrepVista-Old-Push`; branch `main`; HEAD remains
`24649a003336255b3d2830d9e3b9b8447bbf6cad`.

No production connection, database/schema changes, migration changes, deployment,
or access to `C:\PrepVista-AI` occurred. No commit or push was made. The pre-existing
untracked `check_db.py` and `check_db_insert.py` were left untouched and not run.

## Corrections and destructive retention callers

The active deployment entry point is `app.main:app`, as confirmed by Dockerfile,
Render configuration and README. Source searches covered delete, prune,
retention, history/plan limits, finished sessions and cleanup, plus SQL
migrations and separate legacy code. Callers were traced from their actual
definitions rather than assumed filenames.

| Path | Previous behavior | Batch 0 result |
| --- | --- | --- |
| `app/services/history_retention.py::enforce_history_retention` | Selected finished sessions beyond Pro 5 / Career 15, then deleted them with `DELETE FROM interview_sessions ... ANY(...)`. Foreign-key cascades could remove evaluations, messages, reports, audio metadata and assistance records. | Destructive implementation removed. Compatibility function returns zero without querying or writing. |
| `app/services/interviewer_session.py::finish_session` | Called retention after finalization and plan synchronization. Reached by explicit finish and answer-driven completion, through the interviewer barrel; termination uses the same finish service. | Retention import and call removed. Finalization updates its current session and preserves historical sessions. |
| `app/routers/dashboard.py::get_session_history` | Called retention during GET `/dashboard/sessions`. | Retention import and call removed. A read-only finished-session window is applied before pagination. |
| `app/routers/dashboard.py::get_dashboard` | Did not itself prune, but returned up to ten sessions without a Pro five-session window. | Dashboard previews use the same visibility window; ordinary aggregate statistics remain based on preserved history. |
| Plan synchronization / entitlement expiry | Changed entitlement/profile access state; deletion happened indirectly when the next history/finalization caller invoked retention. | Plan-state writes remain; there is no retention callback. Downgrades hide records, upgrades expose preserved records. |
| `app/services/quota.py::enforce_quota` → `_archive_old_support_messages` | Quota-period reset at interview setup scheduled physical deletion of the user's support messages older than 90 days. | Additional immediate data-loss path removed, including cleanup function, task scheduling and redundant period-comparison reads. Counter reset remains. |

There were **two active callers** of the destructive plan-retention function.
Both are corrected. No other application background/startup/plan-change caller
of that function was found. Post-patch search finds only the harmless
compatibility definition and its preservation test.

## History visibility/access contract

The current highest active entitlement (`UserProfile.effective_plan`) governs
access, preserving the existing entitlement model.

| Current access | Finished history available |
| --- | --- |
| Free / expired paid plan | Latest finished report for current feedback; history list stays locked and empty. |
| Pro | Latest five finished sessions. |
| Career / college entitlement | Latest fifteen finished sessions. |
| Existing premium admin override | Unlimited stored finished history, with normal page-size limits. |

Ordering is `COALESCE(finished_at, created_at) DESC NULLS LAST`, then
`created_at DESC NULLS LAST`, then `id DESC`. The UUID tie-breaker makes tied
timestamps deterministic. Pagination is applied **after** the visibility
window, so offsets cannot retrieve hidden history. History listings contain
finished sessions; paid dashboard previews may also include non-finished
sessions and retain their existing ten-row preview cap.

Owner queries execute before window checks. A visible owner session follows the
normal report path. A hidden owner session returns HTTP 403 with
`error=session_history_locked` and `lock_reason=history_limit`. A non-owner or
absent session returns the existing HTTP 404 response without revealing
existence. The guard applies to report JSON, PDF, share-link creation and
finished-session assistance summaries. No historical record is deleted or
rewritten to enforce these limits.

Existing explicitly shared public links retain their limited, consent-based
public response. They are a separate sharing contract, not authenticated owner
history access. No share tokens were revoked or changed by this batch.

## Startup migration containment and readiness

Previous path:

`lifespan` → background `_bootstrap_runtime_services` → `init_db_pool` →
`_run_migrations`.

That runner can create/alter `schema_migrations`, backfill checksums, apply
historical SQL, and execute migration data operations. A connection-success
check alone did not attest application schema compatibility.

Corrected path:

`lifespan` → `_bootstrap_runtime_services` → `init_db_pool` **opens a pool only**
→ `check_schema_readiness` **reads contracts only** → mark ready and start
DB-backed background services.

There is no startup migration switch that can accidentally enable execution:
the runtime call was removed unconditionally. The historical migration runner
and all SQL remain intact. A separate explicit admin/release entry point is
available as `python -m app.database.migrate --execute`. It was **not executed**;
tests replace its connection and runner with mocks. Its flag is required, and
it is never imported by application startup. Historical migration ambiguity
must be resolved before any real use of this operation.

Readiness uses a read-only transaction to:

1. Verify the applied migration versions/checksums exactly match this release's
   38-file manifest. Missing versions, unknown versions, NULL checksums and
   checksum drift fail closed. No automatic baseline adoption occurs.
2. Check required table/column types for core profiles, sessions, transcript,
   evaluation, entitlement, skill/usage, audio and assistance contracts.
3. Run zero-row SELECT projections under the runtime role to check required
   read privileges without fetching historical user records.

Bootstrap does not start its DB-backed activity/report-schedule jobs until
these checks succeed. `/health/ready` rechecks contracts and returns 503 on
incompatibility, missing schema, connection failure or denied reads. Its public
payload does not disclose raw schema/checksum errors. It never migrates to
make readiness pass. `/`, `/health`, and `/health/awake` remain lightweight
HTTP-200 liveness checks independent of database initialization.

This deliberately rejects unverified historical ledgers. A compatible deployed
database, full write privileges/least-privilege role, triggers, constraints,
cron state and external storage lifecycle remain unattested; this batch does
not claim to prove them through mocked readiness tests.

## Guided Assistance

Hint generation, answer guidance, retry/idempotency, persisted events, viewed
timestamps and answer attribution remain in place. No schema redesign occurred.

The assistance summary previously ordered events by `created_at`, which is
absent from checked-in migration 036. It now uses `requested_at, id`, both
present in the existing schema. Its lookup now also checks authenticated
ownership and applies history access to finished sessions. Active-session
hint/guidance/retry paths remain available.

New tests execute actual hint/guidance endpoints, verify retry returns the same
stored event without calling the provider again, mark events viewed, load the
summary and verify user/question attribution. Actual answer submission derives
`hint_assisted`, `answer_guided` and `independent` correctly, including the
strict-before timestamp boundary and precedence of answer guidance.

## Validation

Focused command:

```text
python -m pytest tests/test_batch0_history_safety.py tests/test_batch0_startup_safety.py tests/test_guided_assistance.py tests/test_interview_logic.py tests/test_production_contract.py tests/test_migration_safety.py tests/test_hardening_regression.py -q --tb=short
```

Result: **196 passed**, two existing dependency warnings.

New Batch 0 coverage: **36 cases**, proving finalization/dashboard/history
preservation (including answers, transcripts, persisted reports, audio metadata,
assistance events and support messages), downgrade/upgrade preservation,
pagination and plan limits, tied timestamps, admin override, owner/non-owner
access, startup/lifespan containment, independent liveness, compatible and
incompatible readiness, explicit migration invocation, guided retries and
actual answer attribution.

History tests execute the actual SQL against in-memory SQLite with narrow
PostgreSQL syntax adaptations. External providers and unrelated services are
stubbed. Readiness/pool/admin-operation tests use mocks. This is offline backend
regression validation, not a PostgreSQL or production integration attestation.
The unit suite blocks outbound sockets/DNS; Windows asyncio's exact internal
stdlib socketpair caller is permitted for its local wake-up mechanism.

Broader command:

```text
python -m pytest tests -q --tb=short
```

Initial result: **433 passed, 1 failed**. Final blocker-resolution result:
**437 passed, 0 failed**, two existing dependency warnings. Four current-contract
checks replace the one stale test; no test was skipped or marked expected-fail.
The historical migration files remain intact. The local-history evidence and
the limits of the old constraint-repair assumption are documented below.

An initial focused run also found an existing BOM assertion failure for 036.
`tests/test_migration_safety.py` now checks the repository SQL as read by the
existing BOM-aware migration reader, rather than demanding modification of
historical file bytes. The separate synthetic-BOM reader test remains. Migration
036, including its BOM, is untouched.

`git diff --check`: **PASS**. Complete tracked diff and new source/test files were
reviewed. All 38 historical SQL contents match HEAD (comparison accounts for
existing Git/Windows line-ending normalization); no migration paths appear in
the diff. The branch and reference HEAD are unchanged.

## Final blocker forensic review: migration 025 / Guided Assistance

Root cause: **STALE TEST following deliberate contract consolidation**. The old
migration really existed in this same repository lineage; its current absence
is an intentional deletion in a consolidation commit, not an unexplained
missing artifact. The test was left byte-for-byte unchanged since introduction.

Only `tests/test_migration_025.py` and this report changed during final blocker
resolution. The original Batch 0 runtime patches were preserved. SHA-256
comparison before/after the forensic task verifies all 175 application Python
and migration SQL files, including all 38 SQL files, are byte-for-byte unchanged.

### Original test assumptions

The original test resolved `Path(__file__).resolve().parents[1] / "migrations"`
and read `025_guided_assistance_fixes.sql`, resulting in the absent path
`G:\PrepVista-Old-Push\migrations\025_guided_assistance_fixes.sql`.

Its comments described four steps: add a question-instance ID, drop an old
constraint, create partial uniqueness, and add an evaluation question-instance
ID. It asserted these literal SQL fragments:

```sql
ADD COLUMN IF NOT EXISTS question_instance_id UUID;
DROP CONSTRAINT IF EXISTS interview_assistance_event_session_id_turn_number_a_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistance_event_instance_idempotent
WHERE question_instance_id IS NOT NULL;
ADD COLUMN IF NOT EXISTS question_instance_id UUID;
```

The first and last assertions were identical and did not scope the column to
either table. The test did not check the unique index's columns or provenance.
It explicitly assumed a repair of pre-existing Guided Assistance tables.
Neither its root migration directory nor its 025 identity matches the current
runner manifest, where 025 is recruiter companies.

### Local git evidence

The repository is not shallow. Searches used local `git log --all --name-status`,
`git log -S`, `git log -G`, `git show`, follow-history and ancestor checks. No
fetch or other network operation occurred.

| Commit | Evidence |
| --- | --- |
| `a73a818f6c2cf6a6e118a1fcee97d2eda1fe96fa` | Introduced root `migrations/024_guided_assistance.sql`: assistance policy/events, provenance column, and `UNIQUE (session_id, turn_number, assistance_type, assistance_level)`. |
| `a9070c3f270238e35a05281af294da0edf9f3b15` | Added root `migrations/025_guided_assistance_fixes.sql` and the failing test together. The real historical file adds both instance-ID columns, attempts the named legacy-constraint drop and adds the partial instance index. This commit is an ancestor of HEAD. |
| `0a542c02932885132444a3fd452cf230bb377328` | Added root `migrations/026_add_assistance_provenance.sql`. |
| `2dc8ea12f4e1bf5b357fc1970226d78224140294` | Explicitly titled “move guided assistance migrations to correct directory app/database/migrations as 036”. Renamed/reworked old 024 as current 036, deleted root 025/026, added the event instance column inline, omitted old turn uniqueness, included the new partial index and evaluation columns. Did not update the test. This commit is an ancestor of HEAD. |
| `3ebccddfd06fc5f916ac27e3980d2b7d7c699ea4` | Earlier introduction of `app/database/migrations/025_recruiter_companies.sql`, confirming 025 was already occupied in the actual runner directory. |

At the time of the old test, `app/database/connection.py` already discovered
SQL under `Path(__file__).parent / "migrations"`, namely
`app/database/migrations`, not the root folder. Local history contains no
equivalent legacy-constraint DROP in the current migration directory.

There is no evidence that the test was copied from another branch: its original
test and old migration were committed together on the current ancestry. The
numbering/directory change is directly visible in the consolidation diff.
The old artifact is recoverable from git for examination; it was not restored,
copied or executed.

Repository searches included tracked files, untracked/ignored text, docs,
tests, scripts, legacy sources and other migration directories. The small
checked-in ZIP was inspected without extraction; it contains directory entries
only and no alternative migration. No migration generator was executed.

### Contract comparison and runtime dependency

| Expected requirement | Migration 036 / runtime evidence | Classification |
| --- | --- | --- |
| Root `025_guided_assistance_fixes.sql` identity | Deliberately replaced by `app/database/migrations/036_guided_assistance.sql`; 025 in that directory is recruiter CRM. | OBSOLETE |
| Add nullable `interview_assistance_event.question_instance_id UUID` via ALTER | 036 declares the nullable UUID inline in CREATE TABLE. Hint/guidance lookups, inserts and answer provenance filter on it. | SUPERSEDED statement; column REQUIRED_BY_CURRENT_RUNTIME |
| Drop `interview_assistance_event_session_id_turn_number_a_key` | 036 does not issue that DROP. Its event CREATE TABLE omits the old per-turn unique constraint. Current upserts require per-instance uniqueness instead. | OBSOLETE for the schema created by the authentic runner; UNKNOWN need on manually initialized legacy databases |
| Partial `idx_assistance_event_instance_idempotent` | 036 creates uniqueness on `(session_id, question_instance_id, assistance_type, assistance_level)` with `WHERE question_instance_id IS NOT NULL`. Both current hint/guidance INSERTs use that exact ON CONFLICT key and predicate. | REQUIRED_BY_CURRENT_RUNTIME; present |
| `question_evaluations.question_instance_id UUID` | 036 adds it via ALTER TABLE. Evaluated and unevaluated answer writes persist the instance ID. | REQUIRED_BY_CURRENT_RUNTIME; present |

Additional authentic 036 contract: policy uniqueness by session, disabled-by-
default assistance flags, request-ID uniqueness, hint/guidance type validation,
requested/generated/viewed timestamps, `used_before_answer`, `invalidated`,
and evaluation `assistance_provenance TEXT DEFAULT 'unknown'`. The current
runtime uses these for policy, retry and attribution. No assistance-specific
trigger/function definition is expected by the original test or required by
these current upserts.

**Important boundary:** 036 is consistent with the current runtime when its
declared schema is created. It is **not equivalent** to the old ALTER/DROP repair
for a database manually initialized from legacy root migration 024. CREATE
TABLE IF NOT EXISTS would not add the inline instance column to an existing
table and would not remove an existing per-turn unique constraint. If such a
database exists, it requires separate schema/constraint attestation and a
reviewed upgrade decision. This task provides no evidence of deployed legacy
state, and does not claim to repair it. Readiness's column/ledger checks also
do not attest the absence of every legacy uniqueness constraint.

Thus the runtime still needs the **behavioral** parts of the old test (instance
IDs and partial uniqueness), now present in 036. It does not depend on the old
filename or on executing the old named DROP when using the current declared
schema. No missing historical dependency needs to be fabricated for the
repository test suite.

### Correction and final checks

The test filename remains `tests/test_migration_025.py` for continuity. Its four
tests now check migration identity and tables, policy uniqueness/flags, exact
partial index semantics against both actual runtime upsert SQL constants, and
table-scoped evaluation/view attribution. SQL comments cannot satisfy the
assertions. The nullable event column and absence of old turn uniqueness are
checked in the declaration. No SQL executes in these tests; no DB is opened.

Commands were run in the requested order:

| Command | Result |
| --- | --- |
| `python -m pytest tests/test_migration_025.py -v` | 4 passed |
| `python -m pytest tests/test_guided_assistance.py -v` | 5 passed |
| `python -m pytest tests/test_migration_safety.py -v` | 10 passed |
| `python -m pytest tests -q --tb=short` | 437 passed; 0 failures; two existing dependency warnings |
| `git diff --check` | PASS |

The full suite includes the existing isolated in-memory test fixtures; no
PostgreSQL or production database was contacted, and no migration was executed.
Candidate artifacts: unchanged/N/A. `C:\PrepVista-AI`: not modified or accessed.
Batch 0 runtime containment: intact. Batch 0 qualified: YES. Ready for Batch 1:
YES. Deployment: NO.

## Remaining destructive paths and release blockers

Five additional automatic destructive paths were identified beyond active plan
history pruning: **one active Python path fixed**, **one dormant legacy path**,
and **three historical database-job definitions**. The count excludes explicit
user/admin deletion, ephemeral verification cleanup and derived recomputation.

| Remaining path | Scope / disposition |
| --- | --- |
| `legacy/main.py::cleanup_stale_sessions`, scheduled by legacy `/setup` | Deletes SQLite sessions older than 24 hours. Separate legacy app, absent from the active `app.main:app` deployment/import path; unchanged. Do not use this entry point for college production. |
| Migration 005 `refresh-activity-stats` cron | Deletes `user_activity_events` older than 24 hours. Historical SQL unchanged; existence of an already-installed job is unknown. |
| Migration 010 `purge-usage-events` cron | Deletes soft-deleted usage events older than 730 days. Historical SQL unchanged; deployed job state unknown. |
| Migration 010 `purge-billing-events` cron | Deletes soft-deleted, pseudonymised billing events older than 2555 days. Historical SQL unchanged; deployed job state unknown. |
| Migration 020 evaluation de-duplication | Explicit migration SQL deletes duplicate question evaluations. No longer reachable through normal startup. Requires historical-data review before any admin execution. |
| Migration 005 partition conversion; migration 007 archive erasure | Explicit historical operations, including empty-table replacement and privacy erasure of archive rows. Preserved; no application-start execution. |
| Dashboard single/bulk session deletion | Genuine user-requested privacy actions with owner-filtered queries; retained separately from plan/history reads. |
| Account deletion | Explicit user erasure cascades from profiles; external-auth-first ordering remains unchanged, as instructed. Separate release blocker. |
| Admin organization/configuration deletion and launch-offer reset | Explicit administrative operations; not invoked by ordinary history/finalization/startup. Unchanged. |
| `analytics_student.sync_session_skill_scores` | Recomputes derived skill rows for the same session inside an existing transaction. It does not prune sessions/answers/reports; retained. |
| Signup verification codes, signup-failure auth rollback, failed payment reservations | Ephemeral credential/creation rollback paths; retained. They are not plan retention or deletion of interview history. |
| Derived placement outcomes | Offer-management recomputation scoped to `source='DERIVED'`; outside ordinary student interview/history flow and unchanged. |
| External audio-storage lifecycle | Source documentation calls for a Supabase lifecycle/cron policy; the application itself does not delete audio. Actual external configuration is unknown. |

Release blockers:

- Before release, attest whether any deployed database was manually initialized
  from legacy root assistance migrations. If so, review its upgrade/constraint
  contract separately. The stale repository test is resolved; no migration was
  added or modified.
- Attest deployed migration ledger/checksums and required schema; readiness
  intentionally stays unavailable for unverified or incompatible contracts.
- Attest existing database cron jobs, triggers and external storage lifecycles
  before claiming whole-production data preservation.
- Attest production runtime role/database permissions and direct writers.
- Review account-deletion ordering in its own batch.
- Run isolated PostgreSQL/schema integration and operational checks before
  any release. No such production or external connectivity was performed here.

Ready for Old-Push Batch 1: **YES**. The broader-suite blocker is resolved by
local-history evidence and the corrected test. Production release remains
subject to the attestation and review items above. No deployment.

## Files changed (16)

- `app/database/connection.py`
- `app/database/readiness.py` (new)
- `app/database/migrate.py` (new)
- `app/main.py`
- `app/routers/dashboard.py`
- `app/routers/reports.py`
- `app/routers/interviews_assistance.py`
- `app/services/history_retention.py`
- `app/services/interviewer_session.py`
- `app/services/quota.py`
- `tests/conftest.py`
- `tests/test_migration_025.py` (final blocker resolution)
- `tests/test_migration_safety.py`
- `tests/test_batch0_history_safety.py` (new)
- `tests/test_batch0_startup_safety.py` (new)
- `PREPVISTA_OLD_PUSH_COLLEGE_PRODUCTION_BATCH0_REPORT.md` (new)

## Files inspected (81)

Count: 43 focused code/config/test files below, plus all 38 SQL migrations in
`app/database/migrations/`. The report itself and wider search-only hits are
excluded from the inspection count.

```text
app/main.py
app/config.py
app/dependencies.py
app/database/connection.py
app/database/readiness.py
app/database/migrate.py
app/services/history_retention.py
app/services/interviewer_session.py
app/services/plan_access.py
app/services/quota.py
app/services/analytics_student.py
app/services/user_activity.py
app/services/audio_storage.py
app/services/launch_offer.py
app/services/razorpay_service.py
app/services/interview_summary.py
app/services/manual_signup_verification.py
app/routers/dashboard.py
app/routers/reports.py
app/routers/interviews.py
app/routers/interviews_session.py
app/routers/interviews_assistance.py
app/routers/interviews_answer.py
app/routers/interviews_helpers.py
app/routers/interviews_schemas.py
app/routers/account.py
app/routers/auth.py
app/routers/offers.py
tests/conftest.py
tests/test_production_contract.py
tests/test_migration_safety.py
tests/test_guided_assistance.py
tests/test_hardening_regression.py
tests/test_migration_025.py
tests/test_batch0_history_safety.py
tests/test_batch0_startup_safety.py
requirements.txt
requirements-dev.txt
pytest.ini
Dockerfile
render.yaml
README.md
legacy/main.py
```

Migration manifest inspected/read without execution:

```text
001_initial_schema.sql
002_profile_referral.sql
003_interview_runtime.sql
004_free_evaluation.sql
005_user_activity.sql
006_plan_lifecycle.sql
007_account_archive.sql
008_public_growth.sql
009_launch_offer.sql
010_cascade_fixes.sql
011_revenue_analytics.sql
012_admin_bonus.sql
013_email_verification.sql
014_support_chat.sql
015_report_sharing.sql
016_interview_types.sql
017_college_organization.sql
018_performance_indexes.sql
019_answer_quality_flags.sql
020_question_evaluations_unique_turn.sql
021_transcript_repair_audit.sql
022_placement_calibration.sql
023_audio_audit_trail.sql
024_college_placement_config.sql
025_recruiter_companies.sql
026_placement_drives.sql
027_placement_interviews.sql
028_offers_joining_placement.sql
029_training_readiness.sql
030_org_communications.sql
031_training_and_drive_integrity.sql
032_placement_seasons.sql
033_reconcile_org_student_integrity.sql
034_fix_trigger_session_finished_sync.sql
034_payment_order_idempotency.sql
035_org_report_schedules.sql
036_guided_assistance.sql
037_resume_fingerprint.sql
```

STOP. DO NOT DEPLOY.
