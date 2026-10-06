# PrepVista Old-Push College Production Batch 4: Guided Assistance + Retry + Provenance Integrity

Date: 2026-10-04 (Asia/Calcutta).

Decision: **A - Batch 4 qualified for Batch 5**. Backend: **742 passed, zero
failures**. Frontend: **158 passed** (56 auth, 38 interview/STT, 30 report,
34 assistance). Typecheck, lint and diff checks pass. Qualification is local;
real integration and the release blockers below remain. **Do not deploy.**

Workspace: `G:\PrepVista-Old-Push`; branch `main`; unchanged HEAD:
`24649a003336255b3d2830d9e3b9b8447bbf6cad`. No commit or push.

No production connection, live provider request, database/schema change,
migration execution or deployment occurred. `C:\PrepVista-AI` was not accessed
or modified. Pre-existing `check_db.py` and `check_db_insert.py` were untouched
and not run. Earlier reports were not reopened; their byte hashes are unchanged.

## Actual flow traced before patches

Setup defaults `guided_assistance` to false in both the actual setup page and
session route. The route writes migration 036's per-session policy. The interview
page exposes Hint and Show Answer only for the returned enabled policy. It calls
`api.requestHint/requestAnswerGuidance` through existing authenticated requests.
`interviews_assistance` reads policy/session state and calls the existing
`services.assistance` engine and existing LLM provider chain. Generated content
is stored in `interview_assistance_event`; a separate viewed endpoint records
`viewed_at`. `interviews_answer` derives provenance and persists it with the
normal evaluation under the Batch 2 answer transaction. Owner reports read that
persisted attribution. College score readers use Batch 3 measurement projections.

The pre-patch routes did not enforce authenticated ownership for generation/view,
used client question text, and derived the turn incorrectly from runtime state.
Concurrent generation ran outside the answer lock. Upserts could replace content;
guidance retry omitted its original why-it-works response. The engine and UI
returned fabricated fallback guidance on failures. The UI assigned an assisted
label before best-effort acknowledgement. Provenance ignored invalidation and
fell back to independent on lookup failure. Unknown was hidden in report UI and
provenance was absent from PDF payloads. There was no separate Ask Me Again
attempt endpoint or button; spoken repeat was clarification of the current prompt.

## Enablement and generation

Default remains **OFF**. Policy's enabled flag and the appropriate hint/guidance
flag are server-authoritative. Missing/disabled policy returns 403 before provider
work. Setup policy persistence failure reports assistance disabled and logs only
the exception type. Merely rendering setup/interview never creates an event.
Turning policy off does not erase an already acknowledged legitimate view.

Generation requires the authenticated owner, session secret, active session and
canonical current question instance. Question text/turn come from the terminal
ledger or an actual asked legacy conversation row, never the client text.
Finished sessions reject generation before provider work. New stale requests are
409. An already committed same-ID response can be replayed after advancement;
it remains the old event and cannot be acknowledged for the new question.

The existing provider choices/prompts remain. Empty/non-string/oversized content,
malformed JSON objects, incomplete guidance structure, timeout/network errors and
rejected safety/fallback results produce a safe 503. There is no fabricated
success, event, view, used flag or score. The student can answer independently.
An operation-level 20-second deadline bounds generation while holding the lock;
the existing engine request timeout/retry settings remain. Successful provider
content is validated structurally; this is not semantic fact-verification proof.

## Generated versus viewed, ordering and attribution

Generated content is not view evidence. The actual page acknowledges only after
content is rendered in its open guidance panel while listening. Collapsed panels,
late responses and responses arriving during submission receive no acknowledgement.
A synchronous request guard prevents duplicate clicks before React state updates.

`AssistanceViews` shares each pending acknowledgement. Answer submission waits
for all actually displayed views for its captured instance. Failed acknowledgement
keeps the saved answer, its instance and request ID, displays a neutral retry
message and retries the acknowledgement before transmitting that answer. A failed
generation has no pending view and therefore does not prevent independent answering.
Unknown is displayed while the first visible view remains unacknowledged.

Generation, viewed acknowledgement, answer and Ask Me Again all acquire the same
session row with `FOR UPDATE` inside a transaction. Generation and view timestamps
use PostgreSQL `clock_timestamp()`, as does the authoritative answer timestamp
captured after acquiring the lock. Transaction-start `now()` cannot backdate a
view that waited for another operation. The first viewed timestamp is retained
using COALESCE. A late view after answer advancement/closure is rejected.

Only owner-matching, non-invalidated, valid generated content with
`generated_at <= viewed_at < answered_at` can count. Equality with answered_at is
excluded. Events for another session/instance/owner do not count. Current valid
answer guidance takes precedence over a valid hint. Generated-but-unviewed
content stays independent. Missing instance or genuinely incomplete/unlinked
legacy view evidence yields unknown. Current-operation lookup/write failure
rolls back rather than inventing independence; legacy fallback is unknown.

Provenance and answered_at are persisted on the EVALUATED terminal record, the
normal evaluation and the cached answer response in the existing transaction.
Qualifying events acquire `used_before_answer` there too. Evaluation/write failure
rolls all of this back with transcript/advancement. Same-ID answer retries return
the committed result, including provenance, without deriving it again.

NO_ANSWER, TRANSCRIPTION_FAILED, UNINTELLIGIBLE, SKIPPED and ABORTED acquire no
assisted-answer attribution or synthetic evaluation. Their view events remain
separate audit records. No assistance events are physically deleted. There is no
application invalidation writer to redesign; existing invalidated rows are ignored
and cannot acquire a new acknowledgement.

## Idempotency, usage and quota

Successful generation is serialized by the existing session lock across workers.
Request-ID replay verifies session, owner, question instance, type and level.
It returns the stored event and complete response, including guidance reasons.
Content/reasons are held in a versioned JSON envelope in the existing TEXT column;
old plain-text rows remain readable. No schema alteration occurs.

The existing partial unique index admits one event per instance/type/level.
Repeated IDs and another transport ID for the same occupied slot return the same
content without another provider call or row. Inserts use DO NOTHING rather than
replacing original content. Hint levels 1 and 2 and answer guidance remain distinct
legitimate slots. New retry instances have fresh slots. Invalidated/unavailable
slots stay audit evidence rather than being overwritten.

There is **no separate paid assistance-use quota or counter** in this code.
The authentic limit counts recent successful persisted events for the session;
its existing throttle is retained. Interview quota enforcement remains at setup,
and completion usage remains idempotent. Failed generation inserts no successful
use, and retries of a committed event add no counter/event/provider work. No
pricing/entitlement behavior or interview quota code changed.

The guarantee is committed-operation idempotency. A crash/cancellation before
commit can require another provider attempt on recovery; this batch does not
claim exactly-once external execution across process death. Reusing one request
ID concurrently across different sessions violates identity; the database global
unique constraint remains authoritative and external collision/crash behavior
requires isolated PostgreSQL testing.

## Ask Me Again and preserved original evidence

POST `/interviews/{session_id}/retry-question` and the actual Ask Me Again button
create a new attempt using the existing runtime JSONB and conversation table.
They require ownership, an active session, expected turn and current instance.
The source question must belong to that session's existing terminal ledger.
Retries remain within the existing plan turn cap. No new provider strategy,
persistence table, mastery counter or schema is introduced.

The original closed question, raw answer, evaluation, score and provenance remain
unchanged. A still-open current prompt is closed as ABORTED, retaining diagnostic
capture, before appending the source question at the next turn with a fresh UUID.
`retry_of_question_instance_id` links the new ledger record to its source. An
existing evaluated source supplies its rubric category to the retry; normal
scoring and weights remain. The existing normalized question signature is used.

Retry response caching, transcript append and ledger advancement share one
transaction. Duplicate retries create one new prompt; distinct stale operations
return 409. The UI freezes/settles capture first and keeps failed retry payload,
capture and request ID for retry. It blocks competing submission/finish controls
while that pending retry is unresolved. No session/draft storage is cleared.

Independent -> hint-assisted, hint-assisted -> independent and answer-guided ->
independent flows preserve separate instance/evaluation/provenance. New assistance
never inherits from the source. Tests also exercise a higher-scoring retry: both
scores remain and the actual partial/readiness gates withhold a readiness claim.
The existing clarification-by-speech path remains separate. No single-retry
Mastered, Verified, Improved or Ready assertion was added.

## Reports, college and historical compatibility

Owner JSON carries persisted per-evaluation provenance and question instance,
plus the existing terminal records, including retry linkage. The report page
always shows Independent Attempt / Hint Assisted / Answer Guided / Unknown,
including when current policy is off or missing. It does not infer unknown as
independent. Both professional and emergency PDF paths retain and render these
labels. PDF question identifiers now use actual turns, avoiding ordinal ambiguity
when an aborted prompt separates original and retry evaluations.

Public sharing retains its existing disclosure scope. Private assistance content,
reasons, IDs, captured answers/evidence and request identities are not added.
Owner/report/share reads do not invoke assistance generation or rewrite history.
Legacy persisted attribution is displayed as stored; missing attribution is
unknown. No retrospective repair/backfill or historical formula change occurred.

College/admin has no existing dedicated assistance-provenance contract to expand.
Its score/readiness/tier policy remains unchanged. Actual measurement and college
tier helpers produce identical results across the four provenance values.
Assistance never becomes cheating, weakness, lower readiness or placement risk
by this batch. Batch 3 complete/partial/null/zero evidence gates stay authoritative.

## Validation

New backend tests: **88 cases**, executing actual generation/view/answer/retry,
report/share functions, engines and PDF byte generation. They cover all 43
requested matrix areas together with prior terminal/scoring regressions: disabled
policy, three event slots, exact replay/concurrency, malformed/failing/recovered
providers, strict boundaries/precedence, owner/instance isolation, invalidation,
unknown legacy evidence, original immutability, separate retry scores/provenance,
non-evaluated outcomes, pending-generation and pending-view locks, rollback,
non-punitive college evidence, read preservation and public disclosure.

| Command | Result |
| --- | --- |
| `python -m pytest tests/test_batch4_assistance_provenance.py tests/test_guided_assistance.py tests/test_migration_025.py -q --tb=short` | 97 passed; zero failures |
| Batch 4 + Batch 2/3 + guided + history/startup + auth/identity + interview logic + command-centre/placement regressions | 474 passed; zero failures |
| `python -m pytest tests -q --tb=short` | 742 passed; zero failures |
| `npm run test:auth` | 56 passed |
| `npm run test:interview` | 38 passed |
| `npm run test:report` | 30 passed |
| `npm run test:assistance` | 34 passed |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; zero warnings |
| Changed Python AST / duplicate literal-key review | PASS |
| `git diff --check` | PASS |

No tests were skipped, expected-failed or suppressed. Backend fixtures use owned
in-memory SQLite, narrow PostgreSQL adaptations, a serialized lock and savepoint
rollback, with real evaluation constraints. Providers/unrelated services are
mocked and socket/DNS guards remain active. These prove application behavior,
not PostgreSQL row-lock/clock/pool behavior or a deployed schema.

Frontend tests execute the actual setup/interview/report modules and request
client using mocked hooks, media, storage and network, controlled asynchronous
ordering and relevant post-render effects. They are offline handler/render tests,
not real-browser/attention/microphone integration. PDF tests extract text from
real bytes; they do not attest pagination/layout. No dependency/lockfile update
or live provider call was needed.

Full/prior-regression backend runs report **88 warnings**: existing dependency
warnings plus existing datetime/FPDF deprecations exercised by PDF coverage.
Focused Batch 4/PDF runs report 40 existing PDF deprecation warnings. No warning
suppression was introduced.

Existing fixture changes add authentic invalidated defaults, a database-clock
function and transactions; older attribution fixtures now include actual owner,
generated content and generated timestamp evidence. Their positive/equality/
late attribution expectations remain. The migration contract test keeps all
identity/uniqueness assertions and checks immutable DO NOTHING insertion.
The prior report harness loads the real new label helper. No prior test was
weakened to accept incorrect attribution.

## Preservation and release work

Before/after SHA-256 audit: **317 baseline files**, **301 unchanged**, **16 changed
existing files**. Five new source/test/report files make **21 Batch 4 files**.
All **38 historical SQL files**, all four prior reports and frontend lockfile are
byte-for-byte unchanged. Manifest digest:
`064979a63f9ee91fd1885eafb4587ad8cd6ac2e82ccfbe70309ade1d214ad042`.
The temporary `.batch4-preservation.json` is removed after final verification.

No B0 history pruning/startup migration path, B1 auth/cache/OAuth implementation,
B2 STT implementation or B3 scoring/projection implementation changed. Shared
answer/interview/report files contain the described assistance/retry/display work;
all prior regressions pass. No commit, push, deploy, candidate-package export or
production connectivity occurred. Ignored typecheck artifacts are local validation.

Remaining release work:

- Isolated PostgreSQL tests must attest actual row locks, clock ordering, unique
  constraint collisions, runtime permissions, transaction rollback and crash
  recovery. Measure provider latency/pool occupancy with the generation lock
  under college concurrency. There is no new distributed provider job/outbox.
- Existing schema attestation includes a concrete rubric compatibility gap:
  migration 001's CHECK declares 14 legacy categories while current normalization
  can emit categories such as project_ownership. An early new ownership/finished
  test's unrelated second normal evaluation hit the fixture's authentic CHECK.
  Its finished-generation scenario now closes that open prompt as ABORTED; no
  constraint was relaxed or schema/runtime scoring redesigned. Review this
  pre-existing contract separately before release; local qualification does not
  assert compatibility for every rubric or repair any deployed constraint.
- Isolated real-browser testing must verify post-render acknowledgement,
  immediate submission, double clicks, slow connections, keyboard controls and
  retry UI. A persisted acknowledgement records receipt/display intent, not
  proof of human attention. Pending retry/answer/audio state remains in memory;
  this batch adds no crash/reload capture persistence.
- Existing B0 ledger/schema/legacy-assistance constraints, roles, cron/storage
  lifecycle and account-erasure release work remains. B1 real OAuth/provider,
  B2 browser/microphone/STT/storage and B3 layout/calibration/operational checks
  remain. Finished historical ambiguous attribution is not retrospectively
  corrected. No automatic schema repair is authorized or performed.

Database changes: **NONE**. Migration changes: **NONE**. Historical rows rewritten:
**NO**. Production connectivity: **NONE**. Deployment: **NO**.
Ready for Old-Push Batch 5: **YES**, for local stabilization only.

## Files changed (21)

16 existing files and five new files, including this report:

```text
app/routers/interviews_answer.py
app/routers/interviews_assistance.py
app/routers/interviews_session.py
app/routers/reports.py
app/services/assistance.py
app/services/report_generator.py
app/services/report_helpers.py
app/services/report_render.py
frontend/package.json
frontend/src/app/interview/[id]/page.tsx
frontend/src/app/report/[id]/page.tsx
frontend/src/lib/api.ts
frontend/tests/report-integrity.test.mjs
tests/test_batch0_history_safety.py
tests/test_batch2_interview_stt.py
tests/test_migration_025.py
app/services/assistance_evidence.py
frontend/src/lib/assistance-views.ts
tests/test_batch4_assistance_provenance.py
frontend/tests/assistance-provenance.test.mjs
PREPVISTA_OLD_PUSH_COLLEGE_PRODUCTION_BATCH4_ASSISTANCE_PROVENANCE_REPORT.md
```

## Files inspected (38)

20 focused implementation/test/config files listed above (excluding this report),
plus these 18 supporting reads. Large files were read in relevant sections.
Attachments/search-only hits/hash-only checks are excluded. The 38-SQL byte audit
is separate from this inspection count.

```text
app/config.py
app/database/connection.py
app/services/quota.py
app/services/interview_terminal.py
app/services/interviewer_session.py
app/services/interviewer_question_engine.py
app/services/evaluator_feedback.py
app/services/score_semantics.py
app/services/assistance_families.py
app/routers/interviews.py
app/routers/interviews_schemas.py
app/database/migrations/001_initial_schema.sql
app/database/migrations/036_guided_assistance.sql
frontend/src/app/interview/setup/page.tsx
frontend/src/lib/plan-usage.ts
frontend/tests/interview-stt.test.mjs
tests/test_guided_assistance.py
tests/test_batch3_report_integrity.py
```

STOP. DO NOT DEPLOY.
