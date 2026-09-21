# CodeForge Research Notes (§3, §61)

Scope note: this covers the areas of research that materially shaped implementation
decisions. It is not a literature survey — it's the record of what was checked before
building, per §3's requirement, plus a second pass after implementation (§61)
comparing what was built against what the research actually recommends.

## 1. Knowledge tracing (student mastery modeling)

**Researched:** how adaptive systems model "how well does this student know this
skill" over time.

- **Bayesian Knowledge Tracing (BKT)** — the classical approach (Corbett & Anderson,
  1994): a per-skill Hidden Markov Model with four parameters (initial mastery,
  slip, guess, learning rate), tracking a binary mastered/not-mastered latent
  state. Interpretable, cheap to compute, and still the standard baseline in
  intelligent tutoring systems.
- **Deep Knowledge Tracing (DKT)** and successors — RNN/LSTM/transformer models
  that learn mastery representations directly from interaction sequences.
  Current literature (2025-2026) reports better predictive accuracy than BKT on
  large interaction datasets, at the cost of interpretability, and a active line
  of work on hybrids (BKT-LSTM, PSI-KT, and similar) that try to recover BKT's
  interpretability without giving up DKT's flexibility.

**Adopted:** neither, directly — CodeForge's `recomputeSkillLevel()`
(`src/engine/skillGapAnalyzer.ts`) is a simple rule ("N consecutive hint-free
passes promotes a level, N consecutive failures demotes one"), not a probabilistic
model.

**Rejected (for this prototype specifically):** fitting a real BKT model needs
per-skill parameter estimation from a volume of interaction data this system
doesn't have yet (it has zero real students). Standing up BKT with default/guessed
parameters would be *less* honest than a transparent evidence-count rule, not
more — it would dress up a guess as a calibrated probability, which §10 and §63
explicitly warn against ("do not falsely claim mathematically precise difficulty
if it has not been calibrated").

**Implication for a real deployment:** once there's a real interaction history,
swapping `recomputeSkillLevel()` for a per-skill BKT estimator is the natural
next step — the function's interface (evidence in, level out) doesn't need to
change for the caller. DKT-style sequence models are a reasonable second step
after that, once there's enough volume to train one, but they'd sit behind the
same interface for the same reason.

## 2. Generated-content validation (§16-19)

**Researched:** how the software-testing literature validates AI-generated test
suites, since §17-19's "AI must not certify its own answer" is really a test-oracle
problem.

**Adopted directly: mutation testing.** A 2023-2024 line of work (MuTAP and its
successors) specifically targets this: LLM-generated tests are checked by seeding
deliberate faults ("mutants") into the reference solution and confirming the tests
actually catch them, because code-coverage alone is weakly correlated with real
bug-detection ability. That's precisely
`src/generation/generationPipeline.ts`'s Stage 5 (adversarial validation) — two
mutant solutions ("always returns None", "echoes its first argument") are run
against every drafted test, and the draft is rejected if a mutant slips through
undetected. `tests/generationPipeline.test.ts` proves this rejection actually
fires, not just that the code compiles.

**Adopted with a deliberate reduction in scope:** the more sophisticated versions
of this idea (MuTAP's *iterative* prompt-augmentation loop, which feeds surviving
mutants back to the LLM to re-generate stronger tests) is a real, better next
step. This prototype does one static round — generate, then validate, then accept
or reject outright — rather than a repair loop, because a repair loop needs a live
provider to iterate against and this sandbox has none to test it with (see
`docs/IMPLEMENTATION_MANIFEST.md`). The pipeline's stage boundaries were built so
that loop can be added later without restructuring anything: retry stage 1 with
the stage 5 failure appended to the prompt, cap the retries, and everything
downstream of "draft" is unchanged.

**Rejected:** LLM-as-judge ("ask a second model whether the first model's
challenge looks good") was considered and rejected as the *primary* validation
mechanism. It doesn't satisfy §17 — an LLM judging an LLM's output is still
self-certification one level removed. It could reasonably be an additional,
labeled-as-such signal for the human reviewer at the REVIEW stage (§37), but
independent execution against the same harness that grades students is the only
mechanism that decides APPROVED/REJECTED in this implementation.

## 3. Coding assessment / automated evaluation platforms

**Researched:** the general shape of automated code-judging systems (the LeetCode/
HackerRank/competitive-programming-judge family) as prior art for the execution
and test-case model.

**Adopted:** the function-harness pattern (student implements a named function;
a small language-specific wrapper calls it with JSON-decoded arguments and
JSON-encodes the result for comparison) is standard in this space and is what
`src/execution/executor.ts` implements for both Python and JavaScript. Public/
hidden test separation, and per-test-case category tagging (normal/edge/boundary/
etc., §18) are likewise standard practice, not novel to this project.

**Rejected as a model to copy wholesale:** competitive-programming judges
optimize for adversarial-contestant assumptions (strict time limits, tight
memory, obscure edge cases as the point of the exercise) that don't fit a
learning platform's goals. §31's "real-world engineering tasks" requirement — a
CSV transform, an API validator, a file-processing script — is a deliberate
departure from that tradition, which is why the seed challenges
(`src/data/seedChallenges.ts`) include scenario framing (role/objective/scenario/
task, §32) rather than terse competitive-programming problem statements.

## 4. Sandboxed execution

**Researched, empirically, inside this sandbox specifically** (not just from
documentation) — see `docs/CODEFORGE_CHALLENGE_SECURITY.md` for the full writeup
and the exact commands run. The short version: `ulimit -v` (virtual memory) is a
workable memory bound for a CPython subprocess but reliably crashes a Node.js
subprocess on startup, because V8 reserves a large virtual address range
independent of actual heap usage. `--max-old-space-size` (a Node/V8 flag that
bounds the heap directly) is the correct tool for that job instead. This is the
kind of environment-specific fact that's easy to get wrong by assumption, which
is why it was verified by actually running both success and failure cases rather
than asserted from general knowledge.

## 5. Second pass (§61) — what changed after implementation

Re-reading the above against what got built:

- The evidence-count skill-level rule is the one area where the gap between
  "what the literature recommends" (BKT at minimum) and "what's implemented" is
  largest. This is flagged, not hidden — see
  `docs/IMPLEMENTATION_MANIFEST.md` — because pretending otherwise would violate
  §63 directly.
- The mutation-testing-based adversarial validation stage was *added* during this
  pass — the first draft of the generation pipeline stopped at schema + execution
  validation. Reading the LLM-testing literature specifically surfaced the
  "weak tests that technically pass validation" failure mode, which is exactly
  what `tests/generationPipeline.test.ts`'s degenerate-test and adversarial-
  validation cases now cover.
- No feature was added purely because it "sounds impressive" (§61's explicit
  warning) — e.g., LLM-as-judge was considered and deliberately left out for the
  reason given above, not omitted for lack of ideas.
