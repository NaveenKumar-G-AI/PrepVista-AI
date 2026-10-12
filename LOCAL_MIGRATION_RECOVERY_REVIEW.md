# PrepVista local migration recovery review

Date: 2026-10-12. Workspace: `G:\PrepVista-Old-Push`.

**SAFE FOR LOCAL** — implementation and the qualification described below completed locally.

**READY FOR PRODUCTION REVIEW** — this is a review candidate, not permission to execute it.

**NOT YET APPROVED FOR PRODUCTION** — no production connection, mutation, bootstrap, deployment, commit, push, Render change, role change, or cron scheduling/activation was performed. The forbidden `C:\PrepVista-AI` tree was not used.

This statement describes this agent's local work. The user subsequently reported successful production application of 048a through 052. The earlier 049/050 failures and corrections below are historical records. The current follow-up is the new 053 metadata contract and its narrow endpoint compatibility fix. No additional production action is authorized by this report.

## 053 archive receipt forward fix

The latest user-supplied production schema has exactly six `old_user` columns, in order: nullable `full_name text`, non-null `email text`, non-null `id integer` with the existing `old_user_id_seq` default, nullable `original_user_id uuid`, nullable `user_id uuid`, and nullable `archived_at timestamptz DEFAULT now()`. There is no metadata column, and deployment readiness fails on `old_user.metadata`, expected `jsonb`, actual `missing`. Production was not contacted to obtain or modify these facts during this task.

`053_old_user_metadata_receipt.sql` is the only new migration. Within the runner-owned per-file transaction, with a five-second lock timeout, it fails if the table is absent, locks the table to serialize the catalog check with the addition, and inspects the exact non-dropped `metadata` attribute. If absent it adds nullable `jsonb` with no default. Existing JSONB is accepted unchanged; any other PostgreSQL type fails closed. It performs no row DML, backfill, receipt fabrication, sequence change, identity change, constraint change or cron operation. All 048a/049/050/051/052 files retain their previously reviewed checksums. Readiness and the worker are unchanged.

Final runner-compatibility correction: only the outer `BEGIN;` and `COMMIT;` lines were removed from 053. Both `SET LOCAL` statements and the entire DO block are unchanged. The migration runner owns the schema-and-ledger transaction. The approved `account.py` implementation is unchanged by this correction. The file count remains 55.

Application review found two endpoint assumptions requiring correction: `ON CONFLICT(email)` required a uniqueness constraint not established by this production shape, and legacy NULL metadata was promoted to an empty receipt container. The final narrow identity correction locks archive rows only with `WHERE user_id=$1 FOR UPDATE`; email never selects an archive. Multiple rows for that user or legacy NULL/missing/empty receipt containers return HTTP 409 and roll back the request/local deletion. Exactly one valid user archive receives the newly requested receipt while retaining prior receipts and other fields. With no matching user archive, a normal `INSERT ... RETURNING id` writes a fresh row with complete metadata. A shared email on a NULL-user or different-user historical archive does not block insertion or cause that archive to change. Unexpected database constraint failures propagate; there is no blanket conflict suppression. No email uniqueness constraint or fabricated legacy receipt is introduced. Migration 053 is unchanged by this identity correction.

The unchanged worker's JSONB extraction returns SQL NULL for legacy NULL metadata. Without exactly one valid request-specific receipt, it raises `OWNERSHIP_UNVERIFIED` and marks the request `FAILED` for manual review before any auth/storage provider call. New receipts retain the existing request/owner/target/completion validation. The unchanged readiness contract accepts nullable JSONB and still rejects a missing or incorrectly typed column; its release ledger check now naturally includes 053.

Qualification uses the exact six-column archive shape with synthetic pre-existing rows, including duplicate emails and no email uniqueness constraint. Tests verify NULL preservation, unchanged original columns/data/row versions/table storage/ACL/RLS/sequence state, no fabricated archive rows, unchanged empty cron catalog, real runtime-role readiness, existing JSONB acceptance, wrong-type and missing-table rollback without ledger insertion, new endpoint receipt creation and worker validation, and safe endpoint/worker handling of missing legacy receipts. This fixture completes other declared readiness contracts synthetically; it is not a full production schema replay.

Runner compatibility is also tested through a separate real `python -m app.database.migrate --execute --through 053_old_user_metadata_receipt` process against the guarded disposable PostgreSQL database. A test-only ledger trigger confirms that the column has been added inside the transaction, then rejects the ledger insert. After failure, an independent connection sees neither the new column nor a 053 ledger row, and legacy rows are unchanged. Removing the test trigger and retrying the same CLI commits both the nullable JSONB column and exactly one matching checksum row. A further CLI retry succeeds without adding another ledger row. No application or runner implementation was changed for this qualification.

## Exact repository changes

Modified:

| File | Change |
| --- | --- |
| `app/database/bootstrap.py` | Validate existing reviewed roles; remove URL-derived role/password DDL and automatic role creation/alteration; require LOGIN and reject dangerous inherited privileges; fail closed without pg_cron; log exception type. |
| `app/database/connection.py` | Optional full-filename cutoff, strict checksum validation including already-applied versions beyond the cutoff, remove the environment-based pg_cron SQL bypass, correct startup documentation. |
| `app/database/migrate.py` | Manual `--execute --through FULL_STEM` interface. |
| `app/database/migrations/049_backend_schema_access_hardening.sql` | Only the stale table/helper requirements described below change. |
| `app/database/migrations/050_cron_schema_reconciliation.sql` | Accept an empty cron catalog without provisioning jobs; reject incomplete nonempty baselines; protect unresolved deletion receipts; count completion events from `usage_events`; comment on the legacy entitlement `is_active` column only when it exists. |
| `app/database/migrations/051_pg_cron_runtime_reconciliation.sql` | Accept an empty cron catalog without provisioning jobs; fail before retention if the stats singleton is missing; check partition parent by OID and both exact bounds in the public schema. |
| `app/database/readiness.py` | Read-only release-ledger checksum validation plus required grant audit/journal column contracts. Extra production-only versions remain allowed. |
| `app/routers/account.py` | New receipts no longer require email uniqueness; legacy NULL/missing receipt containers fail safely for review instead of being fabricated. |
| `app/routers/admin_grants.py` | Locked grant transition, request fingerprint/idempotency, prospective journal, finite audit entries, purchase-preserving deactivation and selected-plan preservation. |
| `app/services/plan_access.py` | Allow grant transactions to suppress notification dispatch from uncommitted state. Other callers retain existing defaults. |
| `app/services/quota.py` | Matching sentinels return unlimited/None; enforcement handles None; all period normalization uses the profile lock and one expiration rule. |
| `frontend/src/app/admin/page.tsx` | Retain an ambiguous request's ID for retry, prevent synchronous double submit, explain grant/expiration/deactivation behavior. |
| `frontend/src/lib/api.ts` | Send the caller's required grant request ID. |
| `integration_tests/test_050_cron_schema_reconciliation.py` | Replace the missing/mock historical fixture with guarded real-pg_cron disposable tests. |
| `integration_tests/test_051_pg_cron_runtime_reconciliation.py` | Remove ambient DSN/network probing, hardcoded historic hashes and destructive existing-database tests; use the guarded disposable fixture. |
| `tests/conftest.py` | Clear ambient migration/qualification credentials and the old cron-bypass flag. |
| `tests/test_batch0_startup_safety.py` | Model a valid ledger and explicitly assert startup never calls the migration runner. |
| `tests/test_database_audit_regressions.py` | Supply the release ledger in read-only readiness fixtures. |
| `tests/test_rubric_compatibility.py` | Account for 55 migration files, including forward migration 053. |

Added:

| File | Purpose |
| --- | --- |
| `app/database/migrations/048a_current_schema_reconciliation.sql` | Restore/validate the three current declared tables. |
| `app/database/migrations/052_admin_grant_contract.sql` | Supported bonus domain, bonus index, prospective request journal. |
| `app/database/migrations/053_old_user_metadata_receipt.sql` | Add nullable JSONB receipt metadata without altering legacy archives; fail closed on missing table or wrong type. |
| `integration_tests/test_053_old_user_metadata_receipt.py` | Production archive shape, real readiness, row/sequence preservation and endpoint/worker receipt safety. |
| `tests/test_admin_grant_recovery.py` | Grant truth tables, boundaries, unlimited enforcement, cutoff/order/checksum/readiness/bootstrap guards. |
| `integration_tests/recovery_fixture.py` | Explicit loopback clusters with exact data-directory verification, random disposable databases and synthetic schema/data. |
| `integration_tests/test_recovery_schema_postgresql.py` | Real PostgreSQL reconciliation, drift, security, idempotency, concurrency, rollover and purchase-preservation tests. |
| `frontend/tests/admin-grants.test.mjs` | Execute the actual admin component offline to test retries and double submit. |
| `LOCAL_MIGRATION_RECOVERY_REVIEW.md` | This report and future execution/recovery proposal. |

Local test artifacts are under the existing ignored `.audit-runtime` directory: Python 3.11 dependencies, PostgreSQL 17 test cluster/log, the PostgreSQL 18 test disk image/mount directory, local cluster start/resume scripts and pytest temporary files. These are not application or migration deliverables. The draft migration generator was removed so it cannot regenerate an obsolete version. Both test servers were stopped after verifying zero remaining test databases; the disk image is unmounted.

## Migration order and checksums

The runner sorts `Path` objects by the **complete filename**, then records the complete stem and normalized SQL checksum. The test invokes that same sorting rule and checks adjacency:

```text
048_account_deletion_claim_leases
048a_current_schema_reconciliation
049_backend_schema_access_hardening
050_cron_schema_reconciliation
051_pg_cron_runtime_reconciliation
052_admin_grant_contract
053_old_user_metadata_receipt
```

The compatibility suffixes and both `034` files remain intact. No `042`–`046` files were invented. Extra ledger versions are preserved. All existing migrations through 048, including 012, are unchanged.

Checksums below use the runner's UTF-8-with-optional-BOM reader, universal newline normalization, then SHA-256 of the resulting UTF-8 text; they are not raw Windows CRLF file hashes.

| Migration | SHA-256 |
| --- | --- |
| 012, unchanged | `d5ad148a11952d96fad2268366ff4c65ec08bac7df04aebca52b0b423d626e10` |
| 048, unchanged | `989701781f7f0d59498ac50ed69af754de18db37c15ea6aea35e79963ea93f13` |
| **048a, new** | `75b3a678859b47341e1575eb219c3db0540a3a9ffec537fa230961c3b429118a` |
| **049, original** | `40b5d3476fdf105fd6204659a6c87f835a56304b64aed28260413eac4787cb09` |
| **049, prior local review** | `7b198c83ee25ee10fcdd99ed6a93a4d030547f643085be3d04fecce088f48105` |
| **049, final correction** | `81c89236b01bdf9a935693e1e89ad777825072984a0ea63bfb7ba3aaa2e8e2b1` |
| 050, old | `3625e313ca8c504ae7622ae574aa18375056ae36c1376249c6d4fa2d3a0a3db6` |
| 050, prior local review / failed production attempt | `75e037531cc9e5ffe72e5a0707f7bb23f8d56ef7188c75118e4c946821a3924b` |
| **050, final column compatibility correction** | `8b269e86de3e3c953770beb65e2cb711977eb1ea74967c72edc2e8fe183c5ea5` |
| 051, old | `60c0e9654c0e22759ccddcdc9e6a66bd1c1d609b833cdd5dfd8d28099764cc98` |
| 051, new | `f7dd14f31efeba2b24aaa25d3b6e2ae79c3d8d1ff731f6328633fc8c92fd0c83` |
| **052, new** | `0749174c12d8648a72e9da1b347828565ac3dbaceb10c336b588a9b1048b4531` |
| 053, prior outer transaction wrapper | `d26bffd385141ed052f560d1dba75ac92d332a757ca2631bd77ec67ea062a118` |
| **053, final runner-owned transaction** | `70ff43e4022d7d40ccaadc653a0bc53a19f1e4fb5616d2e340e9fb800287267c` |

The earlier local rewrites of 049–051 were made while the user confirmed all three were unapplied. At the previous 050 correction stage, 048a/049 were applied and 050/051/052 were absent after a transactional failure. The latest user instruction identifies all five as already applied and immutable. This follow-up changes none of those files and adds only forward migration 053. No ledger checksum adoption/update was added.

## Exact 049 correction

1. A missing table is optional only for `institutions`, `institution_admins`, and `cohort_snapshots`. If any exists, its original hardening still runs.
2. Search-path hardening is conditional on the exact signatures of these ten helpers existing:
   `admin_can_view_department(uuid,text)`, `get_admin_institution_id()`, `is_institution_admin(uuid)`, `get_admin_organization_id()`, `get_student_organization_id()`, `is_org_admin(uuid)`, `is_student_in_org(uuid)`, `org_admin_can_view_department(uuid,uuid)`, `is_admin_user()`, `fn_gdpr_erase_event_records()`.
3. The two verified present helpers remain mandatory: `fn_erasure_pseudonymise_old_user()`, `cron_create_activity_partition()`.

Final correction, 2026-10-12: the user supplied a verified read-only production preflight showing `is_admin_user()` and `fn_gdpr_erase_event_records()` absent, with no references in live public RLS policies or ordinary public functions/procedures. Both exact signatures now use the existing conditional hardening block. Historical migrations 010 and 014 defined/referenced them, but inspection of 050, 051 and 052 found no reference or operation requiring either helper. The later cron functions are independently defined; 050/051 require no change for this correction and retain their prior local checksums. No helper is restored to satisfy 049, and no production connection was made during this correction.

No helper is recreated. Role validation, inherited-danger checks, browser table/column revocations, RLS enablement, backend policies for already-authorized operations, partition handling, public-schema CREATE revocation and required-current-object failures remain intact.

## Reconciliation and grant behavior

048a uses the historical 012/017 column definitions, defaults, checks, foreign keys and indexes. It compares existing catalog definitions, not just names. Wrong columns/defaults/constraints/indexes/sequence ownership or sequence settings fail the transaction. It uses a private comparison schema created and removed within the same transaction because PostgreSQL temporary tables cannot reference permanent parents.

No historical rows are fabricated. Existing compatible rows are preserved. The snapshot sequence stays owned by its ID column; its counter is not reset. All three tables have RLS enabled and explicit ACL reconciliation. Browser and worker access is denied. `admin_bonus_grants` grants only SELECT/INSERT to runtime and the historically authorized service role; no runtime UPDATE/DELETE/TRUNCATE is granted. The original target-FK CASCADE and actor-FK RESTRICT remain.

Neither restored organization table has an executable current backend caller. Both therefore remain under RLS with no application ACL or policy; their sequence is owner-only. This deliberately narrows the broad historical 040 grants to demonstrated current needs. A future invite/snapshot consumer needs a separately reviewed access migration. Existing policies on `organizations`, `organization_admins`, `organization_students` and the college dimension tables are preserved by 049.

| Operation | New behavior |
| --- | --- |
| Free normal activation | Add 2 up to 20; an existing finite value above 20 is retained. |
| Pro normal activation | If valid paid access already exists, add 15 only if the result is at most 1000. Otherwise unlock a 30-day manual entitlement without adding a second base allowance. |
| Career normal activation | Unlock 30-day access when needed; retain valid access/expiry and do not add a finite bonus. |
| Activation with matching sentinel | Preserve the sentinel, including a normal activation against matching unlimited state. |
| Activation with another tier's sentinel | HTTP 409; the transaction does not change bonus or access. |
| Unlimited activation from a finite value | Store the selected tier marker. The prior finite state is recorded in the request journal; it is not banked or automatically restored on later deactivation. |
| Unlimited deactivation | Clear only that tier's matching marker. Other-tier markers remain. |
| Normal deactivation with a positive finite bonus | HTTP 409 because the stored aggregate does not establish which historical grant should be reversed. No inferred subtraction or entitlement revocation occurs. |
| Manual paid-access deactivation | Expire only `source_order_id='manual_grant'`, and only when no currently valid verified purchase protects that tier. Purchased-source entitlements and launch-offer access are not generically revoked. |
| Valid selected plan | Retained rather than forced to Free. Existing plan reconciliation chooses another owned plan only if the current selection is invalid. |
| Active entitlement with unknown expiry | Fail activation with HTTP 409 unless ordinary purchase reconciliation can establish its dates. |

The request now requires a UUID `request_id`. The fingerprint covers actor, target and normalized model/value/action. A transaction-scoped request lock handles same-ID races even across different targets; `profiles FOR UPDATE` serializes grants with rollover. The same ID and payload returns the stored logical result without mutation, including after a later rollover. A changed payload or actor gets HTTP 409. Different successful IDs represent distinct deliberate grant requests.

State change, finite audit insertion and journal insertion commit together. A failed journal insert rolls everything back. Sentinels are never recorded as numeric audit adjustments. The journal records only prospective manual requests; it does not claim to reconstruct earlier activity or record every automatic reset.

Free+9991 and Pro+9992 now produce `None` limits; enforcement exits safely before numeric comparisons. Career remains inherently unlimited. Wrong-tier sentinels add neither unlimited access nor a numeric bonus. Period normalization runs before a new grant, and both finite bonuses and markers expire at the existing rolling 30-day usage-period boundary. This is not a fresh 30 days per bonus grant. Standalone reset requests now normalize only an expired period using the same rule.

## 050/051 effects and cron qualification

### Final 050 production-schema correction, 2026-10-12

The user reported the actual production failure as `UndefinedColumnError: column "is_active" of relation "public.user_plan_entitlements" does not exist`. Their post-failure read-only verification confirmed a clean rollback: 050, 051 and 052 are not recorded; the `is_active` column is absent; total and active cron job counts are both zero; and `cron_gdpr_pseudonymise_old_user()`, `cron_gdpr_hard_delete_old_user()`, `cron_refresh_public_growth_metrics()`, `cron_purge_usage_events()` and `cron_purge_billing_events()` remain absent. 048a and 049 remain successfully applied. These are user-supplied production findings, not a production connection made during this local correction.

The entire 050 was reviewed before editing. Its only column-existence dependency was the unconditional `COMMENT ON COLUMN public.user_plan_entitlements.is_active`. That statement now sits inside `DO $legacy_entitlement_comment$`, guarded by an exact `pg_catalog.pg_attribute` lookup on the public table's OID, `attname='is_active'`, positive attribute number and `NOT attisdropped`. If present, the identical deprecation comment is applied; if absent, the block does nothing. No exception is swallowed, no column is added, and no entitlement DML is introduced.

The existing `DROP TRIGGER IF EXISTS trg_upe_refresh_is_active`, `DROP FUNCTION IF EXISTS public.fn_refresh_is_active()` and the guarded `reconcile-is-active` unscheduling block are unchanged. All other 050 SQL, including SECURITY DEFINER, trusted search paths, ACLs, RLS and dormant-cron handling, is unchanged. Source review found no `is_active` dependency in 051 or 052; both files and their checksums remain unchanged. Applied 048a/049 files were not edited.

For the confirmed **zero-job** production baseline, the corrected migrations create **zero jobs** and activate **zero jobs**. They install/harden function definitions. They do not execute those retention/metric functions during migration.

An incomplete nonempty cron catalog fails closed. For a reviewed existing nonempty set, the historical behavior of replacing commands while preserving schedules and active flags remains; that scenario was not used for this zero-job qualification and must not be substituted for the confirmed production baseline without review.

The narrowly corrected function behavior is:

- Weekly/daily interview counts use the actual `usage_events.interview_completed` source, which is independent of the 24-hour activity-event purge.
- Archived users with unresolved deletion requests or receipts lacking a matching completed request are not hard-deleted. Receipt metadata is retained; no new retention duration is introduced.
- Activity refresh fails before deletion when its singleton stats row is missing.
- Partition checks use the public relation's OID, the exact parent OID, and exact start **and end** bounds; the partition advisory lock remains.

If separately invoked/activated later, the seven resulting entry points have these effects:

| Function | Data effect |
| --- | --- |
| `cron_gdpr_pseudonymise_old_user()` | Null name/email after 730 days; retains metadata. |
| `cron_gdpr_hard_delete_old_user()` | Delete already-pseudonymized archives after 1095 days, subject to the new receipt protections. |
| `cron_refresh_public_growth_metrics()` | Recompute/upsert aggregate counters and the two existing milestone fields. |
| `cron_purge_usage_events()` | Delete soft-deleted usage rows whose deletion timestamp is older than 730 days. |
| `cron_purge_billing_events()` | Delete soft-deleted billing rows older than 2555 days only when `user_id IS NULL`. |
| `cron_refresh_activity_stats()` | Update active/inactive counters; delete activity events older than 24 hours after a valid singleton read. |
| `cron_create_activity_partition()` | Create/harden next month's unlogged activity partition; revoke browser access and enable RLS. |

No schedules are proposed or activated by this repair. The obsolete `reconcile-is-active` job, if present in a qualified historical baseline, is unscheduled by 050; the confirmed empty production catalog contains none. Its legacy entitlement trigger/function are removed if present, and `is_active` is documented as deprecated only if the column exists.

## Test results

All final listed runs completed successfully. Intermediate failures identified a temporary-table FK restriction (fixed with the private comparison schema), an invalid test fixture partition declaration (fixed), a stale migration-count assertion (updated), and the Windows temporary-directory restriction (tests redirected into the workspace). The session interruption stopped the disposable servers; they were restarted before the final database run. During the final 050 correction, a new test initially assumed every function target table had RLS enabled; it was corrected to assert preservation of the actual pre-migration RLS state, including the public metrics table. No migration hardening was changed to accommodate that test.

| Qualification | Final result |
| --- | --- |
| Full backend `pytest -q --disable-warnings --basetemp=.audit-runtime/runner-053-unit-tmp` | **1,100 passed**, 73 warnings, no failures/skips. |
| Existing recovery and real-pg_cron integration suites | **42 passed**. |
| New 053 archive/receipt PostgreSQL suite, including identity and actual CLI atomicity cases | **18 passed**. |
| Existing migration concurrency/process-failure suite | **25 passed**. |
| Existing deletion-worker PostgreSQL suite | **39 passed** (64 combined with migration concurrency). |
| Existing five frontend regression suites (prior helper-correction qualification) | **218 passed**; unaffected by this SQL/test/report-only correction, not rerun. |
| New actual admin-component retry tests (prior helper-correction qualification) | **3 passed**; unaffected, not rerun. |
| Frontend `tsc --noEmit --incremental false` (prior helper-correction qualification) | Passed; unaffected, not rerun. |
| `git diff --check` | Passed; Git emitted only line-ending/global-ignore access notices. |

Database qualification used PostgreSQL **17.11** on Windows and PostgreSQL **18.6** with the actual **pg_cron 1.6** extension in WSL. Fixtures verified the exact workspace data directories before mutation and used only synthetic records. The PostgreSQL 18 filesystem was a new disk image stored under `.audit-runtime`. Cron launching was disabled and no test created or scheduled a cron job. Functions were called directly against synthetic data, including worker-role partition calls; this is not a claim that a scheduled production worker login was tested.

Covered: exact filename ordering; immutable 012/048 hashes; checksum mismatch/null failure and unknown-version preservation; cutoff validation; canonical historical table acceptance and row preservation; empty/current production-shaped drift; absent legacy tables/all ten helpers; present optional helper hardening; mandatory helper/table failure; table/column ACLs, RLS and sequence ownership; supported/unsupported domain values; all sentinel activation pairings; finite boundaries; unlimited enforcement; journal rollback; same-ID replay/conflicts; independent connection concurrency; rollover/grant serialization; purchased-access/expiry/selection preservation; real empty-cron full-chain execution and ledger insertion; durable event counts; receipt protection; retention boundaries; missing-singleton failure; partition bounds and concurrent creation; migration lock/process death/recovery; startup and read-only readiness; UI retry and double-submit behavior.

The final helper correction was requalified with all ten optional helpers absent and only the two mandatory helpers present in the base fixture. 048a/049 succeed without recreating any absent helper; browser table/column and partition ACLs, RLS, public-schema CREATE revocation and existing organization policies remain enforced. Separate tests prove both mandatory-helper failures roll back atomically, and that either newly optional helper, when present, receives the trusted search path without changing its owner, body or ACL. Those helper cases remain covered by the final recovery qualification described below, with zero scheduled jobs.

The final 050 column correction makes the shared recovery fixture omit `user_plan_entitlements.is_active`. The real-pg_cron runner test now has absent-column and present-column variants. Both first commit 048a/049, then apply 050, 051 and 052 separately through the actual runner. Each stage verifies zero total/active cron jobs, unchanged entitlement rows including `xmin`, unchanged synthetic rows that retention/metrics functions would otherwise modify, no new partitions, preserved RLS state, and all six 050 entry points' SECURITY DEFINER, trusted search path, owner and execution ACLs. Browser/service/runtime execution remains denied and worker execution allowed; worker direct table writes remain denied. The absent column stays absent. The present-column variant retains its values, receives the deprecation comment and safely removes an existing legacy trigger/function. Both variants verify the empty 052 journal, rejection of an unsupported bonus, preservation of existing sentinel values, exactly one matching ledger row for each of 050/051/052, preservation of all earlier ledger hashes, and zero additional migrations on retry.

The database fixture models the reviewed prerequisite schema and independently creates canonical tables from historical 012/017 for the compatibility test. It does **not** claim to replay every historical Supabase migration into a pristine Supabase installation. The legacy 049 integration module still depends on unavailable historical fixture scripts; corrected 049 coverage is in `test_recovery_schema_postgresql.py` instead. No ambient integration-database discovery suite was run.

Reproduction commands for the already provisioned disposable clusters:

```powershell
$env:PYTHONPATH='G:\PrepVista-Old-Push\.audit-runtime\python311'
& 'C:\Python311\python.exe' -m pytest -q --disable-warnings --basetemp=.audit-runtime/runner-053-unit-tmp
& 'C:\Python311\python.exe' -m pytest integration_tests/test_050_cron_schema_reconciliation.py integration_tests/test_051_pg_cron_runtime_reconciliation.py integration_tests/test_recovery_schema_postgresql.py integration_tests/test_053_old_user_metadata_receipt.py -q
$env:PREPVISTA_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55472/postgres'
& 'C:\Python311\python.exe' -m pytest integration_tests/test_migration_concurrency_postgresql.py -q
```

Frontend commands, from `frontend`:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test tests/auth-reliability.test.mjs tests/interview-stt.test.mjs tests/report-integrity.test.mjs tests/assistance-provenance.test.mjs tests/college-flow.test.mjs tests/admin-grants.test.mjs
```

## Remaining review risks and limits

1. Production was not contacted. Its current ownership, full schema, default/inherited ACLs, migration ledger, pg_cron version and PostgreSQL version still need a release-time read-only comparison. A required-current-object or checksum discrepancy remains a hard stop.
2. Actual scheduled execution, authentication and nonempty historical cron catalogs are not qualified here. Cron activation requires separate approval. No destructive scheduler job was activated merely for testing.
3. The Python refresh path and SQL growth refresh still have different definitions of total/active users; SQL totals include all profiles, while the Python path filters admin identities. Only the objectively wrong completion-event source was corrected. Select one documented metric authority before enabling that cron job.
4. No product/legal decision about 24-hour, 730-day, 1095-day or 2555-day retention was invented. Unlogged activity partitions retain their existing crash-loss characteristics. These remain activation-review items.
5. Generic reversal of historical finite aggregates remains intentionally unsupported (409). A future operation-specific reversal workflow must establish provenance rather than infer a subtraction from the aggregate. Switching finite state to unlimited does not bank the former finite balance.
6. The frontend retains an ambiguous request ID while the component remains mounted; it is not a durable browser-side queue across reloads. API callers must retain their ID when retrying. Old clients without a request ID receive validation errors and must be deployed with the backend update.
7. New readiness requires the complete release manifest, including 053. Deploying the new application before the migrations finish will keep readiness false. Normal startup remains migration-free and requires only runtime `DATABASE_URL`.
8. Reconciliation deliberately rejects custom/drifted definitions, extra columns/constraints/triggers, wrong indexes or inherited access. It takes short-timeout table locks; index creation and constraint validation may scan/lock tables. The runner's per-file execution ceiling remains 600 seconds. These are not zero-downtime DDL guarantees.
9. The restored invite/snapshot tables have no runtime access because there are no current callers. Future use must add explicitly reviewed privileges. The audit/journal's original-style actor RESTRICT and target CASCADE relationships should remain part of account-deletion review.
10. Bootstrap now accepts the canonical `prepvista_runtime` URL username and validates existing roles; it does not provision them or interpret pooler-qualified names as SQL roles. The proposed release uses the dedicated migration command, not bootstrap.

## Exact future production effects and proposed sequence ? approval required

The approved scope ends at local implementation. This proposal supersedes the earlier 050 retry sequence; the user now reports 048a through 052 as applied.

1. Before any separately approved execution, verify a restorable snapshot/PITR point and read-only compare the complete ledger, all applied hashes (especially 048a?052), the exact archive columns/defaults/identity relationships and effective runtime privileges. Verify the zero-job cron baseline remains unchanged. Do not alter applied migration files or ledger entries.
2. Review the 053 checksum above and the narrow account endpoint change together. With separate execution approval and a dedicated migration connection, the proposed command is `python -m app.database.migrate --execute --through 053_old_user_metadata_receipt`. The runner must validate and skip earlier applied files. 053 adds only nullable JSONB metadata when absent and records its own ledger row atomically. Wrong metadata type or missing table is a hard stop; no historical row is populated.
3. Read-only verify the new column type/nullability/default, unchanged legacy data and sequence/identity definitions, the 053 ledger checksum, and unchanged cron catalog. Deploy the reviewed backend only through a separately approved process and confirm runtime readiness. Legacy NULL archives require review, not receipt fabrication. No new frontend change is required for 053.
4. Cron activation remains outside this release. In particular, the reported production `email NOT NULL` remains untouched: the dormant pseudonymisation function's email-nulling behavior needs separate schema/retention review before activation. No retention function was called against the production-shaped archive fixture during migration qualification.

## Rollback and recovery proposal

1. On any migration error, stop at that file. The runner rolls back that file's SQL and ledger insertion together. Previously committed files remain committed. For 048a/049/050/051/052/053 there is no nontransactional index path. Do not delete a ledger row or alter its checksum.
2. While writers remain stopped, read the ledger and catalogs to identify the last committed file. Preserve diagnostics without printing credentials. A failed lock acquisition or transient interruption can be retried using the **same files and checksums** after its cause is resolved; the runner skips already-applied matching versions.
3. On genuine schema/ownership/checksum drift, do not weaken checks or mark a file applied. Investigate the discrepancy. Correct an unapplied file only after review, or use a new forward migration for changes to any already-applied contract.
4. If application validation fails after the database changes, keep the grant endpoint/writers stopped. Preserve the new tables, journal, audit rows and valid sentinel values. Prefer a reviewed forward application fix using this exact migration manifest. Do not roll back to the old unsafe grant writer or restore the old `<=1000` constraint while sentinel values exist.
5. If a complete database rollback is necessary, obtain separate approval and restore the verified pre-change snapshot/PITR point, together with its matching application and complete ledger/schema/ACL/function state. Reconcile any post-snapshot writes before accepting traffic. This is a database restore, not a hand-edited ledger or a guessed inverse migration.
6. Once real journal/audit rows exist, do not drop them or infer reversal amounts from sentinel numbers. No automated destructive down migration is supplied. Resuming cron remains a separate approval even after recovery; the reviewed baseline is zero jobs.

Local implementation is complete. Stop here for explicit production approval.
