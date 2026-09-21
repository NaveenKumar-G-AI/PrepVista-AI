# Diagnosis Engine

`app/services/diagnosis_service.py` + `app/services/mistake_service.py`.

## Two layers, not one

1. **Rule-based (always runs, no AI needed)** — `mistake_service.py` maps
   deterministic failure categories (from `evaluation_service.py`) and
   static-analysis signals directly onto the fixed mistake taxonomy. These
   are treated as facts (HIGH/MEDIUM confidence, never LOW).
2. **AI-assisted (only if a provider is configured)** — `diagnosis_service.py`
   sends the deterministic evidence to the AI provider and asks it to
   produce *hedged* `inferences`, never to re-derive or override the facts
   it was given. AI-proposed mistakes are merged in as additional, separate
   items — they never replace the rule-based ones.

## Observation vs. inference (Phase 13)

`AIStructuredDiagnosis` keeps these as separate lists:

- `observations`: restatements of facts already computed deterministically
  (e.g. "2/10 tests passed").
- `inferences`: hedged hypotheses about *why* ("may not correctly handle
  duplicate values") — the AI system prompt (`ai/prompts.py`) explicitly
  instructs the model to phrase every inference with "may/likely/appears"
  and forbids it from inventing new facts.

## No AI provider configured → no fabricated reasoning

If `AnthropicProvider.is_available()` is `False` (no `ANTHROPIC_API_KEY`,
the actual state of this sandbox) or the call fails / returns unparseable
JSON, `diagnose()` returns a diagnosis built **only** from deterministic
facts, with `ai_status` set to `AI_EVALUATION_PENDING` or
`AI_RESPONSE_INVALID`, and `inferences: []`. It does not synthesize
AI-sounding prose to paper over the gap — see
`tests/test_ai_layer.py::test_diagnosis_without_provider_reports_ai_evaluation_pending`.

## Root-cause chaining (Phase 13)

The chain described in the brief (failure → observed behavior → likely
cause → concept → prerequisite weakness) is implemented across two
services, not one function:

- `diagnosis_service` produces the "likely cause" (an inference).
- `skill_service.check_prerequisite_weakness` produces the "potential
  prerequisite weakness" step, by walking `skill_prerequisites` and
  checking whether prerequisite skills are also at FOUNDATION/DEVELOPING.

## Not implemented in this build

- Complexity reasoning and code-analysis interpretation as *separate* AI
  calls (Phase 10 lists these as distinct responsibilities). This build's
  complexity/code analysis is static-heuristic only — see
  `CODEFORGE_AI_EVALUATION.md` for the full breakdown of which of the
  eight AI responsibilities are actually wired to a model call.
