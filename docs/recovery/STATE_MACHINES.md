# State machines

Interview database state remains ACTIVE -> FINISHED, with separate V2 question phases. Finishing means the conversation is committed; it does not assert every evaluation is available.

Evaluation jobs: PENDING -> RUNNING (2-minute lease) -> AVAILABLE, or PENDING (60-second retry) / FAILED after three attempts. The per-job execution timeout is 75 seconds. Shutdown cancellation leaves leased work recoverable. Expired final-attempt jobs become FAILED. Owner retry can restart failed work after a five-minute cooldown; pending/running/completed work is not duplicated. Session deletion cascades source messages, jobs and evaluation rows.

Report projection: GENERATING while queued/running work exists; READY with complete observed coverage; PARTIAL otherwise. Evaluation availability is separately AVAILABLE, PARTIAL or UNAVAILABLE. A report can be incomplete without assigning a failing performance score. Browser automatic refresh is bounded to three minutes.

Coding validation/evidence/draft state machines remain as documented in the integration plan. None of their failed measurements becomes a weak student score.
