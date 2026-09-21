# Feedback Engine

`app/services/feedback_service.py`, table `feedback_reports`.

## Required sections (Phase 24)

`AIFeedback` schema: `what_went_well`, `what_failed`, `why_it_failed`,
`what_to_improve`, `optional_hint`, `next_step`. All six are populated on
every attempt (never partially empty).

## Grounded, not generic

Whether AI-generated or falling back to the deterministic composer
(`_deterministic_feedback`), every field is built from the actual stored
evaluation/diagnosis for that attempt — specific failing test IDs and
categories, not "keep practicing and improve your coding skills." This is
asserted directly in
`tests/test_ai_layer.py::test_feedback_deterministic_fallback_is_grounded_not_generic`.

## AI unavailable → real fallback, not fake AI text

Same pattern as the diagnosis engine: no configured provider (this
sandbox's actual state) → `ai_status = AI_EVALUATION_PENDING` and the
feedback is composed directly from the deterministic evaluation/diagnosis
data, never presented as if a model wrote it.

## Feedback levels (Phase 25)

The schema and DB column (`feedback_reports.level`) support
`QUICK | STANDARD | DETAILED | DEEP`. The current wiring always requests
`STANDARD` from `main.py`; per-request level selection is a small,
mechanical extension (`generate_feedback(..., level=req.feedback_level)`)
that isn't exposed on the public API surface yet — flagged as PARTIAL in
`CODEFORGE_FINAL_REPORT.md`.

## Retry comparison (Phase 26)

`main.py`'s `submit_attempt` looks up the immediately-preceding attempt
(`attempt_number - 1`) for the same student+challenge and returns
`retry_comparison: {previous_score, current_score, improved}`. Verified
end-to-end in `tests/test_integration_e2e.py` (buggy attempt 1 → fixed
attempt 2 → `improved: true`).
