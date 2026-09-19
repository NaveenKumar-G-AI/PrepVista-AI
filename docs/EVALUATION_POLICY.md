# Evaluation policy

V2 keeps an append-only per-question evidence ledger in the session JSONB.
Entries include question/anchor IDs, family, competency targets, exact excerpt,
timestamp, source, confidence, signals and gaps. Existing row locking and
answer receipts commit the transcript, ledger and next question atomically.

Live evidence extraction is a conservative deterministic text heuristic. It
detects explicit personal-action verbs, reasoning, outcomes, measurement,
verification and reflection. Its strongest status is EARLY_SIGNAL. It does not
verify technical correctness or infer a student's global competence. Short or
unsupported answers remain INSUFFICIENT_EVIDENCE. More sophisticated semantic
evaluation, contradictions and calibrated confidence are not implemented.

The existing model evaluator still supplies compatible numeric scores in the
background. V2 validates required numeric fields and returns unavailable on
provider/contract failure; no fallback score is inserted. Finish skips absent
answers and retries pending real answers. Numeric aggregation for V2 uses
evaluated answers only; the coverage summary independently counts captured
answers. If all evaluation is unavailable, the numeric compatibility field
remains present but the V2 UI displays unavailable rather than zero.

Content and delivery are separate. The evidence ledger makes no audio, accent,
personality or speech-disability inference. Existing measured delivery fields
remain in legacy evaluation data. V2 stronger-answer guidance is a structure,
not invented autobiographical prose. Resume skill support is cautious and is
not independent verification. No hiring-probability claim is produced by V2.
