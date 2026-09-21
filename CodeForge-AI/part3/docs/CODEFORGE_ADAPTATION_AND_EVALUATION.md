# CodeForge Adaptation & Evaluation

Covers §11-19, §24-30, §41 — the engine's actual decision logic. This is the
part of the spec that most insists AI not be in the loop, so this doc leads
with exactly where AI is and isn't involved, then explains the deterministic
parts.

## Where AI is, and isn't, involved

| Decision | Mechanism |
|---|---|
| Which challenge is next | `challengeSelector.ts` — weighted sum, no AI |
| How difficulty should move | `difficultyPolicy.ts` — explicit rules, no AI |
| What mistake category applies | `mistakeClassifier.ts` — rules over real exception types/test patterns, no AI |
| Whether a submission passed | `evaluationService.ts` (deterministic half) — real execution, no AI |
| Coaching commentary on a submission | `evaluationService.ts` (AI half) — advisory only, never overrides the above |
| Whether a drafted challenge is safe to publish | `generationPipeline.ts` — AI drafts once, everything after is independent execution |

## Challenge selection (§11-15, §41)

`scoreCandidate()` in `challengeSelector.ts` computes six independent 0-1
scores per eligible candidate and combines them with fixed weights:

```
gap 0.32 · role 0.16 · difficulty-fit 0.20 · freshness 0.16 · task-diversity 0.08 · quality 0.08
```

Eligibility (status ACTIVE/APPROVED, language supported, prerequisites met) is
a hard gate applied *before* scoring — a challenge either qualifies or it
doesn't; ranking is only among what qualifies. The weights themselves are a
prototype-stage judgment call, not a fitted model — see the manifest for what
"fitted" would require.

Every one of those six scores is attached to the winning candidate as a
`SelectionReason` (primary/secondary gap, role/difficulty/exposure/diversity
tier, numeric score, one-paragraph rationale). "Why was this challenge
selected?" (§41) is answered by reading data the ranking step already
produced — there's no separate explanation step that could drift from the
actual decision.

Difficulty fit is evaluated **per candidate against that candidate's own
skill**, not one global "recommended difficulty" for the whole selection call
— a validation challenge and a hashing challenge can be at completely
different points in the student's progression, and scoring them against a
single shared number would silently misrank one of them.

## Difficulty policy (§13, §14)

`nextDifficulty()` classifies an attempt *sequence* (not a single submission)
into one of six outcomes — `STRONG_SUCCESS`, `NORMAL_SUCCESS`,
`SUCCESS_WITH_HEAVY_HINTS`, `FAILURE`, `REPEATED_FAILURE`,
`REPEATED_STRONG_SUCCESS` — from real signals: final pass/fail, total hints
used across every submission in the sequence, and how strong the *first*
submission was. It only fires once a challenge is *resolved* (passed, in the
current implementation — see the manifest re: explicit abandonment), not on
every intermediate failed submission, because the policy needs the whole
sequence's shape (e.g. "used one hint but was 80% correct on the first try")
to make the §14-mandated distinction between "move up" and "hold steady."

## Mistake taxonomy & misconceptions (§27, §28)

`classifyMistakes()` never guesses from a description of a failure — every
rule keys off something the execution actually produced: the real Python/JS
exception type and message when a test throws, or the real pattern of which
test *categories* failed when it doesn't (all-edge/boundary failures with
normal tests passing reads as `OFF_BY_ONE`/`BOUNDARY_ERROR`; failures that
include NORMAL-category tests read as `WRONG_ALGORITHM` instead — a "handles
the main case, misses the edges" bug and a "doesn't work at all" bug are
different evidence and are recorded differently).

`updateMisconceptions()` will not label something a misconception from one
occurrence (§28's explicit instruction). Confidence escalates with repeated
same-category evidence on the same skill: 1 occurrence is tracked but silent,
2 is LOW, 3 is MEDIUM (matching §28's own worked example exactly), 4+ is HIGH.

## Deterministic vs. AI evaluation (§24-26)

`runDeterministicEvaluation()` is synchronous, doesn't call any network
service, and is what decides PASSED/FAILED. `runAIEvaluation()` runs after,
calls `AIProvider.coachOnAttempt()`, and on *any* failure (missing key,
network error, malformed response) resolves to `{ pending: true }` rather than
throwing — a submission's grade never depends on a vendor API being up (§44).
Partial-success detail (§26) is carried by the full `TestResult[]` array
(per-category pass/fail, not one boolean) rather than collapsed into a single
number the way a bare percentage would.

## Generation pipeline (§16-19)

Five stages, each independent of the AI call that started the pipeline:
schema validation → **execution validation** (the AI-drafted reference
solution is run against every AI-drafted test, for real, using the same
executor that grades students) → test-quality checks (degenerate test sets,
e.g. every expected output identical) → **adversarial validation** (two
deliberately-wrong "mutant" solutions must both fail at least one test, or the
draft is rejected as too weak to trust — see
`docs/CODEFORGE_CHALLENGE_RESEARCH.md` for why this specific technique) →
REVIEW. Nothing reaches ACTIVE through this pipeline automatically; REVIEW
still means a human looks at it (§37). `tests/generationPipeline.test.ts`
exercises every rejection path with mock providers, since this sandbox has no
live provider to exercise it against for real — see the manifest.
