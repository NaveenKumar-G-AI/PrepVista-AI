# Verification matrix ? local recovery, 2026-09-20

| Check | Latest completed result | Boundary |
|---|---|---|
| Backend pytest excluding isolated DB file | 587 passed | Deterministic providers; no real credentials |
| PostgreSQL integration suite | 62 passed | Isolated PostgreSQL 18.4 test database; includes actual schema/constraints/RLS |
| PostgreSQL cleanup | Server confirmed stopped | Harness initially exceeded 15-second shutdown wait after tests; allowance increased to 45 seconds |
| Frontend unit tests | 19 passed | API cache, mutation replay, recorder, heartbeat, worker attribution, account-scoped drafts |
| Frontend ESLint | Passed | No warnings |
| Next production build / TypeScript | Passed with https://api.example.invalid | First unconfigured build correctly rejected missing production API URL; no deployment config changed |
| Browser regression suite | 39/40 in full run; all 11 interview/report cases passed after correcting old wording assertion | The other 29 cases passed the full run; no browser case remains failing. Uses local server and mocked API responses |
| Frontend production npm audit | 0 findings | Installed production dependency graph at check time; not backend vulnerability certification |
| Python pip check | Passed | Dependency compatibility, not an advisory scan |
| git diff --check | Passed | Existing LF/CRLF notices only |

New PostgreSQL evidence: old rubric rejection then additive migration/replay; saved answer and job rollback together; competing workers evaluate once; three-attempt exhaustion/lease recovery; 10/7/0 evaluations preserve 10 answers and honest 100/70/0 coverage; original zero remains valid; owner retry denies another student and is idempotent; late results update report/skill rows; browser role cannot mutate plan/admin/score after migration 045.

Lifecycle evidence: generated resume PDF -> validation/extraction -> grounded identity -> persisted V2 questions/ten answers -> actual finish service with null pending score -> durable jobs -> owner report handler -> PDF with matching canonical name and 80/100. Model responses and entitlement reconciliation are stubbed. Browser tests separately exercise live-answer submission, resume after reload, finish failure, mobile report evidence, answer retry and missing-evaluation recovery.

Limits: real identity/provider/payment/storage/load behavior is outside this local-only pass. The entire historical 001-045 installer is not qualified: legacy migrations require pg_cron and deployment-specific configuration; Docker is not available on this workstation. The selected actual interview schema and additive recovery migrations were exercised without pretending those platform requirements were satisfied. No production session or secret was read.
