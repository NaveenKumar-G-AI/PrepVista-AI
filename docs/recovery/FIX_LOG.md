# Recovery fix log

Local work, 2026-09-20. User explicitly requested local checks only. No remote database, deployment or push was performed.

| Change | Why | Verification |
|---|---|---|
| report_truth.py shared by reports, finish, history and PDF | No evaluations must not create zero/weak readiness; quality and coverage are independent | 0/7/10 evaluations, genuine zero, bracketed answers, API/PDF and browser cases |
| Migration 043 | Current evaluator and analytics vocabulary exceeded both legacy CHECK constraints | PostgreSQL rejects old writes, accepts migrated categories, preserves existing scores and rejects unknown categories |
| Migration 044 and existing-service evaluation worker | Background tasks can disappear; late results were discarded after FINISHED | Transaction rollback, competing workers, expired leases, bounded attempts, idempotent owner retry, late report and skill-score refresh |
| Finish and compatibility backfill | Provider calls held the session transaction open | Finish now commits current evidence; compatibility helper only queues; lifecycle tests finish with unavailable score and recover afterward |
| Owner retry action and bounded polling | Students need recovery without another interview purchase | Two-user denial, cooldown, replay, browser action, no quota mutation |
| Canonical name preservation | Case/initial rewriting and ungrounded model name could change identity | Exact resume text matching; no fuzzy spelling correction; profile fallback; greeting/closing/PDF regression |
| Question quality gate | Repeated introduction prefix and narrative fragments passed generic safety checks | Reported examples rejected; authored question and bounded follow-up regressions pass |
| Migration 045 | Browser-owned rows exposed protected plan/admin/score fields under permissive write policies | Real PostgreSQL authenticated-role reproduction before migration and denied mutation afterward; owner SELECT and backend UPDATE preserved |
| Report empty-state copy | A completed unassessed interview prompted more interviews or implied success | Neutral unavailable copy, no invented strengths or improvement feedback |

The lifecycle fixture uses an actual generated PDF, parser, PostgreSQL schema, V2 orchestration, finish service, durable worker, owner report handler and PDF renderer. Model outputs and entitlement reconciliation are deterministic substitutes; this is not a real-provider or billing acceptance test.

No original answers or historical scores are destructively rewritten by these migrations. Historical missing evaluations are queued explicitly by their owner. Recovery does not claim the supplied production session was inspected.
