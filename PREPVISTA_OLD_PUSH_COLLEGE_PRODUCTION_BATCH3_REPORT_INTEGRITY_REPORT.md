# PrepVista Old-Push College Production Batch 3: Evaluation + Scoring + Report Integrity

Date: 2026-10-04 (Asia/Calcutta).

Decision: **A - Batch 3 qualified for Batch 4**. Backend: **654 passed, zero
failures**. Frontend: **124 passed** (56 auth, 38 interview/STT, 30 report integrity).
Typecheck, lint and diff checks pass. This is local stabilization qualification;
the integration and operational release work below remains. **Do not deploy.**

Workspace: `G:\PrepVista-Old-Push`; branch `main`; unchanged HEAD:
`24649a003336255b3d2830d9e3b9b8447bbf6cad`. No commit or push.

No production connection, live provider request, database/schema change,
migration execution or deployment occurred. `C:\PrepVista-AI` was not accessed
or modified. Pre-existing `check_db.py` and `check_db_insert.py` were untouched
and not run. The three earlier batch reports remain byte-for-byte unchanged.

## Actual pipeline traced before correction

The current Old-Push pipeline uses the existing terminal ledger, evaluations and
JSONB runtime state. No new persistence architecture was introduced.

| Stage | Actual files / functions |
| --- | --- |
| Answer and evaluation | `interviews_answer.submit_answer` -> existing locked transaction and `evaluate_single_question` -> `evaluator_scoring._evaluate_question_core`. Current-operation provider measurements are validated before normalization. |
| Terminal evidence | Unchanged `interview_terminal` registers and terminalizes six outcomes in `runtime_state.question_records`. |
| Score arithmetic | `evaluator_scoring.compute_final_score` -> `interviewer_session.finish_session` -> stored `final_score`, `rubric_scores` and `runtime_state.final_summary.assessment`. |
| Read projection | New `score_semantics.assessment/project_session/project_sessions/org_measurement_rows/project_skill_rows` read actual evidence without rewriting finished rows. |
| Skills and student summaries | `analytics_student.derive_skill_score_rows` and existing synchronization; `dashboard.get_dashboard/get_session_history/get_skills`; analytics/student-growth/cohort helpers. |
| Owner JSON and PDF | `reports.get_report/download_pdf` -> `report_generator.generate_pdf_report` -> professional FPDF renderer or `report_helpers._minimal_pdf_report`. |
| Public share | `reports.get_shared_report` retains consent/token lookup and limited disclosure, adding sanitized terminal status/coverage. |
| College and platform | `org_college_analytics` dashboard/performance/growth/readiness/student performance/command centre/leaderboard; `org_college_helpers`, `org_admin_helpers` and `org_admin_analytics` summaries/exports. |
| Basic roster | `org_college_students.list_students/get_student` and enrollment response; `org_admin_analytics.get_org_students_admin`. Raw snapshot aliases are projected too. |
| Placement eligibility | `placement_drives` uses projected tenant-session evidence; unavailable/partial readiness stays unavailable to performance rules. |
| Exports and schedules | `org_college_analytics.export_student_reports`, cohort/organization exports; unchanged `report_schedules._render_schedule_csv` calls that same student export. No delivery worker/email ran. |
| Frontend | Shared `ScoreSummary`/`score-semantics`; actual history, student dashboard, interview completion, report/Intel, analytics and college preview/API adapters; served `command-centre.html` and `scoreboard.html`. |

Observed gaps included empty aggregates returning zero, missing communication
and report dimensions defaulting to zero, coverage reducing ability score,
cached/no-session At Risk, missing Intel skill values, and inconsistent partial
status across readers. Those defaults are corrected at their actual consumers.

## Null, zero, coverage and evaluation state contract

Finite numeric values in range are measurements; zero is valid. Missing,
boolean, NaN, infinite, invalid and out-of-range scores do not create evidence.
Per-answer scores retain the existing 0-10 scale; overall scores are 0-100.

| Outcome | Meaning |
| --- | --- |
| EVALUATED with valid evaluation | Normal measured score, including genuine zero, with persisted assistance provenance. |
| EVALUATED with missing/invalid evaluation | Pending, or explicitly unavailable when existing evidence says so; no synthetic zero/evaluation. |
| NO_ANSWER / SKIPPED | Authentic existing intentional-zero policy, represented during aggregation without fabricated normal evaluation rows. |
| TRANSCRIPTION_FAILED | Not measured; diagnostic capture remains and is excluded from the ability denominator. |
| UNINTELLIGIBLE | Distinct successful-but-unusable capture outcome; not measured, without asserting infrastructure failure or candidate weakness. |
| ABORTED / registered open question | Not measured; no implicit abandonment score. |

Coverage exposes actual asked, measured, intentional, scoreable, pending,
unavailable and unmeasured counts, plus measured/scoreable percentages. Its
denominator is actual asked questions. Existing planned completion and usage
counters remain separate. Coverage never multiplies ability score.

COMPLETE means all asked outcomes are scoreable; PARTIALLY_COMPLETE means only
some are scoreable. With no scoreable result, pending evaluation gives PENDING,
unavailable required evaluation evidence gives UNAVAILABLE, and no measurable or
intentional evidence gives NOT_MEASURED. Mixed states stay visible per question.
Labels: Measured, Partially measured, Evaluation pending, Evaluation unavailable,
Not measured. All-unmeasured current-contract interviews have NULL overall score,
empty category evidence and no readiness claim. Historical ambiguity is handled
separately below.

## Exact scoring formula

Let V contain valid EVALUATED rows plus intentional-zero NO_ANSWER/SKIPPED
entries. Exclude failed, unintelligible, aborted, missing and invalid measurement.

```text
C_c = round(mean(valid per-question scores in rubric category c), 1)
```

Communication retains its dedicated aggregation: when valid communication_score
values exist, their rounded mean is the communication category value. Missing
values are excluded; real zero is included. Intentional-zero entries retain the
existing communication-zero policy. Missing rubric is not inferred as technical
depth. Categories without evidence stay absent/null and display Not measured.

Configured weights in `app/config.py` are unchanged:

| Category | Weight |
| --- | ---: |
| introduction | 0.08 |
| technical_depth | 0.21 |
| project_ownership | 0.17 |
| communication | 0.13 |
| problem_solving | 0.13 |
| behavioral | 0.13 |
| situational_judgment | 0.05 |
| creative_thinking | 0.05 |
| ai_tool_fluency | 0.05 |

Let W contain configured categories with valid evidence:

```text
V empty: final_score = NULL
sum(weights in W) > 0:
  final_score = clamp(round(10 * sum(w_c * C_c) / sum(w_c)), 0, 100)
otherwise:
  final_score = clamp(round(10 * mean(scores in V)), 0, 100)
```

Rounding retains Python's existing behavior. Only present weights enter the
denominator. The previous coverage multiplier is removed. Three asked questions
with one 8/10 evaluation and two transcription failures retain 80/100 with
**1/3 measured**. An actual three-question flow proves three distinct terminal
records and completion/reload score/status/coverage agreement.

Current-contract contributions expose actual weighted components only when their
rounded sum agrees with the score. Legacy reports do not acquire an invented new
formula. Intel's fabricated waterfall baseline/penalties were removed; it renders
actual contributions and final score.

## Defaulting audit and evaluation failure

Searches covered empty averages, score/default coercions, SQL COALESCE, nullable
categories, truthiness, readiness/risk, trends, percentiles and report language
through the actual pipeline. Occurrences were classified by their input contract:

| Pattern / path | Disposition |
| --- | --- |
| Empty final aggregate, absent rubric/communication, completion penalty | Corrected to NULL/absent evidence, present-weight arithmetic and separate coverage. |
| JSON/PDF missing evaluation dimensions/categories | Corrected to null/Not measured; detailed interpretation requires measured inputs. |
| Incomplete/malformed provider success object | Current answer operations reject missing measurement before legacy normalization can supply heuristics/defaults. Existing atomic rollback/retry remains. |
| Canonical answer-strength counts with missing/stale rows | Count valid measured rows and current terminal EVALUATED evidence only. Shared zero does not become silence merely because public scope omits answer text. |
| Cached tier/risk/latest score and raw roster aliases | Read-only projection prevents stale At Risk. Student identity and performance responses agree. |
| Dashboard SQL average/best and stale derived skills | Aggregate actual projected evidence; conclusive system-failure zero is excluded. Current skill values are projected from measured evaluations without writing caches. |
| College/platform averages and latest NULL after older measured score | Project scoped evidence before rollups/ranking; preserve latest NULL rather than substitute an old average. Empty averages stay NULL. |
| Frontend KPI zero fallback, Intel missing dimensions/durations, live rank defaults | Neutral status, omitted missing points, unranked NULL; real zero stays numeric/rankable. |
| Remaining `score or 0` in strength helpers, PDF palettes, neural input | Retained where valid-evaluation/full-feedback gates first prove numeric measurement; missing evidence cannot reach these defaults on current paths. |
| Sort keys and bar widths | Layout/order fallbacks after explicit NULL distinction; they do not emit a zero score or classification. |
| Counts, timers, duration counters, quota, empty distribution counts | Genuine counters/layout, retained separately from scores. |
| Legacy normalization/heuristic helpers | Compatibility remains; current operations validate provider measurement and roll back failures. Reports do not invoke these helpers to reevaluate finished history. |
| Historical SQL defaults/functions/triggers | Migration bytes untouched. Application readers project evidence; direct DB consumers/installed jobs remain operational attestation work. |

No report read, PDF or export calls a provider to manufacture missing evaluation.
Candidate answers remain stored. Current synchronous evaluation failure retains
Batch 2 rollback/retry; finished missing-evaluation records become pending or
unavailable without repair writes.

## Surface behavior and evidence gates

Owner JSON exposes terminal outcomes, per-question state, overall state, coverage
and truthful categories. Reload reads actual evaluations/asked questions rather
than stale zero summaries. Primary and fallback PDFs contain appropriate Not
measured, Evaluation pending, Evaluation unavailable and Partially measured
wording; genuine zero still prints 0/100.

History/dashboard/completed-result/college-student cards use shared measurement
presentation. Partial numeric scores retain value alongside coverage. NULL,
pending and unavailable have neutral labels and no red ability-failure badge.
Missing categories stay neutral rather than create chart zero points. College
preview/export includes latest status/coverage; empty best-score KPI is neutral
while a real best score zero remains visible.

Readiness requires complete assessment, at least one actual measured answer and
numeric overall score. Partial results are conservatively withheld. College
Ready/Almost Ready/Developing thresholds retain existing minimum evidence counts;
unmeasured/partial sessions cannot satisfy them. Complete measured zero retains
the authentic performance-risk policy. Missing/partial results do not assert
intervention, stuck performance or time-to-readiness forecasts.

Detailed strengths/weaknesses and current premium/AI coaching additionally require
the relevant persisted subscores. Missing communication cannot create a weakness.
Historical premium helper behavior remains for authentic complete numeric
evidence; missing/partial reports withhold claims. Intel requires measured
dimensions before advanced classification and does not invent missing skills.

NULL stays excluded from averages/trends. A later unmeasured interview does not
become a 72-to-zero decline; latest remains unavailable and derived change claims
are withheld. College percentiles/leaderboard leave NULL visible and unranked;
zero stays numeric and rankable. Platform rollups project active membership and
matching organization-session evidence. Owner/tenant filters, pagination, auth
and sharing consent remain enforced.

Public sharing adds sanitized question/outcome/state/score records. It does not
expose raw answers, audio/evidence, instance IDs, identity or ideal answers beyond
existing scope. Scheduled CSV rendering produces identical tested export content;
no email or schedule-processing worker ran.

Persisted independent, hint_assisted, answer_guided and unknown provenance survives
report reads. Unknown is not silently called independent. Existing hint/guidance,
viewed-time and answer-attribution regressions pass; deep assistance is Batch 4.

## Historical compatibility and prior batches

Finished session/evaluation/conversation rows are never rewritten by projections.
A terminal ledger conclusively identifies a stale system-failure zero as
unmeasured. Ambiguous legacy stored zero stays numeric, with pending/unavailable
evidence status and withheld readiness; no infrastructure failure is guessed.
Legacy NULL aggregate stays NULL even with individual evaluation rows, exposing
pending aggregation. No historical formula is retrospectively applied without
current-contract terminal evidence.

Existing derived-skill synchronization/backfill infrastructure was not redesigned.
No new history repair, evaluation backfill or migration was introduced. Offline
read-preservation tests stub unrelated backfill services and compare actual stored
data before/after report/history/dashboard reads.

Before/after SHA-256 audit: **310 baseline files**, **277 unchanged**, **33 changed
existing files**. Six new code/test/report files make **39 Batch 3 files**. All
**38 SQL migrations**, all three prior reports and frontend lockfile remain
byte-for-byte unchanged. Manifest digest:
`f4775257b28def0eb14633828c7b61ef311332d968effa416c0fb93291f92949`.
Temporary `.batch3-preservation.json` is removed after final verification.

Batch 0 history/access/startup/readiness, Batch 1 temporary-auth/session/cache/OAuth
and Batch 2 STT settlement/fallback/six outcomes/exact terminal coverage/rollback/
stable retries/idempotent finish regressions pass. Auth/cache/OAuth/STT files are
unchanged. `api.ts` changes are college score adapters; the interview page receives
score presentation changes only.

## Validation

Focused scoring/report changes were tested first, then prior-batch groups and the
full backend suite. Final commands/results:

| Command | Result |
| --- | --- |
| `python -m pytest tests/test_batch3_report_integrity.py tests/test_interview_logic.py -q --tb=short` | 201 passed, 0 failures |
| `python -m pytest tests/test_batch3_report_integrity.py tests/test_batch2_interview_stt.py tests/test_guided_assistance.py tests/test_batch0_history_safety.py tests/test_batch0_startup_safety.py tests/test_batch1_auth_reliability.py tests/test_auth_identity.py tests/test_interview_logic.py tests/test_command_centre_contract.py tests/test_placement_drives_rules.py -q --tb=short` | **386 passed, 0 failures** |
| `python -m pytest tests -q --tb=short` | **654 passed, 0 failures** |
| `npm run test:auth` in frontend | 56 passed; no failures/skips |
| `npm run test:interview` in frontend | 38 passed; no failures/skips |
| `npm run test:report` in frontend | 30 passed; no failures/skips |
| `npm run typecheck` in frontend | PASS |
| `npm run lint` in frontend | PASS; zero warnings |
| Both served college HTML inline-script syntax checks | PASS |
| Changed Python AST / duplicate literal-key review | PASS |
| `git diff --check` | PASS |

New backend coverage: **93 cases**. It covers all six terminal outcomes,
positive/zero/pending/unavailable measurement, missing/partial categories,
intentional zero, denominators, actual completion/report/reload/history/share,
primary/fallback PDF text, persisted guidance provenance, provider measurement
rejection, dashboard/skill projection, college minimum evidence, actual scoped
roster/student-detail/platform rollups, CSV/JSON/scheduled rendering, NULL ranking,
historical preservation and the actual three-question terminal invariant.

Frontend tests execute actual TypeScript/TSX components/pages and live college
JavaScript functions. Five states are exercised in ScoreSummary/history/student
dashboard/owner report/college preview, plus Intel gates/authentic contributions,
live NULL rank/percentiles and actual college API adapters. Existing auth/STT
suites execute unchanged handlers using controlled mocks.

Three existing test files update stale expectations/source contracts for intended
NULL/separate-coverage/neutral-tier changes. Positive scores, zero and existing
behavior assertions remain. No test was skipped, expected-failed or suppressed.
Dependency versions and lockfile remain unchanged.

Backend fixtures execute actual functions and relevant SQL in owned in-memory
SQLite with narrow PostgreSQL adaptations and mocked service boundaries. Tenant
projection tests enforce query contracts with mocks. Socket/DNS guards remain;
no PostgreSQL, Redis, Supabase, LLM, storage or production request ran. PDF tests
extract text from actual bytes, including download; they do not attest layout.
Frontend tests are offline module/render-handler tests, not real-browser or
microphone end-to-end evidence.

Prior-regression/full backend runs report **48 warnings**: two existing dependency
warnings and 46 existing datetime/FPDF deprecations exercised by PDF tests. No
warning suppression or dependency update was added.

## Remaining release work

- Isolated PostgreSQL integration must verify schema/roles, real row locks,
  transactions, constraints, readiness and deployed ledger. Bulk projections add
  read load proportional to scoped history; measure query latency/memory and
  college concurrency before release.
- Installed trigger/profile/organization caches and direct DB consumers remain
  operational attestation work. Application projections do not repair them or
  authorize schema changes. Inconclusive historical evidence stays unresolved.
- Real-browser tests should verify layouts, chart gaps, downloads and PDF visual
  pagination. Offline evidence does not attest real-browser accessibility/layout.
- Existing Batch 0 schema/legacy-assistance constraint, DB-role, cron/storage
  lifecycle and account-erasure review work remains. Batch 1 browser/provider OAuth
  and Batch 2 microphone/STT/provider/storage integration remain.
- Hiring-probability calibration and broader product strategy were not redesigned;
  advanced claims remain subject to evidence gates and separate product review.

Database changes: **NONE**. Migration changes: **NONE**. Historical rows rewritten:
**NO**. Production connectivity: **NONE**. Deployment: **NO**.
Ready for Old-Push Batch 4: **YES**.

## Files changed (39)

33 existing files and six new files, including this report:

```text
app/routers/dashboard.py
app/routers/org_admin_analytics.py
app/routers/org_admin_helpers.py
app/routers/org_college_analytics.py
app/routers/org_college_helpers.py
app/routers/org_college_students.py
app/routers/placement_drives.py
app/routers/reports.py
app/services/analytics_cohort.py
app/services/analytics_student.py
app/services/evaluator_scoring.py
app/services/interviewer_session.py
app/services/interview_summary.py
app/services/report_generator.py
app/services/report_helpers.py
app/services/report_render.py
tests/test_command_centre_contract.py
tests/test_interview_logic.py
tests/test_placement_drives_rules.py
frontend/src/lib/api.ts
frontend/src/app/analytics/page.tsx
frontend/src/app/history/page.tsx
frontend/src/app/org-admin/page.tsx
frontend/src/app/student-dashboard/page.tsx
frontend/src/app/report/[id]/page.tsx
frontend/src/app/report/[id]/_intel/dashboard.tsx
frontend/src/app/report/[id]/_intel/explain.ts
frontend/src/app/report/[id]/_intel/model.ts
frontend/src/app/org-admin/reports/page.tsx
frontend/src/app/interview/[id]/page.tsx
frontend/package.json
frontend/public/command-centre.html
frontend/public/scoreboard.html
app/services/score_semantics.py (new)
tests/test_batch3_report_integrity.py (new)
frontend/src/lib/score-semantics.ts (new)
frontend/src/components/score-summary.tsx (new)
frontend/tests/report-integrity.test.mjs (new)
PREPVISTA_OLD_PUSH_COLLEGE_PRODUCTION_BATCH3_REPORT_INTEGRITY_REPORT.md (new)
```

## Files inspected (53)

38 code/config/test files listed above, excluding this report, plus these 15
supporting focused reads. Large files were read in relevant sections. Attachments,
search-only hits and hash-only checks are excluded. The 38-file migration byte
audit is separate from this focused inspection count.

```text
app/config.py
app/services/interview_terminal.py
app/services/placement_readiness.py
app/services/analytics_helpers.py
app/services/evaluator_feedback.py
app/services/evaluator_grounding.py
app/services/report_schedules.py
app/routers/interviews_answer.py
tests/test_batch0_history_safety.py
tests/test_batch2_interview_stt.py
tests/conftest.py
frontend/tests/auth-reliability.test.mjs
frontend/tests/interview-stt.test.mjs
frontend/src/app/org-admin/layout.tsx
app/database/migrations/017_college_organization.sql
```

STOP. DO NOT DEPLOY.
