# CodeForge AI — Technical Diagnostic
## Architecture, Verification Record & Truth Table

## 0. Scope and how this was built

No repository, Supabase project, or Groq/Gemini credentials are reachable from
this chat environment — there is no codebase to run reconnaissance against
(build-prompt section 1). Consistent with how [[prepvista-ai]] Parts 8 and 16
were handled, the architecture decisions here were made directly rather than
deferred back with clarifying questions, and delivered as a standalone
reference implementation meant to be dropped into the real repo: a
zero-dependency engine, a schema, a provider-abstracted AI contract, one React
view, and this document — the same shape as those prior parts.

Everything below was actually run, not just reviewed. See §7.

## 1. Files delivered

| File | What it is |
|---|---|
| `domain-model.js` | Skills, roles, the validated task bank + Q-matrix, blueprint builder |
| `adaptive-engine.js` | Deterministic evaluators, task selection, evidence/confidence/level scoring, session orchestration |
| `ai-evaluation-contract.js` | Schema-validated AI evaluation contract, prompt builder, deterministic mock provider |
| `demo-verify.js` | Runs 6 fixture students through the real engine and asserts real properties — `node demo-verify.js` |
| `schema.sql` | Postgres/Supabase DDL + an illustrative RLS policy sketch |
| `codeforge-diagnostic-view.jsx` | Interactive React demo — role select → adaptive session → baseline report |

## 2. Pipeline

The diagram shown in chat is the real shape of this build: role context sets
required skills → a blueprint fixes budget/coverage/stopping rules → adaptive
task selection and evidence capture repeat until stopping criteria are met →
a baseline profile is generated from whatever evidence actually exists.

## 3. Research grounding

Three sources materially shaped design decisions (not decoration — each maps
to a specific mechanism below):

**Han (2018), "Components of the item selection algorithm in computerized
adaptive testing,"** *J Educ Eval Health Prof* 15:7 —
[doi.org/10.3352/jeehp.2018.15.7](https://doi.org/10.3352/jeehp.2018.15.7).
Identifies three components of a CAT item-selection algorithm: content
balancing, the item selection criterion, and item exposure control. This is
directly why the blueprint (§7 of the build prompt) separates *coverage
rules* from the *selection heuristic* from *exposure tracking* as three
distinct concerns in `diagnostic_blueprint`, rather than one undifferentiated
"pick a task" function.

**Duan, Fernandez, Hicks & Lan (2025), "Test Case-Informed Knowledge Tracing
for Open-ended Coding Tasks" (TIKTOC),** LAK '25 —
[arxiv.org/abs/2410.10829](https://arxiv.org/abs/2410.10829). Argues that
knowledge tracing on overall pass/fail alone misses information present in
per-test-case results and the code itself. This is why `evaluateDeterministic`
returns a `PARTIAL` performance tier (not just correct/incorrect) and why
`runJsTests` preserves per-test-case results rather than collapsing to a
single boolean — the evidence record keeps that granularity even though the
scoring heuristic here is far simpler than TIKTOC's learned model.

**Potenza & Stocking (1994), "Flawed Items in Computerized Adaptive
Testing,"** ETS Research Report Series —
[onlinelibrary.wiley.com/doi/10.1002/j.2333-8504.1994.tb01579.x](https://onlinelibrary.wiley.com/doi/10.1002/j.2333-8504.1994.tb01579.x).
Opens by noting that despite quality-control procedures, administering a
flawed item is inevitable at scale. This is why `quality_status` is a
first-class, gated field (`DRAFT → REVIEW → VALIDATED → ACTIVE → DEPRECATED`)
in both the schema and `domain-model.js`, rather than a boolean "is this
task good." Stocking & Lewis's 1995 exposure-control work (cited inside the
Han paper above) is why `diagnostic_task` carries `exposure_count` /
`last_exposed_at` at all, even though this build's exposure *policy* is a
placeholder (see truth table).

## 4. Domain model

11 tasks across 2 roles (`AI / ML Engineer`, `Backend Engineer`), deliberately
small and hand-validated rather than generated in bulk — build-prompt §15 is
explicit that a diagnostic task bank should be small and good, not large and
weak. `pf_1` (the word-frequency task) is shared across both roles, which is
the "transferable evidence" idea in §50: a canonical skill (`prog_fund`)
isn't re-assessed per role.

Every task carries a Q-matrix (`skills: [{skillId, relationship, weight}]`)
with `PRIMARY / SECONDARY / PREREQUISITE / CONTEXTUAL` relationships. Two
tasks (`algo_1`, `complexity_1`) declare `prerequisiteCheckTaskId: 'recursion_1'`
— if either is answered incorrectly, `recursion_1` gets inserted into the
session next, ahead of ordinary coverage-driven selection. That's the
concrete implementation of build-prompt §23-24 ("one failure isn't strong
evidence — check the prerequisite before concluding the higher skill is
weak").

## 5. Adaptive selection (heuristic, not IRT)

`selectNextTask` is a priority list, in order:
1. A pending prerequisite check, if one was triggered and hasn't run yet.
2. Otherwise, whichever required skill has the fewest evidence points so far,
   via whichever not-yet-presented task PRIMARY-targets it.

`shouldStop` returns a `completion_reason` (`TASK_BUDGET_REACHED`,
`EVIDENCE_SUFFICIENT`, `TASK_BANK_EXHAUSTED`, or `ABANDONED`) — every session
end is attributable, per build-prompt §44.

This is explicitly a **prototype heuristic** (build-prompt §98,
"psychometric honesty"). It is not item response theory, not Bayesian
knowledge tracing, and every task's `calibrationStatus` is implicitly
`UNCALIBRATED` — no empirical item parameters exist because no student has
ever taken this outside of the fixture runs below.

## 6. Evidence, confidence, and level — the rules that matter

These were the actual bugs `demo-verify.js` caught (§7), so they're worth
stating precisely:

- **One data point never earns top-tier confidence or level.** A single
  correct answer caps at `COMPETENT` / `LOW` confidence, never `ADVANCED` /
  `HIGH` — matching build-prompt §25 ("one easy success is not sufficient for
  STRONG") applied to level, not just confidence, which the first draft of
  this engine got wrong.
- **Inconsistent evidence caps confidence at LOW**, regardless of how many
  data points exist. Three data points where the outcomes disagree is *not*
  the same as three data points that agree — `computeSkillConfidence` checks
  `allSame` before ever returning `MEDIUM`/`HIGH`.
- **A skill only ever reachable as SECONDARY/CONTEXTUAL evidence (no task
  PRIMARY-tags it — `tech_reasoning` in this build) must still count as
  coverable**, or the stopping logic gives up early believing a real gap
  exists. Fixed in `shouldStop`.
- **`INSUFFICIENT_EVIDENCE` is a distinct, valid outcome**, not a low score —
  a skill the session never reached shows exactly that, never a fabricated
  "weak."
- **The recommended starting point is suppressed, not forced**, when nothing
  required is below `COMPETENT` — see the `STRONG_ENGINEERING_STUDENT` fixture,
  which correctly gets no recommendation at all rather than a nitpicked one.

## 7. Verification — what was actually run

Every claim below is reproducible by running the file named.

**`node demo-verify.js` — 37/37 checks passing.** Not hand-picked assertions
against canned output — six fixture students (all six from build-prompt §91:
`STRONG_ENGINEERING_STUDENT`, `BEGINNER_STUDENT`, `UNEVEN_STUDENT`,
`NOISY_PERFORMANCE_STUDENT`, `HIGH_HINT_DEPENDENCY_STUDENT`,
`INCOMPLETE_DIAGNOSTIC_STUDENT`) run through the real selection engine, real
in-process JS test execution, and the real mock AI scorer. Checks cover: the
prerequisite branch firing (and *not* firing) correctly, confidence staying
low under inconsistent evidence, an unreached skill reporting
`INSUFFICIENT_EVIDENCE` rather than a fabricated weakness, idempotent replay
producing no duplicate evidence, hidden test-case answers never surviving
`sanitizeTaskForClient`, and role-specific task pools never crossing over.

**This process caught five real bugs**, fixed in order: a wrong expected
value in a hand-written test case (arithmetic error), the early-stopping bug
described in §6, keyword-matching in the mock AI grader diluted by rubric
prose down to a ~19% hit rate on a genuinely good answer, level-inflation
from a single evidence point, and an over-eager recommendation that flagged
a `STRONG`-level skill as a "priority gap" for an otherwise excellent
student. None of these were visible from reading the code — only from
running it.

**The React view's logic was cross-validated, not just eyeballed.** Because
a single-file browser artifact can't `require()` the Node engine, the same
logic is duplicated in `codeforge-diagnostic-view.jsx`. That duplication was
verified two ways: (1) the same 11-task data and engine functions were
mechanically extracted from the shipped `.jsx` file and run against the same
six personas — 12/12 cross-checks passed, confirming the port matches the
tested engine, not a re-remembered approximation of it; (2) the JSX was
transpiled with `sucrase` (a real JSX transformer, found already present as a
transitive dependency in this environment) and then actually **server-side
rendered with real React 19** — not just visually reviewed — across all 9
major render branches: role select, mode select, each of the four task-type
renderers (coding, multiple choice, open-ended, SQL), the post-submit result
panel in both the normal and AI-fallback states, and the baseline report in
both the "has a recommendation" and "no gap found" states. All 9 rendered
with no thrown errors. That process caught one real bug: `startDiagnostic`
called `setMode()` and then immediately read the (not-yet-updated) `mode`
state in the same tick, so a simulation's first task wasn't pre-filled with
the scripted answer. Fixed by passing the chosen mode through explicitly.

**Not verified, and this matters:** live click-by-click interaction in an
actual browser (no bundler was available to load React client-side in this
sandbox — SSR proves each screen *renders*, not that every click handler
behaves correctly end-to-end, though the underlying functions it calls are
the same ones covered by the 37+12 checks above), and the real network call
to `api.anthropic.com` from inside the artifact (no network in this
container; the code path is real and the fallback-on-failure path *was*
exercised, but a live Claude response was never actually observed here).

## 8. AI evaluation architecture

Deterministic and AI-assisted scoring are strictly separated
(build-prompt §32) — `evaluateDeterministic` handles CODING / DEBUGGING /
CODE_READING / COMPLEXITY_REASONING and never touches an LLM; only
CONCEPTUAL / TECHNICAL_REASONING / EXPLANATION responses go through
`needsOpenEndedEvaluation` → an injected evaluator. The AI is never allowed
to overrule an execution result.

The evaluator is provider-abstracted: `ai-evaluation-contract.js` defines the
prompt, the required JSON schema, and a validator that rejects anything
off-schema before it can be persisted as evidence. Two evaluators implement
that same contract — `createDeterministicMockProvider` (no network, used by
`demo-verify.js`) and `claudeEvaluate` in the React view, which makes a real
call to Claude Sonnet 4.6 via the in-artifact API mechanism as a stand-in for
Groq/Gemini (no keys or network reach those from this environment). Wiring
in real Groq/Gemini means writing a fetch call whose response text is piped
through the same `parseProviderJson` validator — nothing else changes.

Provider failure never reads as student failure (build-prompt §68): a failed
or invalid model response falls back to a local keyword heuristic, clearly
labeled `providerUsed: 'local-fallback'` in the UI rather than silently
passed off as a real grade.

## 9. API contracts (not implemented as running endpoints — see truth table)

```
GET  /codeforge/diagnostic/config/:roleId
POST /codeforge/diagnostic/sessions
GET  /codeforge/diagnostic/sessions/:sessionId
POST /codeforge/diagnostic/sessions/:sessionId/responses   (idempotency_key required)
POST /codeforge/diagnostic/sessions/:sessionId/pause
POST /codeforge/diagnostic/sessions/:sessionId/resume
POST /codeforge/diagnostic/sessions/:sessionId/complete
GET  /codeforge/diagnostic/sessions/:sessionId/baseline
```
A student may create/read/respond-to/pause/resume their own session and read
their own baseline; never another student's, never hidden task content
(`sanitizeTaskForClient` strips `correctIndex`, `aiRubric`, `sqlChecks`, and
hidden test-case `expected` values — verified in `demo-verify.js`).

## 10. Events

`CODEFORGE_DIAGNOSTIC_STARTED`, `_TASK_PRESENTED`, `_RESPONSE_SUBMITTED`,
`_RESPONSE_EVALUATED`, `_TASK_SKIPPED`, `_COMPLETED`, `_ABANDONED`,
`CODEFORGE_SKILL_EVIDENCE_CREATED`, `CODEFORGE_BASELINE_CREATED`,
`CODEFORGE_BASELINE_UPDATED` — named per build-prompt §73, not wired to a
real event bus here (there isn't one to wire to). Payloads should carry
entity IDs only, never raw code or answers (§74).

## 11. Versioning

Every session in the schema carries `blueprint_version`, and every response
references `(task_id, task_version)`. `adaptive-engine.js` stamps each
session with `adaptivePolicyVersion: 'heuristic-v1'` and
`evaluationLogicVersion: 'eval-logic-v1'`; the AI contract has its own
`EVAL_SCHEMA_VERSION`. If the heuristic changes later, historical sessions
stay interpretable against the policy that actually produced them
(build-prompt §65-67) — verified as present on every completed session in
`demo-verify.js`.

## 12. Integration points

- **Role Context → Diagnostic:** this module reads `role.requiredSkills`
  only; `ROLES` in `domain-model.js` is a stand-in for that real service and
  is marked as such.
- **Diagnostic → Code execution:** `runJsTests` uses in-process `Function()`
  execution as a stand-in for a real sandboxed execution service
  (build-prompt §29 says not to build a second execution engine — this only
  exists because no real one is reachable here). Fine for a trusted demo;
  not what should run untrusted production submissions.
- **Diagnostic → PrepVista unified student intelligence:** the export shape
  in build-prompt §89 (`student_id, role_id, diagnostic_id, skills[], 
  recommended_starting_skill, diagnostic_version`) maps directly onto
  `generateBaseline()` + `pickRecommendation()`'s return values — this is
  the contract [[prepvista-ai]] would consume as the `technical_baseline`
  input once a real session store exists.

## 13. Truth table

| Capability | Status | Note |
|---|---|---|
| Role-aware coverage (2 roles, distinct required skills) | **IMPLEMENTED** | Verified: backend sessions never touch ai_ml-only tasks |
| Task bank + Q-matrix | **IMPLEMENTED** | 11 hand-validated tasks, `PRIMARY/SECONDARY/PREREQUISITE/CONTEXTUAL` |
| Task versioning | **PARTIALLY IMPLEMENTED** | Schema + evidence reference `(task_id, version)`; only version `1` of anything exists — no live re-versioning exercised |
| Adaptive task selection | **IMPLEMENTED** | Interpretable heuristic, verified across 6 personas |
| Prerequisite-aware branching | **IMPLEMENTED** | Verified firing on `UNEVEN`/`NOISY`/`BEGINNER`, verified *not* firing on `STRONG` |
| Evidence model (multi-type, weighted) | **IMPLEMENTED** | `CORRECT/PARTIAL/INCORRECT/UNSCORED` × relationship weight |
| Independence signal (hints) | **IMPLEMENTED** | Verified: assisted evidence caps level, never reaches `ADVANCED` on its own |
| Confidence (INSUFFICIENT/LOW/MEDIUM/HIGH) | **IMPLEMENTED** | Verified inconsistency-suppression and single-point capping |
| Uncertainty-first baseline | **IMPLEMENTED** | `INSUFFICIENT_EVIDENCE` verified on an unreached required skill |
| Deterministic code execution evidence | **DEMO ONLY** | Real in-process JS execution, real bugs caught by it — but `Function()`, not a sandboxed execution service |
| SQL evaluation | **DEMO ONLY** | Regex clause-matching, not a real SQL parser/engine |
| AI-assisted open-ended evaluation | **PARTIALLY IMPLEMENTED** | Real, schema-validated, provider-abstracted contract; live call uses Claude as a stand-in for Groq/Gemini and was never actually observed to succeed from this environment (no network) — fallback path *was* exercised |
| AI cannot override deterministic results | **IMPLEMENTED** | Structurally separate code paths, not a prompt instruction |
| Hidden-answer security | **IMPLEMENTED (server-authoritative case)** | `sanitizeTaskForClient` verified to strip answer keys; the React demo's "hidden" test is UX-only, since the answer key sits in the same browser scope — real security needs a real backend, noted explicitly |
| Idempotent response submission | **IMPLEMENTED** | Verified: replaying a submission does not duplicate evidence |
| Session persistence / resume | **NOT IMPLEMENTED** | Schema models it (`diagnostic_session.status`, `PAUSED`); no server exists to persist to |
| Database schema | **IMPLEMENTED (as DDL)** | Written to Postgres/Supabase conventions; never executed against a live instance (no `psql` reachable here) |
| RLS / authorization | **DEMO ONLY** | Illustrative policy sketch in `schema.sql`, commented out, never applied or tested against a live Supabase project |
| API endpoints | **NOT IMPLEMENTED** | Contract specified (§9); no HTTP server exists in this deliverable |
| Event emission | **NOT IMPLEMENTED** | Event names specified (§10); no event bus wired |
| Versioning fields | **IMPLEMENTED** | Present and populated on every session/evidence/task row |
| React diagnostic view | **IMPLEMENTED, SSR-verified** | See §7 for exactly what "verified" means here |
| Item calibration (IRT/BKT) | **NOT IMPLEMENTED** | Explicitly out of scope per build-prompt §17, §99 — every task is `UNCALIBRATED` |
| Item exposure control policy | **NOT IMPLEMENTED** | Schema carries `exposure_count`/`last_exposed_at`; no policy reads or acts on them yet |

## 14. Honest limitations

- The task bank is small on purpose (11 tasks) — real confidence ceilings in
  the demo output reflect that (`MEDIUM` at best in most runs, by design, not
  a bug).
- The scoring heuristic in §6 is defensible, not validated — no student has
  ever taken this for real, so there is no empirical basis to claim more.
- The React view duplicates engine logic rather than sharing it, because a
  single-file browser artifact cannot import server modules. Keeping the two
  in sync is a manual discipline this build followed once (verified in §7)
  but a real integration should share one implementation.
- `tech_reasoning` (AI/ML role) is only ever reachable as `SECONDARY`
  evidence in this task bank — realistic, but worth adding a `PRIMARY`-tagged
  task for before this ships.
