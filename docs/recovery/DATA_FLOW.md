# Data flow after local recovery

Supabase token -> canonical profile mapping -> existing quota/validated resume upload -> source-grounded resume_summary -> interview_sessions + runtime_state/question_plan -> committed conversation_messages.

The answer INSERT and an evaluation job commit in one transaction (migration 044 trigger). Background dispatch reduces latency but is no longer the durable authority. An existing-backend worker leases the job, releases its DB connection, evaluates under the shared semaphore, writes a unique session/turn evaluation, and refreshes a finished report and skill rows. No synchronous provider dependency remains in finish.

Report API, shared summary, PDF, history and recent-session cards derive scored quality from eligible evaluation rows. Recorded answers, evaluations, coverage and availability remain distinct. Missing results produce a null score. Partial results describe evaluated answers only. Owner retries recover stored answers without a new interview or credit decrement.

Coding artifacts -> transactional evidence events -> existing-service processor -> immutable readiness snapshots remains unchanged. This interview recovery does not requalify legacy institutional readiness models or rewrite historical unified snapshots.
