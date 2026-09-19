# PrepVista + CodeForge integration: risk register and closure gates

Current local controls and test evidence are tracked in the
[implementation and release record](UNIFIED_INTEGRATION_IMPLEMENTATION_STATUS.md).
The gates below remain open until their complete closure evidence and owners exist.

Status: proposed controls, 2026-09-11. Companion to the
[safe integration plan](PREPVISTA_CODEFORGE_SAFE_INTEGRATION_PLAN_V2.md).
This register identifies 64 concrete risks from the current repository and the
proposed integration. It does not claim to eliminate unknown future risks.
No control listed here should be assumed implemented or validated by this document.

## How to use this register

Critical means a plausible account/tenant breach, unsafe execution, lost durable
data or materially misleading readiness. High means a release-blocking defect
for the affected capability. Medium means a significant usability or operational
issue whose bounded residual risk can be accepted explicitly by the release owner.
Severity reflects impact before the proposed controls; it is not an incident report.

Each owner is a role to assign to an actual person before work starts. One person
may cover several roles. The verification column defines evidence needed to close
the risk for a release; writing code alone is not closure. Record the issue/PR,
test or review artifact, environment, date, owner, residual risk and next review
date in the implementation tracker. All rows start **Open: proposed control**.

Release gates follow the main plan:

- G0: approved scope, source inventory, baselines and ownership review.
- G1: additive data contracts, identity and tenant boundary proved in a test database.
- G2: authenticated coding practice, bounded AI access, safe persistence and guest import.
- G3: shared missions, artifact handoff and qualified evidence collection.
- G4: replayable shadow readiness and measurement review.
- G5: limited student-facing readiness rollout with honest evidence labels.
- G6: separately approved organization aggregates and broader rollout.

Gate-to-phase mapping: G0 closes plan phase 0; G1 closes phase 1 and its database
preconditions; G2 closes phases 2–3; G3 closes phase 4 plus the bounded artifact
handoff/mission slice; G4 closes phases 5–6 for each enabled evidence class; G5
closes phase 7; G6 closes phase 8 and supports phase 9 expansion. These gates are
acceptance checkpoints, not a second implementation sequence.

G2 may ship useful practice while G4/G5 work remains incomplete, provided the UI
does not imply verified competence. Existing interviews remain operational at every gate.

## A. Evidence and readiness validity

| ID | Risk / severity | Proposed solution | Required verification and gate | Responsible role |
| --- | --- | --- | --- | --- |
| R01 | **Critical:** Averaging CodeForge pass percentages and interview scores creates a precise-looking but invalid readiness score. | Use one role-specific capability list with separate source evidence, coverage, confidence and freshness. Keep historical scores in their original reports. Use explicit, noncompensatory required-capability rules; withhold hiring probabilities. | Contradictory fixtures prove strong communication cannot erase failed coding checks and vice versa. Product and measurement reviewers approve every displayed claim before G5. | Measurement lead + product lead |
| R02 | **Critical:** A forged browser attempt or imported localStorage record becomes trusted readiness. | Accept browser results as client-reported practice only. Derive identity and receipt metadata on the server. Promote evidence only through a defined validation path; a signed receipt authenticates receipt, not correctness. | Modify pass count, timestamps, source authority, student ID and assistance flags in requests; none can raise authority. Verify promotion endpoints reject unsupported sources before G3. | Backend lead + security lead |
| R03 | **High:** Missing, skipped, failed-to-grade or unavailable evidence becomes zero and unfairly lowers readiness. | Store assessment availability separately from scores. Preserve NOT_MEASURED and INSUFFICIENT_EVIDENCE; use freshness/status fields for pending or unavailable data. | Empty profile, skipped question, timeout, outage and partial import retain unknown states without fabricated scores. Required for G3/G5. | Measurement lead |
| R04 | **High:** Retries, follow-up questions or repeated events count the same demonstration multiple times. | Link evidence to immutable activity/artifact versions and correlation groups. Deduplicate effects; cap correlated contributions under a versioned policy. | Replay an attempt and its explanations repeatedly, including reordered events; capability coverage is unchanged unless there is a genuinely new qualifying demonstration. G4. | Evidence-platform lead |
| R05 | **High:** Hidden assistance, copied code or exposed solutions is labeled independent work or authorship. | Treat assistance as known-assisted, declared-unassisted or unknown, with provenance. Correctness validation does not establish authorship. Project defense supplies additional evidence without guaranteeing originality. | Unknown assistance never silently becomes independent. Reference-solution and copied-code scenarios do not receive authorship certification. Labels reviewed at G3/G5. | Measurement lead + product lead |
| R06 | **High:** Supported roles or languages get incomparable scores; Python/Java/C++ mentoring is mistaken for execution. | Publish a capability matrix. Current browser execution is JavaScript; other language features retain explicit limits. Qualify each role/language policy separately and show unsupported coverage. | End-to-end tests for every advertised language show accurate Run/mentor behavior. No readiness threshold transfers to an unqualified role/language. G2/G5. | Coding lead + measurement lead |
| R07 | **High:** Changed role targets, rubric versions or stale evidence silently change historical claims. | Keep immutable snapshots with role, policy, rubric, content and source versions. Reproject the current view explicitly; record expiration policy and reason for changes. | Change role and policy, then reproduce both old and new snapshots from recorded inputs. Old reports remain interpretable. G4. | Evidence-platform lead |
| R08 | **Critical:** Conflicting evidence, early V2 text signals or heuristic company probabilities are presented as high-confidence placement readiness. | Preserve signal authority and limitations. Use REVIEW_NEEDED for material conflicts and a human review path. Exclude unvalidated company probability curves from the unified view; require qualification for stronger claims. | Adversarial review of mixed-source profiles, sparse history and disagreements; approve claim wording and abstention behavior before G5. | Measurement lead + product lead |

Residual limitation: practice evidence supports a bounded account of observed
performance. Even a server-validated solution does not prove identity, independent
authorship, general competence or future hiring outcomes. Show this through precise
labels and coverage rather than a broad warning repeated throughout the product.

## B. Identity, authorization and tenant isolation

| ID | Risk / severity | Proposed solution | Required verification and gate | Responsible role |
| --- | --- | --- | --- | --- |
| R09 | **Critical:** CodeForge creates a second account system or joins records by mutable email. | Use PrepVista's canonical profile ID and existing identity-link mechanism. Derive ownership from authenticated requests; never join guest or provider accounts by email alone. | Existing accounts, email changes, linked identities and concurrent first sign-in yield one intended profile without reassignment. G1. | Identity lead |
| R10 | **Critical:** Guessing attempt, artifact or readiness IDs exposes another student's records. | Enforce object-level authorization on reads, writes, exports, grading jobs and artifact handoff. Apply database policies where appropriate; do not rely on hidden UI controls. | Two students in one tenant and students in two tenants try every resource operation using each other's IDs. Include child records, files and async job results. G1/G2. | Security lead + backend lead |
| R11 | **Critical:** A client-supplied organization ID or a stale institution mapping changes ownership or payer. | Resolve canonical organization membership server-side with existing services. Reconcile legacy institutions explicitly; validate activity scope and sponsorship independently of requested IDs. | Spoofed tenant IDs, removed memberships, ambiguous legacy mappings and simultaneous personal/sponsored access all preserve the intended boundary. G1/G2. | Identity lead + data lead |
| R12 | **Critical:** Organization staff automatically gain private code, interview transcripts or personal practice history. | Define a per-resource visibility matrix. Separate personal work from assigned institutional work. Organization aggregates do not imply permission to read raw artifacts; require explicit applicable policy and access checks. | Staff membership alone cannot read private records. Assignment, transfer, departure and export tests match the visibility matrix. Required before G6. | Product lead + privacy lead |
| R13 | **Critical:** Shared-browser local state or an offline queue leaks/replays one account's work under another. | Namespace signed-in storage and queues by profile and scope; clear in-memory providers on sign-out/account change. Bind queued writes to the originating identity and stop on mismatch. Keep guest import explicit. | Account A edits offline, signs out, then B signs in: B sees no A data and cannot replay A writes. Test multiple tabs and expired sessions. G2. | Frontend lead + identity lead |
| R14 | **Critical:** Temporary integration passes access tokens through URLs, browser storage bridges or untrusted origins. | Prefer one authenticated application. For any temporary zone use the established session boundary and verified backend identity; prohibit URL token relay, arbitrary redirects and unrestricted postMessage bridges. | Inspect navigation, referrers, logs, browser history, redirect parameters and origin checks. No credentials appear in URLs or cross-origin messages. G2. | Security lead |
| R15 | **High:** Refresh races, revoked membership or cached entitlements keep privileged actions available. | Use existing token verification and refresh behavior. Recheck sensitive writes at commit/launch, bound authorization cache lifetime, and cancel or isolate pending work when identity changes. | Revoke membership/subscription and expire sessions during launch, sync and report access. Verify a refresh storm cannot cross identity or duplicate spend. G2/G6. | Identity lead + backend lead |
| R16 | **Critical:** A service key, privileged worker or admin route bypasses row policies and trusts caller IDs. | Restrict service credentials to required backend jobs. Use explicit authorization before privileged operations, narrow worker contracts and audited admin actions. Treat RLS as one layer, not a substitute for backend checks. | Test user, staff, administrator and service contexts against the same ownership cases. Review all privileged writes and job payload ownership. G1. | Security lead + database lead |

These controls follow [Supabase JWT verification guidance](https://supabase.com/docs/guides/auth/jwts),
[Supabase's RLS model and privileged-access caveats](https://supabase.com/docs/guides/database/postgres/row-level-security),
and [OWASP object-level authorization guidance](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/).
Their application to this repository still requires the tests above.

## C. Persistence, import and migration

| ID | Risk / severity | Proposed solution | Required verification and gate | Responsible role |
| --- | --- | --- | --- | --- |
| R17 | **High:** Changing hostname loses access to anonymous localStorage or path changes are mistaken for storage isolation. | Preserve the original guest application during transition. Provide export there and bounded import in PrepVista; explain origin restrictions and keep an original backup. Storage keys include account identity after sign-in. | Rehearse same-origin, cross-origin, private-window and unavailable-storage cases. Recovery never depends on the new site directly reading the old origin. G2. | Frontend lead |
| R18 | **High:** Shared-device guest records are silently claimed by the first student to log in. | Preview selected records, request an ownership declaration and explicit import action, and label imported evidence as guest/client-reported. Do not import automatically on login. | Two users share a browser; neither receives guest work without selecting it. Imported data retains source labels and can be removed through supported workflows. G2. | Product lead + frontend lead |
| R19 | **High:** Corrupt, oversized or interrupted imports lose data, duplicate attempts or inject invalid fields. | Validate schema and bounds; preview accepted/rejected counts; use import manifests, idempotency keys, bounded batches and resumable status. Preserve originals until completion is verified. | Corrupt JSON, unknown versions, excessive code, duplicate uploads, mid-batch failure and retry produce correct counts with no silent loss. G2. | Data lead |
| R20 | **High:** Multiple tabs/devices overwrite the latest draft or invalidate the artifact used for interview evidence. | Use draft revisions and optimistic concurrency, explicit conflict recovery and immutable submitted artifact versions. Interview references the submitted version, not the mutable draft. | Two devices edit the same revision; the server rejects or reconciles the conflict visibly and preserves both recoverable versions. Interview evidence remains stable. G2/G3. | Frontend lead + backend lead |
| R21 | **High:** Offline or out-of-order writes overwrite newer state or use forged client time for freshness. | Use server receipt time, monotonic revision checks, idempotency and explicit event occurrence metadata with trust labels. Queue per account; reject invalid state transitions. | Reorder and replay queued writes with future/past timestamps and network flaps. Drafts, usage and readiness converge without trusting device clocks. G2/G4. | Evidence-platform lead |
| R22 | **Critical:** Applying the old migration-036 draft collides with existing migrations or corrupts institution/organization mapping. | Inspect the actual deployed ledger, allocate a new number, use additive schema and explicit mapping/backfill reports. Stop on ambiguous mappings; never repurpose 036 or 037. | Apply from a production-shaped prior schema and from an already-current schema in disposable databases. Existing migration checksums and records remain intact. G1. | Database lead |
| R23 | **High:** Historical interviews are rescored, attributed new authority or double-counted during backfill. | Preserve historical reports; backfill source-linked observations with original versions and bounded authority. Run dry-run counts, sample reconciliation and replay-safe checkpoints. | Before/after samples retain historical report content; repeated backfill has no new effects. Unmappable records are reported rather than guessed. G4. | Data lead + measurement lead |
| R24 | **Critical:** Account deletion, org departure or restored backups resurrect private evidence or leave derived snapshots/export copies orphaned. | Define retention/deletion per record class, source-to-derived lineage, tombstones and job cancellation. Reapply deletion ledger after restore; reconcile organization versus personal ownership. | Delete during grading/backfill, then restore a backup in a rehearsal. No prohibited record is republished; derived views and queued exports follow the documented policy. G2/G6. | Privacy lead + data lead |

Browser storage is scoped to an origin and can be unavailable; it is not a
student identity boundary. See [MDN localStorage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
Guest recovery remains limited by what is still present in the original browser;
the current bounded attempt history cannot reconstruct records already discarded.

## D. Execution, AI and application security

| ID | Risk / severity | Proposed solution | Required verification and gate | Responsible role |
| --- | --- | --- | --- | --- |
| R25 | **Critical:** Integrating Run executes submitted code in FastAPI, the Next.js server or a privileged host process. | Keep current QuickJS execution inside its browser worker for practice. Any future trusted execution uses a separately operated, ephemeral, constrained runner; never eval or subprocess student code in application services. | Architecture and code review prove no host-execution path. Trusted-runner promotion remains disabled until isolation, timeout and incident drills pass. G2 and any runner release. | Security lead + runtime lead |
| R26 | **Critical:** A runner escape or newly added host bridge exposes secrets, network, filesystem or other students' state. | Preserve the browser VM's lack of guest host bindings. For server execution use least privilege, no production secrets, denied egress by default, isolated storage and teardown; review sandbox changes separately. | Adversarial filesystem/network/process probes, cross-job contamination and teardown tests pass. Monitor and patch the chosen isolation technology. Before enabling that runner. | Runtime lead + security lead |
| R27 | **High:** Browser-bundled hidden tests and reference solutions are used as secure assessment material. | Label browser tests public practice. Keep qualified assessment material outside client bundles, version it and rotate compromised sets. Never claim hidden browser tests resist inspection. | Inspect production bundles and runner assets; browser content cannot satisfy a secure-assessment policy. Test-set exposure triggers invalidation/review rules. G3/G5. | Coding lead + measurement lead |
| R28 | **High:** Infinite loops, oversized output or many concurrent jobs exhaust browser, API, queue or compute budgets. | Preserve code/test/memory/time/output caps and worker termination. Add bounded queue depth, user/tenant/global concurrency, cancellation and backpressure for server work. | Infinite recursion, memory pressure, output floods, canceled tabs and parallel launches terminate within budgets without starving interviews. G2. | Runtime lead + reliability lead |
| R29 | **High:** Code comments, resume text or project artifacts instruct the mentor/interviewer to reveal data or modify scores. | Treat artifacts as untrusted input, constrain context, use structured outputs and allowlisted tools, and keep authorization/scoring authority outside model instructions. | Injection fixtures cannot access another user's data, call unauthorized tools, mark evidence verified or change entitlements. G3. | AI lead + security lead |
| R30 | **Critical:** Standalone Gemini integration leaks keys or sends excessive private artifacts to the wrong provider. | Route coding AI through PrepVista's provider authority with server-only secrets, minimal authorized context and redacted logs. Check provider data handling against the applicable product agreement before enabling sensitive inputs. | Build/response/log inspection finds no credentials; provider requests contain only permitted context. Simulate provider errors without leaking prompt contents to clients. G2. | AI lead + privacy lead |
| R31 | **High:** CodeForge's shared in-process rate bucket is treated as authenticated distributed abuse control. | Enforce user, tenant and service-wide limits in the canonical gateway, backed by a shared atomic mechanism where needed. Keep request/body limits and origin checks; use correct CSRF defenses for cookie-authenticated writes. | Multi-instance bursts, direct API requests, changed origins, cookie cross-site requests and restarts cannot bypass the intended budgets or block all users with one caller. G2. | Backend lead + security lead |
| R32 | **High:** Student code, AI output or imported notes execute markup or unsafe links in reports and exports. | Render source as text, sanitize any supported rich content, validate URLs and filenames, and prohibit arbitrary remote fetches. Apply safe export encoding and attachment limits. | Stored/reflected script, malicious markdown, spreadsheet-formula export and URL-fetch fixtures remain inert or are rejected. G2/G3. | Frontend lead + security lead |

Residual limitation: sandboxing and model prompt controls reduce specific risks;
neither makes arbitrary execution or AI output intrinsically trustworthy. A new
runner language, tool or model capability requires review of its actual boundary.

## E. Unified frontend and student experience

| ID | Risk / severity | Proposed solution | Required verification and gate | Responsible role |
| --- | --- | --- | --- | --- |
| R33 | **High:** Both applications claim root routes, settings, interview or progress, creating broken links and competing journeys. | Port coding under `/coding/**`; preserve compatibility redirects where safe. PrepVista owns account/settings, full interview and the unified readiness destination. Map every current route to a destination. | Route inventory has no unowned feature; deep links, refresh, back/forward and saved URLs work. CodeForge explanation practice leads into the main interview flow. G2/G3. | Frontend lead + product lead |
| R34 | **High:** `runner.js`, WASM, fonts or static chunks load from the wrong root or remain stale across deploys. | Define asset paths and build steps explicitly, use versioned assets and compatibility checks, and rehearse deployment-cache behavior. Any temporary multi-zone setup must reserve routes and asset prefixes. | Cold/warm cache and old-tab/new-deploy tests start the correct runner and recover from stale chunks. No root asset collision. G2. | Frontend lead + release lead |
| R35 | **High:** Combining Node/Next/React versions, global CSS or providers breaks one application. | Select a tested compatible runtime and pinned dependency set. Port bounded components, scope styles and state, and preserve a single top-level auth context. Do not merge lockfiles wholesale. | Production build, hydration, editor/voice interaction and route navigation pass with the selected versions. CSS/provider leakage checks cover both products. G2. | Frontend lead |
| R36 | **High:** Copying CodeForge's global security headers disables interview microphones or unnecessarily weakens all routes for WASM. | Reconcile CSP, worker and microphone policy by actual route/capability. Keep interview microphone permission; grant only required coding worker/WASM permissions. | Production-header browser tests cover microphone capture, worker startup, denied unexpected connections and supported browsers. G2. | Security lead + frontend lead |
| R37 | **High:** Navigation, login expiry or an interview launch discards an unsaved coding draft. | Autosave with visible sync status, recoverable local cache and conflict handling. Save an immutable selected artifact before handoff; gate navigation only when there is actual unrecoverable work. | Refresh, browser crash, token expiry and interrupted handoff recover the intended draft and show accurate saved/pending state. G2/G3. | Frontend lead |
| R38 | **High:** Porting only visible screens drops working hints, notes, diagnostics, debugging, projects, incidents, bookmarks or export. | Maintain a feature-parity inventory of the current unified CodeForge folder. Give each supported feature a retained, replaced or explicitly deferred destination with a working fallback. | Acceptance walk-through maps every inventory item to a tested route/action; no removed feature is advertised as available. G2. | Product lead + QA lead |
| R39 | **High:** The unified editor/journey becomes unusable by keyboard, screen reader, mobile users or students with speech limitations. | Design keyboard and screen-reader paths, responsive layouts, reduced motion and equivalent supported text interactions. Preserve work when permissions or speech input fail. | Keyboard-only and assistive-technology review, narrow viewport checks and denied microphone tests complete the core journey. G2/G3. | Accessibility lead + QA lead |
| R40 | **High:** Two recommendation engines prescribe contradictory, inaccessible or endlessly repeated missions. | Make PrepVista the mission coordinator; CodeForge supplies candidate activities and evidence only. Check prerequisites, availability and entitlement; permit skip/defer and explain recommendations. | Sparse, strong, stale and conflicting profiles receive a launchable mission. Unavailable content or repeated failure yields a useful alternative without a loop. G3. | Product lead + learning lead |

The preferred target is one Next.js frontend. A temporary multi-zone arrangement
adds routing, asset and hard-navigation constraints; evaluate it only when it
reduces migration risk. See [Next.js multi-zone guidance](https://nextjs.org/docs/app/guides/multi-zones).

## F. Entitlements, charging and commercial behavior

| ID | Risk / severity | Proposed solution | Required verification and gate | Responsible role |
| --- | --- | --- | --- | --- |
| R41 | **High:** A coding launch consumes interview allowances or changes existing paid plan limits. | Define separate capability grants and usage dimensions. Preserve current interview allowance semantics and historical plan access until an explicit compatible commercial change is approved. | Existing Free/paid/override/org entitlement fixtures produce the same interview access before and after coding integration. G2. | Billing lead + product lead |
| R42 | **High:** Personal and sponsored entitlements cause ambiguous payer selection or charge both parties. | Define deterministic applicable-grant selection with a visible payer/sponsor when relevant. Bind the chosen grant to the reservation and activity; never infer solely from current dashboard route. | Accounts with overlapping grants, multiple organizations and exhausted sponsored pools charge exactly the intended allocation or refuse launch. Before paid coding/G6. | Billing lead |
| R43 | **Critical:** Parallel launches or retries spend the same credit twice or exceed pooled allocations. | Atomically reserve usage with idempotency scoped to user, operation and grant; settle or release once. Include pooled organization budget checks in the transaction boundary. | Concurrent and retried requests across instances yield one reservation/effect per intended operation and never overspend the allocation. Before metered launch. | Billing lead + backend lead |
| R44 | **High:** Provider failures, canceled jobs or abandoned sessions leave unfair charges or leaked reservations. | Define chargeable outcomes separately for AI, execution and interview use. Reconcile orphaned reservations; make refund/release operations idempotent and observable. | Crash at each reserve/execute/settle step, cancel and retry; ledger reconciliation matches policy with no permanent unknown balances. Before metered launch. | Billing lead + reliability lead |
| R45 | **High:** New readiness/report APIs bypass Free history gates or break existing paid history access. | Apply existing access policy at canonical APIs and exports, including source drill-down. Separate permitted current guidance from gated historical detail without losing underlying evidence. | Free, paid, expired and organizational plans attempt list, detail, export and direct-link access. Results match existing promises. G2/G5. | Backend lead + product lead |
| R46 | **High:** Subscription or organization allocation expiry changes mid-session and causes work loss or unauthorized new usage. | Define launch-time versus continuation rights explicitly. Preserve saved work, recheck new spend, and provide readable recovery when a grant expires. | Expire/revoke grants between launch, autosave, mentor call, finish and report access; no silent deletion, new unauthorized spend or inconsistent ledger. G2/G6. | Billing lead + identity lead |
| R47 | **High:** Mentor retries, longer context, server validation or bulk imports create uncontrolled AI/compute cost. | Estimate unit costs from measured workloads; bound context, concurrency and retries; maintain per-capability budgets and circuit breakers. Do not bill imports as new attempts without an explicit policy. | Load tests and failure simulations show bounded spend; alerts and kill switches work for each expensive capability. G2 and before adding trusted execution. | Reliability lead + AI lead |
| R48 | **High:** Pricing or upsell decisions manipulate readiness labels or block the explanation of a negative assessment. | Keep measurement policy independent of plan selection and marketing. Make coverage limitations and the basis of displayed readiness understandable within applicable access rights; distinguish lack of evidence from lack of subscription. | Identical evidence under different plans yields the same permitted assessment meaning. Product review rejects pay-to-improve-score behavior. G5. | Product lead + measurement lead |

Residual commercial decisions: coding prices, sponsored payer precedence and
chargeable failure outcomes remain product decisions. Unresolved decisions block
the affected paid capability, not all unmetered integration work.

## G. Reliability, release and recovery

| ID | Risk / severity | Proposed solution | Required verification and gate | Responsible role |
| --- | --- | --- | --- | --- |
| R49 | **Critical:** An activity commits but its evidence event is lost, or an event appears for rolled-back work. | Write domain state and outbox record in one database transaction. Publish asynchronously with recoverable delivery state; keep live interview completion independent of projection success. | Inject failure before/after commit and publish; every committed eligible record eventually projects and no rolled-back activity projects. G3. | Evidence-platform lead |
| R50 | **High:** Duplicate, reordered or poison events corrupt projections or stall the whole queue. | Use idempotent consumers, source/version checks, bounded retries, dead-letter handling and per-stream isolation. Make replay/rebuild an operated tool with observable watermarks. | Replay duplicates, reorder versions and inject malformed events; healthy streams progress and corrected replay produces the same result. G4. | Evidence-platform lead + reliability lead |
| R51 | **High:** Late grading or policy changes overwrite newer evidence and produce inconsistent dashboard/report snapshots. | Link jobs to immutable attempt, artifact and grader versions. Store authoritative results separately from current projections; publish snapshots atomically with input/version watermarks. | Finish old jobs after newer ones, change role during projection and load report/dashboard concurrently. Each displayed snapshot is internally consistent and source-traceable. G4. | Evidence-platform lead |
| R52 | **Critical:** Schema changes or a large backfill lock production tables, exhaust database resources or damage existing sessions. | Use expand/contract compatibility, bounded checkpointed backfills and measured lock/statement budgets. Rehearse on production-shaped data; avoid destructive changes in initial rollout. | Measure migration and backfill under representative interview load; cancellation/resume and old/new application compatibility work before production execution. G1/G4. | Database lead + reliability lead |
| R53 | **High:** Coding AI, runner or readiness outages cascade into login, dashboard or active interview failures. | Isolate dependency timeouts, concurrency pools and circuit breakers. Persist core activity independently; expose pending/unavailable optional results with retry. Never synchronously fan out to every module on the interview hot path. | Fail each optional dependency while completing a legacy and V2 interview, login and draft save. Existing core flows remain usable. G2/G3. | Reliability lead + backend lead |
| R54 | **High:** `/api/awake` reports false health from a root 200 or holds requests through roughly 61.5 seconds of sequential probe budgets. | Separate liveness, required dependency readiness and optional feature status. Use bounded/coalesced probes, short-lived caching and fixed allowed targets; do not add coding fan-out to the current route. | Root HTML 200 with failed API, cold start, slow/unreachable backend and concurrent wake calls produce bounded, truthful status without probe storms. Before using health for release gating. | Reliability lead |
| R55 | **Critical:** Disabling the integration flag strands newly saved server data or rolls users back to stale anonymous state. | Decouple UI, import, evidence production, projection and readiness visibility flags. Keep compatible read/export access for accepted writes; pause producers or promotion selectively. Roll forward corrupted projections from sources. | Roll back after real new drafts, imports and paid activity exist in a staging rehearsal. Users can recover all committed work and usage ledgers reconcile. Before each rollout expansion. | Release lead + data lead |
| R56 | **Critical:** Backups exist but restore cannot recover source records, artifacts, ledgers and readiness consistently. | Define recovery objectives from measured operations; include object storage, DB, configuration, deletion ledger and content versions. Restore sources first, reconcile ledger, then rebuild projections. | Perform an actual isolated restore and reconcile counts, hashes, ownership, usage and sampled snapshots. Assign incident ownership and record achieved recovery times before broad rollout. | Reliability lead + data lead |

Operational thresholds must be measured against existing traffic. The main plan's
initial latency/freshness budgets are proposed rollout alarms, not observed SLOs.
An unexplained tenant leak, wrong charge, lost committed write or incorrect evidence
promotion is a hard stop even when aggregate availability looks healthy.

## H. Governance, privacy, validation and maintainability

| ID | Risk / severity | Proposed solution | Required verification and gate | Responsible role |
| --- | --- | --- | --- | --- |
| R57 | **High:** Reused source/content/assets have unresolved rights, and an old provenance review is assumed to cover a different current snapshot. | Inventory exact current files and dependencies; record origin, license/ownership and required notices. Isolate uncertain material or replace it with cleared implementation/content. | A scoped reuse manifest is reviewed before each affected module ships. Missing evidence blocks that material, without making unsupported claims about unrelated user code. G0/G2. | Engineering lead + source-rights reviewer |
| R58 | **High:** Integration changes collection, provider disclosure, retention or institutional use beyond the applicable product policy. | Map actual data classes, purpose, recipients and retention to existing commitments. Minimize collection and obtain appropriate policy review before new uses; implement export/deletion consistently. | Review a real end-to-end data-flow sample, provider payload and export/deletion result against the applicable policy. No invented retention period is treated as law. G2/G6. | Privacy lead + product lead |
| R59 | **High:** Small-cohort dashboards identify students indirectly or turn practice signals into unsupported hiring rankings. | Limit institutional views to authorized purposes, apply approved small-cohort suppression and avoid default public leaderboards. Preserve coverage/confidence and constrain export/detail permissions. | Tiny cohorts, filter combinations and repeated queries cannot bypass the approved disclosure rules. Intended institutional use is reviewed before G6. | Privacy lead + institution product lead |
| R60 | **High:** Rubrics or recommendation policies systematically disadvantage language, accessibility or education groups. | Review rubric relevance, accessible alternatives and subgroup behavior where sufficient appropriate data exists. Measure reviewer disagreement and abstain on insufficient evidence; do not infer protected traits from artifacts. | Qualified reviewers compare representative cases and error patterns. Document gaps, corrective actions and limits before expanding a role/language population. G4/G6. | Measurement lead + accessibility lead |
| R61 | **High:** Passing mocked tests is taken as proof that real auth, RLS, microphone permissions, providers or migrations work. | Keep a layered test matrix and label test environments. Add production-shaped database/auth tests, real browser permission checks and controlled staging provider smoke tests alongside mocks. | Release evidence states exactly what used mocks and what exercised real boundaries. No current standalone test count is used as integration certification. G2 and each later gate. | QA lead + release lead |
| R62 | **High:** New dependencies, copied lockfiles or stale WASM/runner assets introduce vulnerable or unreproducible builds. | Pin the selected compatible toolchain, retain dependency/license inventory, verify generated runner output and use reviewed dependency updates. Track patch ownership across parent and coding modules. | Clean production build from locked inputs, dependency review and artifact/version checks pass for the actual integrated package set. G2. | Engineering lead + security lead |
| R63 | **High:** Logs, traces, analytics or support exports expose raw code, resumes, access tokens or private interview answers. | Log identifiers and bounded diagnostic metadata; redact secrets and sensitive payloads. Restrict telemetry access/retention and provide an audited, scoped support path. | Seed canary sensitive values, exercise failures and inspect logs/traces/analytics/export destinations; no unintended payloads escape. G2/G6. | Reliability lead + privacy lead |
| R64 | **High:** Unowned residual risks, stale plans or an unrehearsed support process survive gradual rollout. | Assign named owners and release evidence to this register. Reconcile earlier ADRs, maintain a known-limitations list, provide student correction/recovery paths and schedule post-rollout review. | Run a cross-team release and incident exercise using lost-draft, disputed-readiness and wrong-scope scenarios. Every open blocker has a bounded action; no critical issue is accepted by omission. Each release gate. | Release lead + product lead |

## Closure and release decision

Before any implementation PR, link its affected IDs and the applicable gate.
Closing a row requires both technical verification and a named operational owner.
When a feature is intentionally deferred, record the disabling control and verify
that no alternate API, direct URL, worker or import path exposes it.

The minimum release evidence is:

1. An accepted source/feature inventory and one student-journey walkthrough.
2. Auth, tenant, object-access and account-switch tests using realistic identities.
3. Migration, import, concurrent-write, outbox and recovery rehearsal results.
4. Preserved interview behavior and entitlements, plus truthful language support.
5. Measured dependency isolation, usage reconciliation and rollback behavior.
6. For readiness: approved evidence eligibility, replayable snapshots, reviewer
   evaluation and explicit limitations for sparse, stale or conflicting evidence.
7. For organizations: separately approved visibility, disclosure and usage rules.

Do not close risks merely because a feature flag exists. Prove the flag prevents
the hazardous behavior and preserves already accepted data. Do not treat a prior
standalone build or mocked interview test suite as validation of this integration.

The safe release decision can be narrower than the full target: authenticated
coding practice with saved work and a clear next mission is valuable while stronger
readiness claims remain disabled. Broaden the product only as its evidence and
operational boundaries satisfy their gates.
