# Interview Orchestrator V2 delivery

## 1. Repository audit

The implementation extends the existing FastAPI/asyncpg/Supabase backend and
Next.js/React frontend. Resume parsing, authentication, STT/audio, billing,
quotas, history retention, organization APIs and legacy reports are preserved.
The full pre-change trace is in `INTERVIEW_ARCHITECTURE.md`. Unrelated CodeForge,
AceApt and prototype directories were not changed. Pre-existing uncommitted
delivery and transcription fixes were retained.

## 2. Root cause

The old plan advanced by conversational turn while downstream answer-led
overrides could replace primary questions with probes. Follow-up classification
was inferred from text, without a durable primary anchor and separate primary
counter. A topic-change request did not guarantee a primary family transition.

## 3. Architecture changes

`InterviewOrchestrator` owns transitions. `PrimaryQuestionPlanner`,
`FollowUpController`, `CoverageTracker`, `EvidenceLedger`, `DifficultyController`
and `TimeBudgetManager` are separate pure components. A small persistence adapter
runs under the existing row lock and receipt transaction. Session runtime JSONB
stores the blueprint, anchors, issued questions, evidence, claims and version.

## 4. Files changed by this task

New backend files:

- `app/services/interview_catalog.py`
- `app/services/data/interview_questions.json`
- `app/services/interview_orchestrator.py`
- `app/services/interview_v2_session.py`
- `app/routers/interview_practice.py`
- `app/database/migrations/037_interview_coaching_v2.sql`

Integrated backend/configuration files:

- `.env.example`, `app/config.py`
- `app/services/interviewer_session.py`, `interviewer_coverage.py`
- `app/services/interview_summary.py`, `evaluator_scoring.py`
- `app/routers/interviews.py`, `interviews_session.py`, `interviews_answer.py`, `reports.py`

Frontend:

- `frontend/src/app/interview/setup/page.tsx`
- `frontend/src/app/interview/[id]/page.tsx`
- `frontend/src/app/report/[id]/page.tsx`
- `frontend/src/app/dashboard/page.tsx`
- New `frontend/src/components/interview-evidence-report.tsx`
- New `frontend/src/app/interview/practice/page.tsx`

Validation/docs:

- `tests/test_interview_orchestrator_v2.py`, `tests/test_interview_v2_integration.py`
- Extended pre-existing `frontend/e2e/journeys.spec.ts`
- `scripts/demo_interview_v2.py`, generated `docs/INTERVIEW_SAMPLE_TRANSCRIPT.md`
- Architecture, question, follow-up, evaluation, report, safety, migration,
  test-matrix and delivery documents in `docs/`.

Other changes shown by `git status` predate this task and are not claimed here.

## 5. Database migration

Migration 037 adds owner-scoped answer retries and story-bank storage, indexes,
cascades and RLS. No destructive migration or historical backfill. Existing
migration 036 provides the answer receipt prerequisite. Production/staging
migrations have not been executed in this task.

## 6. API contracts

All changes are additive: setup context/mode fields and blueprint; answer/state
progress and timing; finish/report evidence; owner-scoped retry, stories and
practice-history endpoints. Exact paths/bodies are in `MIGRATION_NOTES.md`.
Existing setup plan authorization and Free history boundaries remain enforced.

## 7. State machine

`BLUEPRINT_READY → AWAITING_ANSWER → FOLLOWUP_DECISION` either issues a bounded
probe or closes the anchor and advances a primary. The final primary enters
`CLOSING`; its answer or early/deadline finish enters `FINISHING`. Existing finish
processing persists `COMPLETED` in V2 and `FINISHED` in the compatible session
column. Intermediate phases are atomic within the transaction. Clarification
and transcription retry retain the same question. Exact finish replay uses a
stored completion response.

## 8–10. Primary, follow-up and coverage policy

Blueprint priority selects eligible unasked primary IDs across distinct families.
Only project defense permits deliberate family concentration. Time is reserved
for remaining breadth and closing. Each probe consumes both anchor and session
allowance; repeated gaps/questions are rejected. Resolved evidence is accumulated
across the anchor, so fixing ownership does not erase a separate measurement gap.
Coverage counts actually asked/answered family instances and references evidence.
See `QUESTION_POLICY.md` and `FOLLOWUP_POLICY.md` for limits and eligibility.

## 11–12. Evaluation and reports

Conservative textual evidence is separate from the existing model score. Provider
or schema failure leaves numeric evaluation unavailable; missing transcripts are
not inserted as zero-score answers. V2 evidence remains accessible independently.
The report leads with coverage, evidence excerpts, unresolved gaps, cautious
resume skill support and three missions, followed by answer retry comparisons.
It does not make calibrated hiring or global competency claims.

## 13. UI

One setup supports all modes and optional context. Live progress displays primary
areas/closing without live evaluator scores; server elapsed time survives reload,
and deadline completion preserves retry protection. The existing report contains
the new evidence section. Dashboard links to practice history, comparisons and
the story bank. Mobile controls, accessible labels and overflow were browser-tested.

## 14–16. Verification

See `TEST_MATRIX.md` for the mandatory 25 acceptance mappings and the integration
boundary. Final results:

| Check | Result |
| --- | --- |
| Python compilation | Passed |
| Full backend tests | 445 passed, including 47 new V2 cases |
| Frontend unit tests | 11 passed |
| Chrome browser tests | 8 passed, including mobile retry and reload expiration |
| ESLint | Passed, zero warnings |
| TypeScript | Passed |
| Next.js production build | Passed; 42 pages generated |
| Patch whitespace check | Passed |

The build used `NEXT_PUBLIC_API_URL=https://api.prepvista.invalid` because this
checkout did not supply a valid production API origin. This is a build-test
placeholder; it must be replaced by the actual API origin for deployment.
An initial browser selector failure was corrected to use the dropdown's
accessible role; the complete final browser run passed. The initial pytest
temporary-directory permission failure was resolved using a workspace-local
temporary directory.

## 17. Remaining limitations

- Current plan allowances remain 5/10/13 total questions. The unrestricted quick,
  standard and full targets are supported by the policy but are reduced in
  production when the selected plan is smaller. No quota increase is hidden.
- The referenced complete HR master bank was not supplied. Catalog source is
  the attached brief's examples, with a modest set of wording variants.
- Live evidence extraction is deterministic text analysis, not a validated
  interviewing-science model. Semantic correctness, contradiction detection,
  advanced resume claim extraction and calibrated confidence remain incomplete.
- Role-specific wording is implemented. Difficulty metadata adapts, but full
  difficulty-specific question/rubric calibration is not implemented.
- JD/company input is candidate-provided and unverified. No company research or
  URL ingestion is performed. Novelty is signature-based; historical weakness
  weighting and semantic duplicate detection remain future work.
- Retry comparisons measure textual evidence changes, not guaranteed learning
  or factual verification. Story Bank is preparation storage and is not yet
  automatically connected to question generation.
- New evidence reports are web-only; PDF evidence export, catalog administration
  UI and new institutional cohort analytics are not implemented.
- PostgreSQL migration execution, real STT/provider reliability and live tenant
  isolation/deletion still need the documented staging verification.

## 18. Verification and deployment steps

`MIGRATION_NOTES.md` gives exact local commands, flag rollback behavior and a
nine-step staging release sequence. No remote deployment was performed.

## 19. Sample interview

`INTERVIEW_SAMPLE_TRANSCRIPT.md` is generated by
`python -m scripts.demo_interview_v2`: 12 primaries, two targeted probes,
multiple distinct families, and final candidate questions. It uses synthetic
answers and an unrestricted test allowance; it is not a real interview record.

## 20. Truth table

| Status | Scope |
| --- | --- |
| WORKING | Integrated bounded orchestration, curated modes/catalog, anchors, coverage, closing, persisted evidence, retries, story storage, history gating, compatibility path and tested UI flows |
| PARTIAL | Role/difficulty sophistication, resume claim breadth, semantic evaluation, novelty and cross-session coaching; plan-limited standard/full coverage |
| MOCKED | Test authentication, speech hardware, browser APIs, provider failures and transactional database fixture; production feature code has no fabricated candidate data |
| FUTURE | Full master-bank import, calibrated rubrics, semantic memory, company verification, evidence PDF export, catalog admin UI and new cohort analytics |
