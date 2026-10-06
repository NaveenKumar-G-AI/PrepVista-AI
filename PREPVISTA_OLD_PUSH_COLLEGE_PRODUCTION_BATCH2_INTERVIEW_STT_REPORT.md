# PrepVista Old-Push College Production Batch 2: Interview + Audio + STT

Date: 2026-10-04 (Asia/Calcutta).

Decision: **A - Batch 2 qualified for Batch 3**. Final backend suite: **561 passed,
zero failures**. Frontend: **94 passed**, comprising 56 auth and 38 interview/STT
cases. Typecheck, lint and diff checks pass. This is local qualification;
production release remains subject to isolated integration and operational
attestation. **Do not deploy.**

Workspace: `G:\PrepVista-Old-Push`; branch `main`; unchanged HEAD:
`24649a003336255b3d2830d9e3b9b8447bbf6cad`. No commit or push.

No production connection, external provider request, database/schema change,
migration execution or deployment occurred. `C:\PrepVista-AI` was not accessed
or modified. Pre-existing `check_db.py` and `check_db_insert.py` were untouched
and not run. Existing Batch 0 and Batch 1 reports remain byte-for-byte unchanged.

## Actual flow traced before corrections

`frontend/src/app/interview/[id]/page.tsx` selects one transcript authority using
`NEXT_PUBLIC_STT_SERVER_ENABLED`, whose existing default remains off.

- Off: browser SpeechRecognition final results feed the authoritative transcript;
  interim recognition is display text only.
- On: `serverStt.ts::ServerSttSession` records complete MediaRecorder windows,
  sends correlated `turn_start / audio / turn_end` frames to
  `app/routers/stt_ws.py`, and assembles final transcripts in window order.
  `stt_service.py::transcribe_audio` uses the existing Groq Whisper provider,
  then optional Deepgram Nova2. The existing REST route is `/api/stt/transcribe`.

Manual/silence submission calls `ApiClient.submitAnswer`, then
`interviews_answer.py::submit_answer`, `interviewer_session.py::process_answer`,
conversation persistence, optional evaluation, next-question orchestration and
runtime-state persistence. End confirmation originally stopped capture, sent an
end marker, and called `finish_session`, which backfilled evaluations, wrote the
finished result and prepared reports. JSON/PDF reports use stored session,
conversation and evaluation state through `app/routers/reports.py`.

## Root causes and corrections

| Root cause | Correction |
| --- | --- |
| Stop used a 50 ms sleep before asynchronous final media events; pending REST transmission was outside the stop promise. | Explicit final media and transmission promises; bounded settlement before submission. |
| WS error/drop/timeout/malformed response did not reliably use REST; connection failure stopped capture entirely. | Exactly one REST attempt for the same complete audio window after WS failure; capture continues with REST after connection failure. |
| Late frames could overwrite or duplicate final text. | Unique window IDs, correlated results, ordered transmission queue and sealed final results. |
| Manual submission and end could read incomplete text. End sent a marker instead of the captured answer. | Freeze input, await capture settlement, persist the resolved transcript/evidence, then finish in the same idempotent operation. |
| Failed end/abort could clear session storage or navigate away anyway. | Preserve session, captured payload and request ID; expose a retry and report closure only after success. |
| STT sent the interview secret where authentication expected the user's JWT. | Use the existing authenticated API access token; retain owner checks. |
| Empty input repeated or disappeared without a terminal answer. | Explicit six-outcome terminal ledger in existing runtime_state JSONB. |
| Unevaluated inserts used invalid rubric/classification values and nullable scores against score NOT NULL. | Unmeasured outcomes are ledger records without fabricated evaluation rows. |
| Finalization backfilled missing/failed capture as empty zero-score evaluations. | Current and active legacy sessions acquire the terminal contract; finalization validates coverage and never evaluates missing text. |
| Retry cache and advancement were outside a transaction. | Lock the session row; commit transcript, terminal state, evaluation, advance/finalization and cached response together. |
| Evaluation provider outages could select a heuristic candidate score. | Current-contract evaluation failure rolls back the operation for retry rather than committing a fallback score. |

Interview question strategy, provider choices, plan access and existing Guided
Assistance policy remain. Terminal handling closes a failed question once and
uses the existing progression path; it does not invent a replacement strategy.

## Capture settlement and fallback

Corrected sequence:

`freeze input -> stop recorder/recognition -> final browser event -> pending
transmissions -> final transcript/evidence -> terminal persistence -> finish`

Each MediaRecorder window has a completion promise installed before recording.
`dataavailable` supplies the final bytes; `onstop` constructs the complete Blob.
The next recording window starts while the previous complete window is being
transcribed, avoiding a recording gap during provider latency. A serialized queue
keeps transcript ordering deterministic. Stop is shared by concurrent callers
and waits for the final window and queue before releasing the microphone/socket.

The WS attempt has a 55-second deadline. Failure, disconnect, partial/malformed
result or timeout triggers one REST upload of that same complete Blob with the
same correlation ID. REST also has a 55-second abort deadline. Server Groq and
Deepgram attempts each have a 25-second bound. The complete stop operation has
a 65-second settlement bound; browser recognition waits for `onend` for at most
five seconds. Timers bound failure; they do not synchronize successful events.
A missing final event/deadline produces TRANSCRIPTION_FAILED. Late results are
ignored after settlement and cannot replace a committed outcome.

A successful empty provider response is UNINTELLIGIBLE when audio exists.
Provider failure is TRANSCRIPTION_FAILED even if an earlier partial transcript
exists. Partial words remain diagnostic evidence; they are not scored as a
complete candidate answer. No transcript is fabricated.

REST retains the captured audio/audit attempt on provider failure before returning
an error. Closed-session REST requests are rejected before provider/storage writes.
WS database availability errors close with temporary code 1013 rather than
inventing forbidden ownership. Owner filtering and JWT verification remain.
Audio storage is still best effort, with the existing per-turn last-audit behavior;
external object durability and lifecycle configuration are not attested here.

## Terminal state and evaluation contract

Each actual assistant question at a positive turn is registered using the existing
question instance ID. Setup/system prompts are excluded. The existing JSONB
runtime_state stores `terminal_contract_version`, `question_records` and cached
operation responses. Each question record contains its instance ID, turn,
question text, one outcome, raw captured text, evidence, terminal timestamp and
measurement flag. No table or migration was added.

| Outcome | Evidence/behavior | Scoring |
| --- | --- | --- |
| EVALUATED | Usable final transcript and successfully persisted evaluation. | Existing normal evaluator and assistance attribution. |
| NO_ANSWER | No usable speech/capture and no infrastructure failure; explicit verified timeout. | Existing intentional no-answer zero policy, calculated without fabricating an evaluation row. |
| TRANSCRIPTION_FAILED | Failed provider/capture/flush or deadline, including incomplete partial capture. | Unmeasured; excluded from score denominator. |
| UNINTELLIGIBLE | Successful capture/provider result but no usable words. | Distinct unmeasured outcome, excluded from score denominator. |
| SKIPPED | Explicit user skip action. | Existing intentional skip zero policy, calculated without a fabricated evaluation row. |
| ABORTED | Explicit termination or unresolved question closed by finish. | Unmeasured; captured diagnostic text is retained. |

Only EVALUATED records receive normal evaluation rows. Synthetic no-answer/skip
zero entries exist only during final score calculation. Failed transcription,
unintelligible capture and aborted assessment never become a zero evaluation.
An entirely unmeasured interview stores final_score NULL and displays Unmeasured.
Mixed results score the measurable/intentional outcomes without a coverage penalty
for infrastructure failures; existing category weights remain. Deeper reporting
and scoring review is Batch 3 work.

Finalization compares the actual asked conversation rows with ledger turns and
fails closed on inconsistent coverage or duplicate question rows. Remaining
registered open questions become ABORTED. Missing evaluation for an EVALUATED
terminal record also fails closed. An actual three-question sequence
TRANSCRIPTION_FAILED / NO_ANSWER / EVALUATED proves **3 asked = 3 terminal records**,
with three distinct instance IDs. Direct late incompatible terminal writes are
rejected; a retry cannot change the first committed outcome.

Active sessions created before this batch acquire terminal metadata only while
being answered or finalized under the same session lock. Stored valid answers
are evaluated before becoming EVALUATED. Verified persisted timeout markers can
be NO_ANSWER; missing capture evidence closes as ABORTED without guessing that
silence or a provider failure occurred. The compatibility path also detects an
old question insert with a still-zero turn counter. Existing historical answers
and zero-score rows are retained; stale non-measured evaluation rows are excluded
from the new active session's final calculation. Finished historical rows are
not rewritten or retrospectively repaired.

## Idempotency, ownership and user experience

The current client sends a stable client_request_id, expected_turn and
question_instance_id plus capture evidence and end_after_answer. Session-row
`FOR UPDATE` locking and one transaction cover conversation, terminalization,
normal evaluation, advance and response caching. Same-ID retries return the
committed cached response even after subsequent advancement. Different-ID stale
turn/instance submissions return 409; owner mismatches return 404. Asked active
sessions require current metadata rather than accepting an unguarded old-client
submission.

Normal evaluation runs synchronously inside that operation. Provider/write
failure rolls back transcript, ledger and advancement for a safe retry. Finish
and termination use the same row lock and cache: repeated finish has one completion
usage event, and termination retains capture and records its reason once. End
passes actual resolved text with end_after_answer, so no extra question is
created just before finishing.

The page shows stopping, transcribing, submitting and finalizing states. Input,
skip and repeated finish actions are blocked while an operation is active.
Transcription failure uses a neutral system notice. Saved-answer retry preserves
the whole payload, request ID, instance ID and captured text. A failed final save
or abort retains session/draft storage and exposes retry; it does not claim
completion. Browser final results are awaited; interim UI text is not substituted
for a final answer. Server and browser authorities are never raced together.

Owner JSON reports expose all terminal records. PDF reports include non-evaluated
questions/outcomes and show Unmeasured rather than numeric zero for NULL score.
History, dashboard and completed-result displays preserve the distinction between
honest zero and NULL. Advanced readiness widgets are withheld for unmeasured
results. Existing ownership/history visibility guards and public-sharing scope
remain intact.

## Validation

| Command | Result |
| --- | --- |
| `python -m pytest tests/test_batch2_interview_stt.py tests/test_batch0_history_safety.py -q --tb=short` | 73 passed; 9 warnings |
| `python -m pytest tests/test_batch2_interview_stt.py tests/test_interview_logic.py tests/test_guided_assistance.py tests/test_batch0_history_safety.py tests/test_batch0_startup_safety.py tests/test_batch1_auth_reliability.py tests/test_auth_identity.py -q --tb=short` | **276 passed; zero failures** |
| `python -m pytest tests -q --tb=short` | **561 passed; zero failures** |
| `npm run test:auth` in frontend | **56 passed; zero failures/skips** |
| `npm run test:interview` in frontend | **38 passed; zero failures/skips** |
| `npm run typecheck` in frontend | PASS |
| `npm run lint` in frontend | PASS; zero warnings |
| `git diff --check` | PASS |

New backend coverage is **53 cases**, covering six outcomes, actual normal/failed
answer processing, three-question coverage, duplicate concurrent submit/finish,
stale retries, transaction rollback, ownership, real assistance attribution,
provider fallback/deadlines/malformed results, actual REST audio/audit behavior,
WS correlation and temporary failures, report/PDF semantics, inconsistent ledger
rejection and active legacy compatibility. The existing history preservation
fixture retains answers, transcript, reports, audio, assistance and support data.
No tests were skipped, expected-failed or weakened for this batch.

Backend tests execute actual application functions and SQL against an owned
in-memory SQLite fixture, with narrow PostgreSQL syntax adaptations, savepoint
rollback and a serialized lock model. It enforces the relevant existing evaluation
constraints. Providers, unrelated services, PostgreSQL and external storage are
mocked; socket/DNS guards remain active. This verifies application behavior;
it does not prove PostgreSQL row-lock behavior or a deployed schema.

Frontend tests execute the actual TypeScript/TSX STT client, capture classifier
and page handlers/UI transitions using the existing built-in Node harness,
mocked media/socket/fetch/storage/hooks and controlled events/deadlines. They
include delayed final bytes, rapid stop, overlapping capture/transcription,
WS-to-REST failures, whole-chain failure, late frames, shared stop, real end/manual
submit/skip/abort handlers, failed-save retry and browser final-event handling.
The actual page and real STT class are exercised together with JWT authentication.
These are offline module/handler tests, not real browser/microphone integration.
PDF tests extract text from actual generated bytes; they do not attest visual layout.

Focused/full backend runs report 11 warnings: two existing dependency warnings
plus nine existing PDF datetime/fpdf deprecations newly exercised by these tests.
No warning suppression or new dependency was added. Dependency versions and
lockfile are unchanged.

## Batch 0/1 preservation and release limits

Before/after SHA-256 audit verified all **38 historical SQL files**, both prior
reports and the frontend lockfile unchanged. The baseline covers 302 files;
283 remain byte-for-byte unchanged, and its 19 changed existing files are
listed below. Four new implementation/test files and this report make 24 Batch 2
files. Temporary audit-manifest SHA-256:
`7d5970d0c8ec3807611c30b6cece537bfdd790d604b7cc64f330a6bfcfc2d2ab`.
The temporary workspace manifest is removed after verification.

Shared Batch 0/1 source files receive only the interview/report changes described
here. Regression tests confirm history pruning remains absent, startup migrations
remain disabled, readiness remains fail closed, temporary auth failures remain
non-401, frontend sessions/drafts remain preserved, college membership cache
remains correct and Google callback behavior remains intact. Authentication,
cache and OAuth implementation files are unchanged in this batch.

Remaining release work:

- Isolated real-browser/microphone tests across supported browsers must verify
  final MediaRecorder events, speech-recognition support, reconnects, page lifecycle
  and actual server-enabled/browser-only modes. Captured pending payload is held
  in memory; this batch adds no crash/reload audio persistence mechanism.
- Isolated PostgreSQL tests must attest real transactions, row locks, constraints,
  runtime role and deployed readiness contracts. Provider latency while holding
  a session lock should be measured under college concurrency.
- Real isolated Groq/Deepgram and storage tests must verify codecs, provider timing,
  upload/audit durability and lifecycle configuration. No production state is
  inferred from mocks. Client capture evidence is not a new anti-cheat attestation.
- Existing Batch 0 ledger/schema/legacy-constraint, cron/storage lifecycle,
  database-role and account-deletion release work remains. This batch does not
  run migrations or repair deployed schemas.
- Batch 3 should review derived analytics, scoring and reporting coverage across
  partial/unmeasured sessions. No finished historical rows are rewritten here.

Database changes: **NONE**. Migration changes: **NONE**. Production connectivity:
**NONE**. Deployment: **NO**. Ready for Old-Push Batch 3: **YES**.

## Files changed (24)

```text
app/routers/dashboard.py
app/routers/interviews_answer.py
app/routers/interviews_helpers.py
app/routers/interviews_schemas.py
app/routers/interviews_session.py
app/routers/reports.py
app/routers/stt_ws.py
app/services/evaluator_scoring.py
app/services/interviewer_session.py
app/services/report_generator.py
app/services/report_helpers.py
app/services/stt_service.py
frontend/src/lib/api.ts
frontend/src/lib/serverStt.ts
frontend/src/app/history/page.tsx
frontend/src/app/student-dashboard/page.tsx
frontend/src/app/report/[id]/page.tsx
frontend/src/app/interview/[id]/page.tsx
frontend/package.json
app/services/interview_terminal.py
frontend/src/lib/interview-capture.ts
frontend/tests/interview-stt.test.mjs
tests/test_batch2_interview_stt.py
PREPVISTA_OLD_PUSH_COLLEGE_PRODUCTION_BATCH2_INTERVIEW_STT_REPORT.md
```

## Files inspected (42)

Focused source/config/test and four SQL contract reads are listed below.
Counts exclude this report, attachments, search-only hits and hash-only checks
of the wider migration manifest. Prior reports were not reopened.

```text
app/routers/dashboard.py
app/routers/interviews_answer.py
app/routers/interviews_helpers.py
app/routers/interviews_schemas.py
app/routers/interviews_session.py
app/routers/reports.py
app/routers/stt_ws.py
app/services/audio_storage.py
app/services/evaluator_scoring.py
app/services/interview_summary.py
app/services/interview_terminal.py
app/services/interviewer.py
app/services/interviewer_constants.py
app/services/interviewer_question_engine.py
app/services/interviewer_session.py
app/services/report_generator.py
app/services/report_helpers.py
app/services/report_render.py
app/services/stt_service.py
app/database/migrations/001_initial_schema.sql
app/database/migrations/003_interview_runtime.sql
app/database/migrations/020_question_evaluations_unique_turn.sql
app/database/migrations/036_guided_assistance.sql
frontend/package.json
frontend/src/lib/api.ts
frontend/src/lib/serverStt.ts
frontend/src/lib/interview-capture.ts
frontend/src/app/interview/[id]/page.tsx
frontend/src/app/report/[id]/page.tsx
frontend/src/app/history/page.tsx
frontend/src/app/student-dashboard/page.tsx
frontend/src/components/confirm-dialog.tsx
frontend/tests/auth-reliability.test.mjs
frontend/tests/interview-stt.test.mjs
tests/conftest.py
tests/test_batch0_history_safety.py
tests/test_batch2_interview_stt.py
tests/test_guided_assistance.py
tests/test_interview_logic.py
requirements.txt
requirements-dev.txt
pytest.ini
```

STOP. DO NOT DEPLOY.
