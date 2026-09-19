# V2 compatibility and deployment verification

New settings: `INTERVIEW_ORCHESTRATOR_V2=true` (default). The flag affects session
creation only. Sessions with a stored V2 marker continue V2 even if the flag is
disabled; sessions without a marker continue the original service path.
Disable the flag to create legacy sessions during rollout, not to reinterpret
active or historical V2 records. Keep this code deployed until V2 sessions drain.

Migration `037_interview_coaching_v2.sql` adds retry and story tables with indexes,
foreign-key cascades and RLS. It does not alter existing data. Migration 036
(already in the working tree before this task) is required for answer receipts.
The existing startup migration runner applies numbered migrations; do not edit
previously applied migration files. No production migration was run in this task.

API additions:

- Setup multipart fields: `interview_mode`, `target_role`, `target_company`,
  `job_description`, `department`, comma-separated canonical `categories`.
  Optional `duration` is seconds; absent duration uses mode default.
  Setup response adds `blueprint` with actual plan/duration-limited targets.
- Answer retains its existing body and adds `progress` and
  `time_remaining_seconds` to continue responses. `skip`, clarification and
  transcription-failure controls reuse this transaction endpoint.
- Current state adds `progress` and `elapsed_seconds` for reload.
- Finish/report add an evidence report; legacy fields remain present.
- `POST /interviews/{id}/retry-answer`: `question_id`, `answer`,
  `client_request_id`; returns original/new evidence and repaired/remaining gaps.
- `GET /interviews/practice/progress`, `GET/POST /interviews/practice/stories`,
  `DELETE /interviews/practice/stories/{id}` use the authenticated user's scope.

Local verification (PowerShell, repo root):

```powershell
.\.venv\Scripts\python.exe -m compileall -q app
.\.venv\Scripts\python.exe -m pytest tests -q --basetemp=C:\PrepVista-AI\.pytest-tmp-verification-new
.\.venv\Scripts\python.exe -m scripts.demo_interview_v2
Set-Location frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
$env:NEXT_PUBLIC_API_URL='https://api.prepvista.invalid'
npm.cmd run build
npm.cmd run test:e2e
```

The `.invalid` API origin is for build/browser tests with intercepted APIs only.
Use the actual configured HTTPS API origin for deployment. Preserve the existing
Next.js hosting and FastAPI/PostgreSQL deployment; this is not a new Sites app.

Staging release sequence:

1. Back up staging; deploy backend with migration 036 then 037 and check readiness.
2. Start V2 sessions on free/pro/career and verify no plan/quota bypass. Present
   shortened targets honestly: current allowances are 5/10/13 total questions,
   smaller than the brief's unrestricted standard/full examples.
3. Answer with team ownership, clarify ownership, observe a new primary family.
4. Retry the same request key, send a stale expected turn and reload mid-session.
   Verify exactly one answer/next-question and restored server elapsed time.
5. Disconnect STT/model providers. Preserve transcript; mark numeric evaluation
   unavailable; continue curated questions; finish a partial or full report.
6. Verify report/receipt/evidence transaction state and retry persistence against
   real PostgreSQL. Verify a second account cannot read/write any record.
7. Verify account/session deletion cascades, quota retention, and tenant isolation.
8. Set the creation flag false and complete one legacy and one stored V2 session.
9. Rebuild frontend with the actual API origin and smoke-test microphone/upload,
   billing, history, college reports and the new mobile report/retry UI.

No remote deployment, real-database migration or live-provider acceptance is
implied by local test results.
