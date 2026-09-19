# Interview V2 test matrix

Tests run without production credentials. The full backend suite also covers
existing authentication, billing, migration safety, interview delivery, tenant
contracts, STT and report behavior.

| Brief test | Verification |
| --- | --- |
| 1 Standard has breadth | `test_standard_primary_breadth_and_closing` |
| 2 Strong opening moves on | `test_strong_first_answer_moves_to_new_family` |
| 3 Weak ownership probe | `test_weak_ownership_gets_one_targeted_probe_then_moves_on` |
| 4 Clarified ownership advances | Same test; persistent-gap test also ensures measurement is not erased |
| 5 Follow-up limits | `test_followup_limits_and_anchor_identity` |
| 6 Primary not repeated | `test_no_duplicate_primary_ids` |
| 7 Python resume question | `test_python_resume_cross_question` |
| 8 Unknown resume fields | `test_unknown_resume_fields_are_tolerated` |
| 9 Measurement probe | `test_improvement_claim_gets_measurement_probe` |
| 10 Repeated we/our | `test_we_claims_trigger_ownership` |
| 11 Clarification does not consume | Parameterized retry-event test |
| 12 Silence retry | `test_silence_retries_once_then_skips_without_evaluation` |
| 13 Closing reached | Standard/full simulation and lifecycle integration |
| 14 Candidate questions closing | Standard simulation checks exact closing wording |
| 15 Early finish partial report | `test_early_finish_retains_answer_and_partial_report` |
| 16 Provider failure safe | Provider and wording failure integration tests |
| 17 STT failure not zero | Retry-event test; pending evaluation ignores absent answer |
| 18 Protected questions rejected | Five parameterized safety cases + catalog validation |
| 19 Quick time bound | Quick duration/expiry test; browser reload deadline test |
| 20 Full broad coverage | `test_full_mode_broad_coverage` with unrestricted test allowance |
| 21 Project defense depth | `test_project_defense_allows_focused_depth` |
| 22 Cross-session repeats reduced | Exact signature variant test |
| 23 No invented stronger-answer metrics | Retry truth test; V2 returns a factual structure |
| 24 Evidence-backed conclusions | Every risk/mission links to an existing evidence ID |
| 25 Insufficient stays insufficient | `test_insufficient_remains_insufficient` |

Additional contracts: concurrent answer replay, changed request-key rejection,
stale turn and wrong-owner rejection (existing delivery tests), actual lifecycle
answer → finish → report, exact finish replay, malformed provider JSON, plan
allowance cap, Free history gating, JSON state restoration and custom categories.

Browser scenarios in `frontend/e2e/journeys.spec.ts`:

1. Spoken answer delivery, next question and final answer saving.
2. Failed answer/finish preserves text and reuses the request key.
3. Reload restores a question without submitting another start token.
4. Existing percent-encoded login error regression.
5. Desktop/mobile empty-data and service-failure pages without horizontal overflow.
6. V2 mode, duration and custom coverage setup controls.
7. Mobile evidence report, unavailable score and saved answer retry.
8. Expired V2 session after reload finishes once with the expected turn.

These browser tests intercept auth/backend APIs and mock speech hardware. The
Python lifecycle test uses a transactional database double and stubs provider
grading/analytics side effects. Neither is a live PostgreSQL/provider end-to-end
certification. See `MIGRATION_NOTES.md` for required staging checks.

Final verification: 445 backend tests passed, including 47 new V2 policy and
integration cases. Frontend unit tests passed 11/11; Chrome browser tests passed
8/8. Python compilation, ESLint, TypeScript and the production build passed.
The build used the documented HTTPS placeholder API origin. Browser APIs and
speech hardware were intercepted test fixtures, not live production services.
