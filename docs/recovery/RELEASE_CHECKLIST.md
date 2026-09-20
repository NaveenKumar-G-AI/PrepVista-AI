# Recovery checklist

Status: core recovery fixes verified locally; not a production release certification. User scope is local checks only.

- [x] Repository/API/schema inventory and issue ledger recorded.
- [x] Zero/partial/full evaluation truth repaired and tested through API/UI/PDF.
- [x] Durable evaluation jobs, explicit retry, concurrency recovery and safe finish tested.
- [x] Candidate spelling/initial preservation and reported question-quality regressions tested.
- [x] Browser database privilege escalation reproduced and blocked by migration 045.
- [x] Additive migration replay and existing-score preservation tested.
- [x] Deterministic PDF-resume -> interview -> finish -> evaluation -> owner report -> PDF lifecycle passes.
- [x] Backend, local PostgreSQL, frontend unit and targeted browser regressions pass; production build and lint pass.
- [x] Frontend production advisory audit and Python dependency compatibility pass.
- [ ] Entire historical migration chain in a platform with pg_cron and production-like roles.
- [ ] Exhaustive institution/admin/billing/export workflows and backend dependency advisory audit.
- [ ] Historical institutional/profile snapshot reconciliation after repaired evaluations.
- [ ] Live auth/provider/payment/storage/load checks (outside current user scope).
- [ ] Production rollout/push (outside current user scope; not performed).

Required future release order: review migrations 043-045 against the actual ledger/roles, apply the additive schema, then deploy the compatible backend and frontend. The evaluation worker uses the existing DATABASE_URL and configured Groq service; no separate database/service or new OpenAI key is required. Pausing INTERVIEW_EVALUATION_WORKER_ENABLED preserves queued jobs. Rolling back visibility must preserve accepted answers and avoid reinstating the unsafe browser write policies.

The production example's exact records were unavailable and were not inspected. Local reproductions establish real code defects and regression fixes, not proof of a live repair. See TEST_MATRIX for precise coverage.
