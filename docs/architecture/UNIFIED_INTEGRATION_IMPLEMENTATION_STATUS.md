# PrepVista + CodeForge implementation and release record

Updated 2026-09-19. This is the current implementation record for the
[V2 plan](PREPVISTA_CODEFORGE_SAFE_INTEGRATION_PLAN_V2.md). The earlier
[first-slice delivery record](CODING_INTEGRATION_DELIVERY.md) is historical.

**Status: substantial practice integration implemented locally; full integration,
assessment qualification and production rollout are not complete.** New coding
and journey features default off. No production database, provider configuration, paid
grant or deployment was changed during this implementation work.

## Implemented student journey

One existing PrepVista account opens the coding catalog, learning, diagnostic,
debugging, project, incident simulation and technical explanation workspaces.
Coding, interview and readiness share the existing application and account header.
Both student dashboard entries include the same next-mission component.

JavaScript practice uses the bounded QuickJS/WASM worker. Python, Java and C++
support editing and configured mentoring with execution explicitly unavailable.
Browser tests and reference solutions remain public practice material.

Account sync persists revisions, notes, preferences and a rolling 100-attempt
workspace. Each newly synced attempt also creates an immutable server artifact;
dropping it from that rolling window does not remove its archive. Empty failed
submissions retain their exact empty code. Client dates and browser outcomes are
labeled as client claims. Explicit saves add a bounded explanation and an
authorized saved-artifact handoff into the existing interview setup.

Repair and explanation missions open the selected saved artifact, use separate
draft keys, and preserve other practice drafts. Supported task versions can run
the existing practice checks. Saving creates a new artifact with an owner-checked
parent link; changed task/language and another user's parent are rejected. Edited
code does not inherit earlier pass claims. Known assistance carries into revisions.
Saving records completion of the activity, not proof that a correctness gap is fixed.

Interview completion and focused answer retries write outbox events in the same
database transaction. Retries update the same interview observation, retaining
anchor/question scope instead of becoming independent demonstrations. Original
interview reports, credits and history access rules retain their own contracts.

The independent worker adapts committed source records, deduplicates effects and
creates immutable practice snapshots. One coordinator persists launch/defer/dismiss
decisions. A click never completes a mission: a committed artifact, interview or
applicable retry must satisfy its completion type.

The readiness list distinguishes six preparation areas, source authority, coverage,
limited confidence, dates and processing health. **Its policy is foundation-only:
the overall result remains `MORE_EVIDENCE_NEEDED`.** No validated role-specific
thresholds, qualified live execution, high-confidence readiness, hiring probabilities or
legacy score average have been introduced. A role label is not a qualified rubric.
The current projection uses the latest 500 normalized records, records the window
and calculation inputs, and uses a reproducible UTC day bucket. The 90-day
freshness rule is a provisional practice policy requiring assessment review.

Students explicitly select guest export items, preview the merge and confirm
ownership. Conflict and oversized-input failures retain original data. No automatic
guest claiming or cross-origin storage access is attempted. Sync conflicts preserve
the local copy and require an explicit decision before loading the server copy.

AI mentoring uses the existing provider registry with a Gemini adapter available
when configured. PostgreSQL reservations enforce request idempotency, per-user and
global daily limits, and concurrent request bounds. Provider/model and available
token counts are recorded; unknown usage stays null. Limits are request/token
controls, **not a verified monetary budget or a new paid coding product**.

Organization reporting uses the same snapshot authority with explicit student
sharing, current membership, current target/policy filtering and organization-wide
staff permissions. Groups under five are suppressed. Any nonzero state count below
five suppresses its entire capability row to prevent subtraction from the total.
No student identifiers, raw code or transcripts are returned by the aggregate API.
This threshold does not establish a complete privacy model against repeated queries;
institutional privacy review remains a release gate.

### Institutional assignments (2026-09-13)

The new `/org-admin/assignments` screen lets organization administrators and
placement officers review a batch of at most 50 selected active pilot students,
choose their organization's active placement season and assign coding practice,
the notification project or an interview. It reuses `intervention` and
`intervention_assignment` from 029. Migration 031 explicitly binds the legacy
`institution_id` to `organizations.id` and `student_id` to `profiles.id`; this is
an inspected foreign-key mapping, not an assumed identity match. Existing legacy
assignments are not silently converted into unified missions.

Additive migration `039_unified_assignments.sql` stores request-idempotent batch
metadata and owner-constrained assignment-to-mission links. It also enables RLS on
the two legacy intervention tables and `audit_log`, as well as the new bridge
tables. Review existing production grants/policies and backend role privileges
before applying this change. Local tests use actual legacy table/enum definitions.

Students use `/readiness/assignments`, linked from the shared personal journey,
to explicitly accept assignment-specific completion-status sharing. Acceptance
does not enable readiness aggregate sharing, transfer artifact ownership, change
personal goals or provide sponsored/interview credits. It creates one personal
mission idempotently. Membership and cancellation/withdrawal are checked again
at launch and submission. The notification project requires its own task ID and
an explanation; coding assignments require saved code and an explanation.
Interviews retain the existing launch/quota and finish contracts. Due dates are
guidance and never delete work or silently mark weak performance.

Completion follows the committed artifact/interview mission transition in the
same database transaction. Staff receive assignment status only, never the
source record ID, raw code, explanation, transcript or private readiness snapshot.
Creation, acceptance, cancellation and withdrawal use the existing audit log.
The coding workspace and interview setup show the assignment context and offer
continuation as personal practice without discarding drafts. Withdrawing remains
available when assignments are paused or membership has ended. Staff cannot see
departed students' status; withdrawal masks prior completion in the assignment
API. Existing institutional audit retention still requires its governance review.
Source erasure cancels the derived assignment completion and removes its date.

This implementation supports a bounded assignment pilot. Department-scoped staff,
automatic cohort assignment, custom graded tasks, reminders, new sponsored grants
and retroactive conversion of legacy assignments are not enabled by this slice.

### Private saved reports and history (2026-09-13)

`/readiness/history` lists owner-scoped snapshots in chronological pages of 50,
including older roles and policies. Pagination resolves the cursor within the
same account and handles equal creation timestamps without duplicate/omitted
items. History is linked from the readiness view and coding recovery; it remains
available when workspace, sync and readiness visibility flags are disabled.

Each saved snapshot now offers JSON and standalone printable HTML downloads.
The HTML opens offline and supports the browser's print/save-as-PDF operation.
Both formats derive from the exact stored snapshot, never today's projection or
the current mission. The versioned `readiness-report-v1` allowlist contains row
states, coverage, confidence, source references/authority/time labels and policy
limits. Internal calculation inputs, code, transcripts, identity contact fields,
provider prompts and mission payloads are excluded. The saved snapshot API also
omits internal calculation inputs while retaining them in private storage for replay.

Exports are authenticated, owner-only and `private, no-store`. Organization staff
permissions and aggregate consent do not grant access. Deletion-invalidated
snapshots return not-found. HTML escapes all dynamic content and contains no
scripts, external resources or active evidence links. Account/snapshot navigation
invalidates pending download components. The canonical JSON content hash detects
changes; it is explicitly not a signature or an assessment verification receipt.

The download UI explains that local copies cannot be recalled by sharing withdrawal
or account deletion. Saved processing-health labels are historical, not a claim
about today's service. This implements private student reports; institutional
report distribution, retention policy approval and assessment qualification remain
separate release gates. No schema or feature-flag changes were needed for this slice.

### Isolated server validation (2026-09-13)

The separate [runner implementation and qualification runbook](ISOLATED_CODING_VALIDATION_RUNBOOK.md)
now covers artifact-bound job reservations, a dispatcher, authenticated gateway,
restricted container execution, result validation and the canonical evidence bridge.
It is implemented and tested locally, but no real execution host has been qualified
or deployed. Docker and WSL are unavailable on this Windows machine. No runner
configuration or linked Vercel project is present in this workspace.

Additive `040_coding_validation.sql` stores owner-constrained jobs, bounded results,
suite/code hashes, qualification references and single-use leases. Separate pilot
limits serialize globally in PostgreSQL; retries cannot create duplicate jobs or
settle a lease twice. Stale, unavailable or mismatched results remain unavailable.
The API never accepts browser pass claims as server results. Completion commits
its outbox event atomically; source/account deletion removes jobs and their derived
evidence and invalidates snapshots without allowing queued resurrection.

The gateway is designed for a dedicated Linux host and requires a digest-pinned
image, gVisor, no network/host mounts/secrets, a read-only root and enforced resource
limits. It inspects applied container restrictions before supplying code. Submission
code executes only inside the container's bounded QuickJS VM; PrepVista dispatchers,
web processes and analysis services do not execute it. Local fixtures validate the
VM and mocked-container HTTP boundary; real Docker/gVisor qualification is pending.

Initial server suites cover JavaScript version 1 of feature-vector deduplication
and search-insert-position. Other task versions/languages remain unsupported.
The student requests a check from a saved artifact, sees bounded status updates,
and can read/export paginated results at `/readiness/validations` after coding is
paused. Individual receipts have owner-scoped URLs used by readiness sources.

`practice-evidence-v2` preserves V1 replay, adds isolated-server observations and
suite/qualification provenance, correlates repeat checks with the same code and
offers a source-linked repair mission for server failures. Passing one suite does
not erase earlier failing observations. Overall readiness remains foundation-only
until approved role policies and reviewed rubric evidence exist.

### Offline assessment policy review (2026-09-13)

The [policy review workflow](READINESS_POLICY_REVIEW_WORKFLOW.md) provides a bounded,
deterministic candidate evaluator and CLI for role-specific review fixtures. It
checks source/measurement/language limits, freshness, task diversity, correlated
attempts, explicit comparable conflicts and non-compensatory required-capability
coverage. Reports include policy/input hashes, exclusions and differences from
supplied labels. Draft examples are synthetic and unreviewed; their thresholds
are hypotheses. Every result remains shadow-only, with uncalibrated confidence and
no independence claim. The tool rejects an approved policy status, opens no app
database and cannot publish grades. Actual rubric/reviewer evidence, permission
scope, assessment approval and a production qualification adapter remain needed.

### Keyboard and status accessibility (2026-09-13)

The coding shell has a focus-visible skip link to its stable main content target,
including while access is loading or unavailable. Concept, diagnostic, explanation
stage and incident-view buttons expose their selected state to assistive technology.
The code editor retains normal Tab navigation and announces copy feedback without
announcing every keystroke. Validation announces pending, completed and unavailable
states; accepted jobs remain pending in the UI before history refresh completes.
Browser checks cover keyboard activation, focus, selected states, editor exit and
the completion status region. Real screen-reader, zoom and broader usability
acceptance remain release work; these checks do not establish full accessibility.

### Historical snapshot verification (2026-09-14)

The [read-only snapshot verifier](READINESS_SNAPSHOT_VERIFICATION_RUNBOOK.md)
replays the full recorded V1/V2 result, input fingerprint and watermark at its
original calculation date. Optional explicit database verification compares the
recorded events with owner-matched canonical observations, source states and
deletion tombstones. Unknown policy/adapter versions, changed observations and
missing/foreign sources fail verification without modifying results. Database
transactions reject accidental writes; offline mode opens no database. The scope
is recorded input events, not a claim that historical evidence selection was
complete or that the assessment is qualified. An authored empty fixture is in CI.

### Browser runner package notices (2026-09-14)

The runner build now publishes `/coding-assets/runner-v1.NOTICES.txt` with the
installed package license/notice texts and `/coding-assets/runner-v1.manifest.json`
with bundle, notice, lockfile and individual notice-file hashes. Package selection
comes from esbuild's actual worker inputs; duplicate input files do not duplicate
package inventory. The current bundle includes three QuickJS packages at 0.32.0.
Builds reject missing notice files, absent lock records, installed-version drift
and paths outside the build root. Existing legal comments remain in the bundle.
Coding settings links to the notices. No dependency version was changed.

The lock integrity value is recorded, not independently revalidated against the
installed package bytes by this generator; the locked install remains required.
This is a scoped worker bundle manifest, not a complete product SBOM or authored
CodeForge ownership determination. Remaining dependency/rights reviews stay open.

### Separate schema application and startup controls (2026-09-14)

The [schema release runbook](UNIFIED_SCHEMA_RELEASE_RUNBOOK.md) provides a separate
read-only plan and explicit hash-bound apply command for migrations 038–041. It
requires a complete verified baseline ledger, rejects changed/noncontiguous history
and applies the selected integration prefix with its ledger entries in one bounded
transaction. Shared migration locks coordinate updated automatic and explicit
runners. Application pools remain private until initialization succeeds; failed or
cancelled candidates are closed or terminated.

`DATABASE_MIGRATIONS_ON_STARTUP=false` disables startup DDL/baselining. Its code
default remains true for compatibility; the sample configuration selects false and
rollout preflight requires explicit false when coding is enabled. No target setting
was changed. The tool does not establish schema provenance, authorize deployment
or replace a restored-target rehearsal. It adds no SQL migration of its own.

### Operational queue monitoring (2026-09-14)

The [queue monitoring command](UNIFIED_QUEUE_MONITORING_RUNBOOK.md) adds bounded,
read-only evidence backlog and optional validation-lease inspection. Operators
select age thresholds; JSON and Prometheus output distinguish an exceeded
threshold from an unavailable measurement. Counts include backoff and quarantine,
and restricted RLS visibility fails rather than reporting a filtered zero.
Outputs exclude student identifiers and content. The command uses only its own
explicit monitoring DSN and performs no retries, migrations or student grading.
No production schedule, alert destination or notification has been configured;
target load, missing-collector alerts and incident delivery still need rehearsal.

### Draft recovery through workspace-load failures (2026-09-14)

Workspace loading now retains the tab's unsynced state, dirty marker and original
server revision before the first request. A failed load cannot enable autosave or
silently bypass those edits on retry. `Retry workspace load` preserves the local
copy and checks its revision against the server; conflicts keep the original
revision through refresh and cannot overwrite newer server work.

`Load server copy` remains an explicit replacement choice, with confirmation for
unsynced edits. Replacement happens only after a valid server response. A failed
replacement leaves the current backup downloadable and a normal retry recovers it.
A successful replacement updates recovery storage immediately, preventing the old
dirty copy from returning after refresh. Storage failures retain a visible warning
instead of being overwritten by a sync-success message. Reload also waits for an
in-flight save to finish before starting a competing load.

This handles workspace-endpoint failures within an authenticated coding session;
it does not introduce offline authentication or bypass account/feature checks.
No server schema, evidence authority or entitlement changes were made.

### Offline reviewer comparison (2026-09-15)

The [policy-review workflow](READINESS_POLICY_REVIEW_WORKFLOW.md) now accepts
separately supplied annotations bound to the policy and case-input hashes. It
rejects changed/missing cases, policy drift and duplicate case/reviewer/rubric
records. Per-capability and per-rubric counts distinguish missing labels, single
reviews, multiple reviews, disagreement and candidate-label differences. No
comparable reviewer pairs produce a null agreement fraction, not a zero score or
perfect agreement. Larger reviewer panels contribute more pairs, explicitly
described as a descriptive count rather than calibrated accuracy.

An aggregate-only output mode omits raw case/source/reviewer/rubric references;
reports remain private assessment material. Input and comparison versions support
review traceability, but references and hashes do not authenticate reviewers,
establish independent review or verify consent. The bundled example annotations
are synthetic. No consensus label, approved policy, production score or release
authorization is created. Actual human-review collection, access/consent workflow,
calibration and approved policy publication remain open.

### Sharing preference recovery (2026-09-15)

Organization-sharing controls now distinguish a failed preference check from a
confirmed empty list. Explicit retry remains available without enabling coding.
Every save attempt rechecks current server state, including a lost response after
a committed change. Failed refreshes remove stale consent actions until a valid
response arrives; they do not claim the old preference is still current. Reads and
writes have bounded deadlines and do not automatically replay consent mutations.

Preference lists and save receipts are validated before rendering actions or
confirming changes. Identity changes remount the preferences, discarding old
messages and pending UI updates. Students can still revoke aggregate sharing after
leaving an organization or after coding is paused; this uses the existing backend
authorization and revocation path. No new authority to share private artifacts,
transcripts or human-review material is introduced. Live identity/permission and
privacy acceptance remain release gates.

### Authenticated artifact feedback and consent (2026-09-19)

The [artifact feedback workflow](ARTIFACT_REVIEW_WORKFLOW.md) implements named,
per-artifact reviewer access, explicit student consent, authenticated advisory
feedback and withdrawal. Reviewer identity is the canonical signed-in profile;
the exact allowlist and request recipient are checked server-side on every read
and submission. Organization/admin status alone grants no artifact access. The
student can inspect and withdraw old grants through paginated history, even with
coding or review flags paused. Account changes remount the browser controls.

Migration 042 adds private request, feedback and audit tables with RLS and owner/
source relationships. Request retries are idempotent, feedback receipts immutable,
source digests checked and five open requests enforced under a profile-scoped lock.
Withdrawal serializes against reviewer access/submission; source deletion cascades
review records. The migration planner and release preflight include 042. New flags
`ARTIFACT_REVIEW_ENABLED` and `ARTIFACT_REVIEWER_PROFILE_IDS` remain disabled/empty
in samples. No real reviewer, student consent or deployment was configured.

This closes the local advisory-feedback collection gap. It does not approve a
measurement rubric or connect feedback to qualified readiness. The fixed
`artifact-feedback-v1` format uses observations and not-assessed labels; it has no
outbox adapter or score mapping. Live consent/identity checks, approved assessors,
assessment calibration and retention/privacy decisions remain release work.

### Verified release-environment blockers (2026-09-19)

The workspace has no `.env`, frontend `.env.local` or linked Vercel project file.
No explicit preflight/migration database URL or coding-runner connection/credential
is set in the current process environment. `vercel whoami` reports no credentials.
Docker is unavailable, and `wsl --list --quiet` reports WSL is not installed. Only
isolated local database tests have run; no target schema or hosting environment was
changed. These findings do not rule out infrastructure elsewhere, but its authorized
project references and access have not been supplied. Initial reviewers and the
approved assessment rubric/policy have also not been supplied.

## Evidence recorded locally

| Check | Result and scope |
| --- | --- |
| Backend regression suite | 565 passed on 2026-09-19; 56 database cases skipped without an explicit local test DSN and run separately below. Includes reviewer comparison denominators/disagreement/hash binding/privacy, queue monitoring thresholds/failure output/credential isolation, startup migration controls and pool failure/cancellation cleanup, historical snapshot replay, recovery input/credential boundaries, runner transport/receipt verification, readiness policy review, release preflight, deterministic reports/privacy/HTML escaping and prior integration regression tests |
| PostgreSQL integration | 56 passed on 2026-09-19: actual 037/038/039/040/041/042 SQL and legacy intervention definitions, RLS, owner checks, imports, concurrent revisions/reservations, atomic outbox, retry correlation, erasure, quarantine/recovery/audit rollback and worker concurrency, source-linked missions, rollback access, cohort suppression, assignment consent/tenant/revocation/completion, release preflight, report/history, validation leases/receipts/queue/limits, canonical server-evidence replay, read-only snapshot/ledger verification, hash-bound migration plans, shared migration locks, late-failure batch/ledger/RLS rollback, read-only queue monitoring, per-artifact consent/assigned-reviewer isolation/advisory feedback/withdrawal/history/source deletion |
| Frontend unit suite | 19 passed: API retry/auth races, account-scoped recovery, heartbeat deadlines/coalescing, speech/transcript behavior and runner notice/version/hash/path checks |
| Chrome journeys | 35 passed in the full 2026-09-19 run. Includes actual WASM checks, all 19 reference solutions and runner notice/manifest hashes, loop/cancellation/host-binding isolation, account changes, draft recovery through failed loads, conflict revisions preserved across refresh, explicit replacement persistence, failed-replacement exports, guest consent, artifact interview handoff, consented artifact-review request/lost receipt/withdrawal and reviewer advisory feedback, repair revisions, snapshot/report rollback, history pagination, assignment consent/withdrawal, sharing-load and lost-response recovery, malformed preference rejection, staff review, server validation queue/results/recovery/receipt URLs, narrow-screen workspaces, skip-link focus, selected control states and keyboard editor exit |
| Separate runner fixtures | 6 passed: actual WASM fixture outcomes, loop/memory/output limits, serializer integrity, context isolation, HTTP authentication/concurrency and container-control inspection; Docker launches are mocked |
| Build | Next production build and TypeScript passed with a non-routable HTTPS fixture API URL |
| Lint | Frontend ESLint passed with zero warnings |
| Dependency audit | Frontend production dependency audit: zero reported vulnerabilities |
| Source inventory | All 12 first-slice and 42 extended source hashes match their manifests; destination files exist |

Browser API traffic is mocked. Database tests use fresh schemas containing the
relevant existing table shapes and actual migrations, not a restored production
dataset or a live Supabase session. Local embedded PostgreSQL is 18.4; CI declares
PostgreSQL 17 and has not been run remotely here. Accessibility smoke checks do not
replace assistive-technology review. Source hashes establish tracking, not rights.
The separate migration-command tests seed a synthetic 001–037 ledger before
applying actual 038–042 SQL; they do not establish a complete baseline rehearsal.

The latest full browser run on 2026-09-19 passed 35 journeys; the 19 frontend unit
tests last passed on 2026-09-15. The latest production build, TypeScript and ESLint
checks on the changed frontend files passed. Browser API traffic remains mocked;
the worker executes real local WASM. No remote CI or deployment run is implied by
these local results.

## Reproduce without touching the application database

From the repository root in PowerShell, with existing dependencies installed:

```powershell
.\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest-coding-db-local-unique
node tools/integration-db/run.mjs
```

Use a new `--basetemp` suffix for each Windows run. The database harness creates a
fresh loopback-only cluster and random password under `tools/integration-db/clusters`.
It supplies its own `CODING_TEST_DATABASE_URL`, never the application's
`DATABASE_URL`, and stops its server on exit. Test directories remain ignored and
are deliberately not deleted automatically. Only one harness may use port 55439.

From `frontend`, run `npm.cmd test`, `npm.cmd run lint`, then:

```powershell
$env:NEXT_PUBLIC_API_URL='https://api.prepvista.invalid'
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --omit=dev --audit-level=high
```

This API URL is a local test fixture, not a deployable production setting. Chrome
must be installed for local Playwright runs; CI installs Chromium explicitly.

## Migration and enablement sequence

### Read-only release preflight

`scripts/unified_release_preflight.py` checks the migration inventory and an
explicit rollout flag plan. Its default invocation performs no database access,
does not load `.env`, and never initializes the application pool:

```powershell
.\.venv\Scripts\python.exe -m scripts.unified_release_preflight --flags-file docs/architecture/unified-rollout.flags.example.json
```

The example has every feature disabled and no pilot identities. Prepare a separate
JSON plan with real canonical pilot IDs when reviewing rollout. Only the documented
boolean flags and `CODING_PILOT_PROFILE_IDS` are accepted; do not put credentials in
this file. The checker rejects string booleans, wildcard/malformed pilot IDs and
inconsistent flag dependencies. CI runs this local check as well as the tests.

Database inspection is opt-in. Provision `UNIFIED_PREFLIGHT_DATABASE_URL` through
the authorized environment's secret mechanism, then run:

```powershell
.\.venv\Scripts\python.exe -m scripts.unified_release_preflight --database --flags-file docs/architecture/unified-rollout.flags.example.json
```

The command never falls back to `DATABASE_URL`. It opens a dedicated connection
with a PostgreSQL read-only, repeatable-read transaction, a 30-second overall
inspection deadline and bounded statement/lock timeouts. It neither applies
migrations nor baselines missing checksums nor processes/retries events. A failed
inspection is reported without driver error text, credentials or connection names.

The JSON report compares exact migration stems and the same normalized UTF-8
checksums used by the application. It distinguishes pending, unknown, changed and
unverified migrations; checks required columns, selected critical types, RLS,
permissive policy presence, trigger activation and queue quarantine. If the audit
role cannot see all relevant rows, queue metrics remain unavailable rather than
reporting a misleading filtered zero. Use a role authorized for this inspection;
the read-only transaction also rejects accidental writes made by the checker.

Exit 2 means blocked/invalid/unavailable; exit 0 means this invocation's checks
completed without findings. In local mode `technical_checks_passed` remains false
because the target database was not checked. `release_authorized` always remains
false: this tool does not perform a full schema-definition/constraint comparison,
load test, restore drill, provider test, live auth audit or assessment qualification.
Database policies flagged for review are not automatically removed. Capture the
report with the target environment's release evidence; no real target has been
inspected during this implementation.

### Target migration review

**The compatibility default still applies startup migrations.** Set
`DATABASE_MIGRATIONS_ON_STARTUP=false` in the actual unified release environment
before startup and use the [separate schema procedure](UNIFIED_SCHEMA_RELEASE_RUNBOOK.md).
Coding feature flags alone do not control migrations. Workers continue to pass
`run_migrations=False`; the separate operator command uses its own explicit DSN.

Before any real backend restart/deployment containing this work, the database owner
must inspect the target ledger and compare migration filenames/checksums. Local
`038_unified_coding.sql` has evolved during implementation. Its deployed status is
unknown. If an earlier 038 exists in any target, preserve the applied file and ship
the differences as a newly numbered additive migration. Do not overwrite ledger
checksums, renumber an applied migration or rely on checksum warnings as repair.
Migrations 036 and 037 belong to the interview work and must not be reused.
The assignment bridge is numbered 039, validation storage/outbox 040 and operator
recovery audit 041 locally; verify these numbers and all prerequisite checksums in
every target before release. Artifact review consent adds 042. None has been applied
to a real target during this work.

Rehearse the complete target migration sequence on an authorized restored database,
including trigger lock duration, rollback compatibility, source/receipt counts,
backup restoration and deletion replay. New-table RLS requires server authorization;
the application database role can bypass browser policies and must stay private.

After that release gate, enable capabilities separately for exact canonical profile
UUIDs in `CODING_PILOT_PROFILE_IDS` (empty or `*` grants no access):

1. `CODING_WORKSPACE_ENABLED`: authenticated browser practice.
2. `CODING_SERVER_SYNC_ENABLED`: durable workspace/artifact writes and recovery.
3. `CODING_GUEST_IMPORT_ENABLED`: selected, confirmed imports after recovery review.
4. `UNIFIED_EVIDENCE_ENABLED`: independent projection worker. Start with bounded
   `python -m scripts.process_unified_evidence --once`; use `--backfill` for each
   bounded historical batch. Only enrolled workspace/artifact owners are included.
5. `UNIFIED_READINESS_VISIBLE`: foundation practice list and missions after reviewing
   the generated snapshots and labels. There is no separate qualified-score release.
6. `CODING_AI_ENABLED`: only after live provider/error/cost checks; configure the
   provider, model, individual/global daily limits and global concurrency explicitly.
7. `UNIFIED_TPO_VISIBLE`: independently gated institutional pilot after privacy,
   permission and consent review. It does not grant private artifact access.
8. `UNIFIED_ASSIGNMENTS_ENABLED`: independently enables staff creation and student
   acceptance/launch. Requires 039 and the workspace/sync/journey pilot capabilities
   for selected students. Staff must already hold organization-wide permission;
   this flag does not grant it. History and student withdrawal remain available
   after pausing this flag. Finish of an already-started interview stays durable.

9. `CODING_TRUSTED_VALIDATION_ENABLED`: requires 040, the independently qualified
   runner/image/HTTPS ingress, its private service credential and recorded
   qualification reference. Configure separate pilot request limits and start the
   dispatcher with migrations disabled. Follow the runner runbook; enabling this
   flag alone cannot configure a service or establish its qualification.

A separate assessment shadow UI and approved role policies from the design are
not implemented switches. Processing can run with student visibility
off for operational review, but a full assessment shadow-review workflow is pending.
Consented advisory artifact feedback now has its own independent default-off gate;
follow its runbook before enabling named reviewers. It is not the qualified
assessment shadow-readiness workflow.

## Worker operations, recovery and rollback

The worker logs counts of processed, failed, pending and quarantined events without
raw student content. Each failed event backs off 60 seconds; after five attempts it
is retained in quarantine. Pending/unavailable processing is not weak performance.
Investigate the failing adapter/source in an authorized environment, repair and test
the cause, then use the [bounded recovery CLI](UNIFIED_EVIDENCE_RECOVERY_RUNBOOK.md)
to inspect, preview and retry exact quarantined events. It requires a dedicated
explicit DSN, limits selections to 100, rejects changed/erased/expired selections
and writes an idempotent audit receipt in the same transaction. Preview never writes
the database. Recovery never executes code, clears observations or promotes scores.
The worker retains owner/event locks through failure accounting so concurrent workers
cannot bypass backoff; partial projections roll back before an attempt is recorded.
Do not remove tombstones or bulk reset/erase the queue to hide a backlog.
Policy/adapter changes still need versioned replay and reconciliation before
read-switch; processed-history reprojection is outside this recovery tool's scope.

Turning off visibility or pausing the worker preserves authoritative server writes
and outbox events. `/coding-recovery` remains an authenticated owner-only paginated
export path when workspace/sync flags are off. Saved readiness history, snapshot
URLs and private JSON/HTML reports remain owner-readable without feature flags.
Sharing revocation remains available after a
flag rollback or organization departure. Keep these compatible read paths deployed;
reverting to an app version that lacks them is not the prescribed rollback.

Do not silently switch acknowledged server work back to anonymous local storage.
Preserve local exports during conflict/import recovery. Acknowledged data-loss
recovery requires the restore and reconciliation rehearsal above, not down migrations.

Deleting a source invalidates its derived events/snapshots; tombstones prevent queued
reconstruction. Deleting an answer retry conservatively invalidates the interview's
derived preparation source. Account cascades remove account-owned integration rows.
An individual artifact deletion is not currently a public product operation: saved
code excerpts already copied into an interview remain under that interview's
retention contract. A future per-artifact erasure workflow must explicitly reconcile
those copies and related drafts, imports and revisions before making a broader claim.

## Open completion gates and risk ownership

The [64-risk register](PREPVISTA_CODEFORGE_INTEGRATION_RISKS_V2.md) remains the release
authority for closure evidence; no risk is marked closed merely by this implementation.

| Risk area | Implemented controls | Remaining release evidence/work |
| --- | --- | --- |
| R01–R08: measurement | No score merge, authority/unknown labels, correlation, immutable snapshots, offline candidate-policy/label comparison, input-bound reviewer disagreement/coverage reports and authenticated consented artifact-feedback collection | Approved role/language policies, qualified live runner, reviewed assessment rubrics, live consent/privacy qualification, qualified review adapter and subgroup evaluation |
| R09–R16: identity/tenancy | Canonical profile checks, private endpoints, owner-bound commands, assignment consent/membership/revocation checks, browser state and opt-in aggregates | Live Supabase/session/RLS adversarial tests, revoked entitlement and wider institution mapping audit |
| R17–R24: persistence/migration | Revisions, selected imports, immutable archives, transactional outbox, tombstones and recovery exports | Target migration ledger, full restore/backfill reconciliation, production-scale locks, per-artifact erasure semantics |
| R25–R32: execution/AI | Bounded local VM, isolated runner implementation, authenticated immutable receipts, private result history, provider adapter and shared limits | Actual Docker/gVisor host qualification, authenticated staging runner/provider flows, cost/abuse and failure-load tests |
| R33–R40: student experience | Ported workspaces, shared navigation, source-linked missions, mobile browser journeys | Feature-by-feature product acceptance, assistive-technology checks, multi-device/offline usability and pilot feedback |
| R41–R48: billing/commercial | Interview quotas unchanged, separate coding AI reservations, recovery after flags off | Paid/sponsored coding grants, payer policy, monetary budgets, prices and commercial approval |
| R49–R56: operations | Independent worker, atomic failure accounting, quarantine, audited bounded retry, historical snapshot/ledger verification, startup migration opt-out, hash-bound schema application, private pool initialization, replay-safe effects, bounded heartbeat, flags, read-only release preflight and queue monitoring with JSON/Prometheus output | Target preflight evidence, measured SLOs/load, production monitor scheduling/alert delivery, restore drill and staged rollout evidence |
| R57–R64: governance/release | Exact source manifests, worker package notices/bundle manifest, local automated tests and this runbook | Remaining rights/dependency review, retention/privacy decisions, named owners, CI/staging evidence, incident exercise and final cutover |

The bounded institutional assignment integration, private student snapshot
history/report downloads and isolated validation pipeline are implemented locally.
Actual runner qualification, their production pilots,
institutional report/export governance and retirement of obsolete CodeForge
authority paths remain incomplete. The standalone source is preserved.
Full completion requires the plan's connected qualified student journey and its
release gates, not just these local test results.
