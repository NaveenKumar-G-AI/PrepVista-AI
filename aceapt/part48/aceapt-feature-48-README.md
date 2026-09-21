# ACEAPT — Feature 48: Hint Intelligence Engine

A standalone, runnable reference implementation of the Hint Intelligence Engine spec. **No
ACEAPT repository was attached to this build**, so this is a clean-room implementation with
clearly marked integration seams for Features 42/45/46/47/49 and the platform services the spec
assumes already exist (Mistake Intelligence, Confidence Intelligence, Mastery, assessment
config, auth, session state). Wire those in and this drops into the real system — see
["Wiring into real ACEAPT"](#wiring-into-real-aceapt) below.

## Quick start

```bash
npm install
npm test          # runs the policy engine against spec §114's six canonical cases + more
npm run dev        # http://localhost:4048, deterministic hints only (no key needed)
```

All secrets in `.env` are blank on purpose — fill them in when you're ready:

- **`ANTHROPIC_API_KEY`** — optional. Blank means every hint comes from the deterministic
  template generator. The policy engine's decisions never depend on this key; only the
  *phrasing* of a hint does.
- **`DATABASE_URL`** — optional. Blank means the app uses the in-memory repositories. See
  `src/persistence/schema.prisma` for the real-Postgres shape.
- **`AUTH_JWT_SECRET`** — not wired to anything yet; `src/api/app.ts` has a clearly-marked stub
  auth check (decodes a base64'd student id) that must be replaced before this goes anywhere
  near production.

## The one design decision that matters

**The policy engine is deterministic. The LLM only phrases what it's told to say.**

`decide()` in `src/policy/hintPolicyEngine.ts` is a pure function — no I/O, no model call — that
decides *whether* to help, *what kind*, *how much*, and *when to stop*, from actual signals
(mistake classification, attempt history, escalation state, dependency evidence). An LLM is only
invoked afterward, constrained to phrase that exact decision in a sentence, grounded only in the
trusted step content it's handed, and everything it returns is checked by the validator before a
student ever sees it. If it fails validation, or there's no API key, or the call times out, the
deterministic template generator produces the hint instead — this is not a degraded mode, it's
the designed fallback (spec §59), and it's what this build runs on by default.

This is what makes spec §10 ("the policy must be testable independently of the UI") and the
final command ("DO NOT FABRICATE INTELLIGENCE") both literally true at once: `npm test` exercises
real decision logic with assertions, not a call to a model and a hope.

## Layout

```
src/domain/          Types + the 3 curated trusted questions (percentage, probability, puzzle)
src/integration/      Stand-ins for Features 42/45/47, Mistake Intelligence, Mastery, etc.
src/policy/            HintPolicyEngine (the "intelligence") + dependency/fading calculations
src/generation/        Deterministic templates, LLM phrasing, and the composite that falls back
src/validation/        Answer-leakage, level-conformance, and math-correctness checks
src/persistence/       Repository interfaces + in-memory impls + reference Prisma schema
src/analytics/         Event taxonomy (§79) + educational metric calculators (§80)
src/api/                Express app: requestHint / submitHintFeedback / recordHintOutcome /
                        getHintHistory / updateHintPreference, with idempotency + auth stubs
tests/                  Policy engine (incl. §114's six cases), escalation, validator, a full
                        content-audit sweep, and metrics
```

## Why three curated problems

Spec §85 is explicit that "think carefully" for every question isn't real intelligence. Rather
than fake breadth, this build hand-grounds three problems — one percentage, one probability, one
logical puzzle (`src/domain/sampleData.ts`) — each with a real trusted solution, a deterministic
mistake classifier, and hand-authored hint content per block type. That's what lets the tests
assert *specific, correct* hint types rather than just "a hint came back." Anything outside these
three still works end-to-end via the generic, leak-safe fallback in
`src/generation/hintGenerator.ts` — it's just less specific until you add curated content for it.

## A real bug this build's own tests caught

Worth calling out, because it's the kind of thing that matters more than any line count: a live
smoke test of the running server turned up a case where the deterministic generator's own
"worked step" content leaked the final answer at a level the policy engine hadn't authorized to
reveal it (the strategy sequence had reached "worked step" a turn before the numeric level
ladder had). That's a real coordination bug between two independently-evolving pieces of state,
exactly the kind of thing spec §71 (concurrency/staleness) is worried about in general. It's
fixed in `hintPolicyEngine.ts` — a `strategyTag === "WORKED_STEP"` decision now *always* carries
`hintLevel = L6` and `revealsAnswer = true` together, instead of two formulas that could
disagree — and `tests/deterministicContent.test.ts` now sweeps every problem × step × mistake
signal × escalation depth so a regression like it fails loudly in CI instead of shipping.

## Wiring into real ACEAPT

Everything Feature 48 depends on is behind an interface in `src/integration/stubs.ts` or
`src/persistence/repositories.ts`. To connect it for real:

1. Replace `GuidedSolvingService`, `SkillGraphService`, `MistakeIntelligenceService`,
   `ConfidenceEngineService`, `MasteryService`, `AssessmentConfigService`, and
   `StudentSessionService` in `src/integration/stubs.ts` with calls into the real Features
   42/45/46/47, Mistake Intelligence, Confidence Intelligence, Mastery, assessment config, and
   session state.
2. Replace the trusted-question lookup in `src/domain/sampleData.ts` with ACEAPT's real
   question/solution store, keeping the `TrustedQuestion` / `TrustedSolutionStep` shape (or
   adapting it) — nothing in `policy/`, `generation/`, or `validation/` needs to change.
3. Swap `InMemoryHintInteractionRepository` etc. in `src/index.ts` for Prisma-backed
   implementations of the same interfaces (`src/persistence/schema.prisma` is the reference
   shape).
4. Replace `requireAuth` in `src/api/app.ts` with ACEAPT's real session/JWT verification.
5. Set `ANTHROPIC_API_KEY` (or point `LlmHintGenerator` at whatever model-routing/gateway
   infrastructure ACEAPT already has — spec §66).

## Status against the spec's own checklist (§105–107)

**P0 — built and tested:** explicit hint request; intelligent triggering with cautious
thresholds (§12, §48); the full hint taxonomy; 8 progressive levels; current-step awareness;
mistake-aware diagnosis (§44); minimum-sufficient-hint baseline (§16); escalation that switches
strategy, not just volume (§19–20); de-escalation via dependency state (§39); failed-hint
adaptation; outcome tracking; answer-leakage protection (validated, not assumed); a
deterministic math/formula spot-check; assessment-mode restriction enforced at the API layer,
not just the UI (§72); AI fallback that's the *default* path, not an edge case; idempotency +
staleness handling; ownership/tenant checks; analytics events; educational metrics.

**P0 — stubbed, not fully built:** the real Feature 42/45/46/47/49 integrations are interfaces
with plausible mock behavior, not the real systems (none existed to integrate with). Mobile CSS
and full accessibility pass exist in the demo artifact, not in a backend-owned UI (this project
has no frontend of its own by design — see the separate interactive demo). Route-level
integration tests aren't included; the policy/validator/escalation unit tests are.

**P1 — partially built:** hint-preference *storage* exists (`HintPreferenceRepository`); the
policy engine doesn't yet *read* it to change phrasing style — a real style-selection layer in
the generator is the natural next step. Per-type effectiveness learning (§23) isn't implemented;
`analytics.ts` has the raw data model it would need. No A/B testing framework.

**P2 — intentionally not built:** voice/handwriting/diagram-aware hints, multimodal input,
cross-session optimization — per spec §108, deliberately not overbuilt here.

## Running the tests that matter most

```bash
npm test
```

Look specifically at `tests/hintPolicyEngine.test.ts` — it encodes spec §114's own definition of
"done": the same engine, given six different states of the same student on the same problem,
must produce six meaningfully different decisions. It does.
