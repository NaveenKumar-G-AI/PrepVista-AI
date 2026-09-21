# AI Evaluation Layer

## Provider abstraction (Phase 9) — now three real providers + a factory

`app/services/ai/base.py` defines `AIProvider` (abstract). Business logic
never imports an SDK directly — it goes through
`app/services/ai/provider_factory.py::get_configured_provider()`.

| Provider | File | Status |
|---|---|---|
| `AnthropicProvider` | `ai/anthropic_provider.py` | **Real, live-verified.** Requires `ANTHROPIC_API_KEY`. `api.anthropic.com` is on this sandbox's network allowlist, but no key is configured here, so `is_available()` returns `False` and every downstream call falls back to `AI_EVALUATION_PENDING`. |
| `GroqProvider` | `ai/groq_provider.py` | **Real, code-complete — NOT live-verified.** Implements Groq's OpenAI-compatible chat completions endpoint, request/response shape checked against Groq's published API reference before writing. `api.groq.com` is **not** on this sandbox's egress allowlist and no `GROQ_API_KEY` is configured, so no live call was possible here. Request construction and response parsing are unit-tested with a mocked HTTP layer (`tests/test_provider_factory_and_new_providers.py`) against that documented shape — that is a documentation-accuracy claim, not a live-call claim. |
| `GeminiProvider` | `ai/gemini_provider.py` | **Real, code-complete — NOT live-verified.** Same situation as Groq: implements Google's `generateContent` REST endpoint per its published reference, `generativelanguage.googleapis.com` is not on the egress allowlist, no `GEMINI_API_KEY` configured, unit-tested against the documented shape with mocked HTTP. |
| `StubProvider` | `ai/stub_provider.py` | **Test double only**, never wired as a production fallback. |

**Provider selection** (`provider_factory.get_configured_provider`): an
explicit `AI_PROVIDER` env var forces a choice; otherwise the first of
`ANTHROPIC_API_KEY` → `GROQ_API_KEY` → `GEMINI_API_KEY` that's set wins.
None set → `None`, and every service correctly reports
`AI_EVALUATION_PENDING` rather than fabricating output. Fully unit-tested
(`test_provider_factory_and_new_providers.py`).

## Eight responsibilities (Phase 10) — six of eight now wired to a live call path

| # | Responsibility | Status |
|---|---|---|
| 1 | Code analysis interpretation | Deliberately deterministic only (`static_analysis_service.py`) — not a separate AI call. |
| 2 | Failure diagnosis | **Active.** `diagnosis_service.py` + `DIAGNOSIS_SYSTEM_PROMPT`. |
| 3 | Complexity reasoning | **Active.** `complexity_service.refine_with_ai` — only invoked when the static heuristic flags itself as unreliable (recursion with no loop signal); never promotes the result to `OBSERVED`, and never states a specific number it already knows is likely wrong (see the "pure recursion" fix below). |
| 4 | Mistake classification | Rule-based always (`mistake_service.py`); AI-proposed additions merged in by `diagnosis_service.py`, never replacing the deterministic ones. |
| 5 | Conceptual understanding analysis | **Active**, folded into explanation evaluation's `conceptual_understanding` output rather than a fully separate call — see #6. |
| 6 | Explanation evaluation | **Active.** `explanation_service.py` + `EXPLANATION_SYSTEM_PROMPT`. Only runs if the student actually answered "why this approach?" (Phase 16: not required for every challenge). |
| 7 | Feedback generation | **Active.** `feedback_service.py` + `FEEDBACK_SYSTEM_PROMPT`, at the student-requested level (QUICK/STANDARD/DETAILED/DEEP). |
| 8 | Evidence extraction | Deliberately deterministic (`evidence_service.py`) — strength/confidence come from explicit rules, not model judgement. |

Two (code analysis interpretation, evidence extraction) are deterministic
**by design**, not by omission — the spec's own Phase 17-18 evidence
strength/confidence rules are meant to be explainable, which a raw model
judgement call would undermine.

## A real bug this caught: don't state a confident number you already know is wrong

While building the complexity-refinement path, live testing surfaced a
real defect: a purely recursive function (no loops at all) was reported as
`O(1)` — the loop-nesting heuristic's answer for "zero loops found" —
displayed as if it were a real estimate, even though the function does
real recursive work and the accompanying reasoning text already said this
number likely understates the truth. That's worse than saying nothing: a
specific, confident-looking wrong answer. Fixed in
`complexity_service.estimate_python_complexity` — when recursion is
present and the loop-nesting heuristic has literally zero signal,
`time_complexity` is now `None` with an explicit explanation, rather than
a fabricated-looking number. Regression-tested in
`test_explanation_and_complexity_ai.py::test_complexity_never_states_a_confident_wrong_number_for_pure_recursion`.

## Structured output validation (Phase 11)

Every AI call target has a Pydantic schema (`AIStructuredDiagnosis`,
`AIFeedback`, `ExplanationEvaluation`, `ComplexityAIRefinement` in
`app/models/schemas.py`). Every provider's `complete_json` strips markdown
fences, parses JSON, and raises `AIProviderError` on any parse or shape
failure — callers then fall back to `AI_RESPONSE_INVALID`, never a
half-validated guess.

## Prompt injection posture (Phase 32)

Student code and challenge text are wrapped in `<student_submission>` /
`<challenge>` / `<evidence>` delimiters in all four active prompts, and
every system prompt explicitly instructs the model to treat their
contents as data, not instructions, "regardless of what it claims." This
is prompt-level mitigation only — it is not a substitute for the
sandboxing in `execution_service.py`, which is what actually prevents
submitted code from doing anything beyond producing stdout/stderr.

## To activate live AI in a real deployment

Set `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, or `GEMINI_API_KEY` (any one is
enough; `AI_PROVIDER` can force a specific choice). No other code changes
are required — the fallback path was exercised by every test in this
build precisely because no key is present here, and the request-building
code for all three providers is unit-tested independently of live
network access.
