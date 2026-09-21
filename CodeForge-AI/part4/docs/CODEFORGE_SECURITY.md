# Security

## Authorization (Phase 30)

`app/auth.py` implements an HMAC-signed dev token as an explicit stand-in
for a real Supabase JWT — this is not production auth, and the module
docstring says so. The invariant that matters and *is* real: every
DB write uses `student_id` from the **verified token**
(`Depends(verify_token)`), never from the request body. `require_ownership`
is called before returning any per-student resource
(`/attempts/{id}`, `/students/{id}/skills`, `/students/{id}/report/{id}`)
and raises `403` on mismatch — covered by
`tests/test_integration_e2e.py::test_student_cannot_access_another_students_attempt`.

**Role-based access (Phase 29 addition):** the token payload also carries
a `role` claim (`"student"`/`"staff"`), included inside the HMAC-signed
string — not a separate unsigned field — specifically so a student can't
forge staff access by tampering with part of the token without
invalidating its signature.
`tests/test_reporting_and_dev_endpoints.py::test_dev_token_role_is_signed_and_cannot_be_tampered_with`
does exactly that: mints a student token, flips the role byte in the
token string directly, and confirms the tampered token is rejected with
`401` rather than silently trusted.

## Management/aggregate reporting privacy (Phase 29)

`app/services/reporting_service.py` backs four `staff`-role-only
endpoints (`CODEFORGE_API.md`). Deliberately cohort-level only — every
query groups by something other than `student_id`, so there is no code
path that can return a single identified student's private detail, even
by accident of a narrow filter. Verified in
`test_staff_reports_return_aggregate_data_with_no_student_identity_fields`,
which asserts `student_id` and `evidence_text` never appear in any report
row. `test_staff_only_reports_reject_student_tokens` confirms all four
endpoints reject a `role: "student"` token with `403`.

## Hidden tests / expected outputs (Phase 30/31)

- `GET /challenges/{id}` only ever returns `public_tests` — hidden rows
  are never selected into that response.
- The submission response (`_redact_hidden`) nulls out `expected_result`
  and `actual_result` for every outcome where `is_hidden=True` before
  returning it to the client.
- `test_failure_analysis` rows never persist the hidden expected value
  either (`main.py`: `None if o.is_hidden else o.expected_result`).
- Verified by
  `tests/test_integration_e2e.py::test_full_pipeline_...` which asserts
  hidden outcomes come back with `expected_result`/`actual_result` both
  `None`.

## Execution sandboxing (Phase 4/31) — real, with a documented gap

What's real in this build (`execution_service.py`):
- separate OS process per run (never `exec`/`eval` in-process)
- separate temp directory per run
- hard wall-clock timeout (5s)
- CPU time and address-space (memory) `RLIMIT`s applied in the child
  before the interpreter runs
- process-count and file-size `RLIMIT`s
- output truncated at 64KB
- a genuine `compile()` syntax check before ever spawning a process

**Documented gap, not hidden:** this executes in the same container/user
as the API server, not in a separately provisioned, network- and
filesystem-namespaced sandbox (Docker/gVisor/Firecracker/Judge0/Piston).
Phase 4 explicitly requires "student code must never execute directly
inside the primary application server" — a real deployment must move
`execution_service.run_python` behind that kind of isolated execution
fleet. The policy layer (timeouts, resource limits, per-run isolation,
output caps) is written so it transfers directly to a hardened sandbox;
only the underlying process-spawning mechanism needs to change.

## Adversarial cases actually tested

- Infinite loop → `TIMEOUT`, not a hang or a server crash
  (`test_malicious_infinite_loop_submission_times_out_and_is_not_a_system_crash`,
  and `test_execution_and_evaluation.py::test_timeout_is_enforced_on_infinite_loop`).
- Syntax errors → `COMPILATION_ERROR`, never silently treated as a runtime
  failure or a pass (`test_compile_check_catches_syntax_error`,
  `test_compilation_error_short_circuits_remaining_tests_without_fabricating_pass`).
- Runtime crash (`1/0`) → `RUNTIME_ERROR`, captured stderr, non-zero exit
  (`test_runtime_error_is_captured_not_swallowed`).
- Duplicate/double-submit → idempotent, same `attempt_id` returned, no
  duplicate row (`test_idempotent_double_submit_does_not_create_two_attempts`).
- Cross-student access → `403`
  (`test_student_cannot_access_another_students_attempt`).
- No/garbage auth token → `401`/`422`
  (`test_unauthenticated_request_is_rejected`).
- Oversized submission (>50,000 chars) → `422`, rejected by Pydantic
  validation before any execution happens
  (`test_oversized_submission_is_rejected_before_execution`).
- Excessive submissions → `429` after the rate limit is hit
  (`test_rate_limit_blocks_excessive_submissions`).
- AI provider outage / malformed output → clean fallback, never a crash or
  fabricated content (`test_ai_layer.py::test_diagnosis_falls_back_cleanly_on_provider_outage`,
  and the same pattern in `explanation_service`/`complexity_service.refine_with_ai`).
- Background analysis task failure → caught, `analysis_status='FAILED'`
  recorded, an `AI_failure` audit event logged — never a silent hang in
  `PENDING` forever, never a crashed server process (`app/main.py::_run_background_analysis`'s
  `try/except`).

## Not covered in this build (would need real infra to test meaningfully)

- SQL injection: mitigated by using parameterized queries everywhere in
  this codebase (no string-formatted SQL), but there is no real Postgres/
  Supabase RLS layer here to test against.
- IDOR beyond the attempt/report endpoints tested above.
- Real network/filesystem isolation of the execution sandbox — see above.

## Rate limiting (Phase 31) — implemented

`app/rate_limit.py` enforces a sliding-window limit (10 submissions per
60s per authenticated student_id) as a FastAPI dependency on
`POST /attempts`, ahead of the endpoint body. Exceeding it returns `429`.
Verified end-to-end in
`tests/test_integration_e2e.py::test_rate_limit_blocks_excessive_submissions`
(10 real submissions succeed, the 11th is rejected).

**Documented scaling gap:** the limiter is in-process (`defaultdict` +
`deque`), so it only limits per-instance in a single-process deployment.
A real multi-instance deployment needs a shared store (Redis, or a
Postgres-backed counter) — swapping `_hits` for that store is the whole
change; the 429-on-exceed policy transfers directly.
