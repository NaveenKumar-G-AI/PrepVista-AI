# Question Quality Engine

Reference implementation of ACEAPT Feature 53 — the validation and trust layer that sits
between question authoring/generation and every downstream learning system. Built as a
**standalone, integration-ready TypeScript service**: no existing ACEAPT codebase was provided
to inspect, so this ships with its own in-memory data store and REST API, designed to be wired
into a real database, auth system, and skill graph without touching validator or service logic.

No secrets are hardcoded anywhere. `.env.example` lists everything you can configure — copy it
to `.env` and fill in what you need; every value defaults to "off" or heuristic-only behavior.

## Quick start

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest — 91 tests, see "Test coverage" below
npm run demo        # runs src/demo.ts — reproduces the spec's own worked examples end-to-end
npm run dev         # starts the REST API on http://localhost:8787 (in-memory store)
```

Then open `admin-console/index.html` (any static server, or just double-click it) for a working
review UI — it talks to the live API on `localhost:8787` and includes a **Seed demo data**
button so you're not staring at an empty queue.

## What's real vs. stubbed

| Area | Status |
|---|---|
| Deterministic validators (schema, answer, solution, skill, difficulty, similarity, clarity, distractor, fairness/accessibility) | **Real logic**, unit-tested |
| Independent math solver (percentages, ratios, simple interest, averages, probability, custom expressions) | **Real**, hand-written recursive-descent evaluator — no `eval()` |
| Lifecycle state machine, versioning, review workflow, report triage, publication/suspension | **Real logic**, service-tested |
| Data store | In-memory (`src/db/memoryRepository.ts`). `db/schema.sql` is the production Postgres schema — implement `QuestionRepository` against it and pass it to `createEngine()` |
| AI-assisted validation | **Real integration code** (calls the Anthropic Messages API), but inert until you set `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` in `.env`. Degrades gracefully when unset — see "AI validation" below |
| Auth | **Demo stand-in** (`x-demo-role` / `x-demo-tenant` / `x-demo-actor` headers, read by `src/api/middleware.ts`). Replace with real session/JWT verification before this sees real traffic |
| Skill graph (Feature 45), semantic similarity | Pluggable ports (`SkillGraphPort`, `SemanticSimilarityPort`) with tiny zero-dependency fallbacks. Wire your real services in via `createEngine(repo, { skillGraph, semanticSimilarity })` |
| Features 42–52 integration | Exposed as clean integration surfaces (`PublicationService.isEligibleForMode`, `.shouldExcludeFromAggregate`) since those features' codebases don't exist in this environment — see "Integration surface" below |

## Architecture

```
question-quality-engine/
├── db/schema.sql            production Postgres schema (sections 114-120)
├── admin-console/index.html Question Quality Center — review queue + evidence + decisions
├── src/
│   ├── types/                enums.ts, domain.ts — the shared vocabulary
│   ├── domain/                computation.ts (independent solver), text.ts (similarity)
│   ├── utils/                  safeMath.ts (no-eval expression evaluator), misc.ts
│   ├── validators/              one file per quality dimension + pipeline.ts (orchestration,
│   │                            determineQualityStatus)
│   ├── security/                 sanitizeContent.ts (prompt-injection defense), rbac.ts
│   ├── db/                        repository.ts (interface) + memoryRepository.ts (impl)
│   ├── services/                   lifecycleService, versioningService, questionQualityService,
│   │                               reviewService, reportService, publicationService,
│   │                               poolAnalyticsService, telemetry (audit + analytics),
│   │                               index.ts (createEngine — single composition root)
│   ├── api/                         Express routes matching section 126's operation list
│   └── demo.ts                       runnable, narrated walkthrough (npm run demo)
└── tests/                              12 files, 91 tests — see "Test coverage"
```

**Pipeline** (`src/validators/pipeline.ts`): every question version runs through Schema → Answer
→ Solution → SkillAlignment → Difficulty → Similarity → Clarity → Distractor →
FairnessAccessibility → AI (if configured), in that order, deterministic checks first (section
13: *"Never make an LLM the only source of truth for critical correctness"*). Each validator
returns a list of `Issue`s with a severity; `determineQualityStatus` is a **pure function**
mapping the worst open severity to a `QualityStatus` — any `CRITICAL` issue forces `BLOCKED`,
nothing else can. The full issue list always travels with the status; it's never collapsed to
one opaque number (section 75).

**Composition root** (`src/services/index.ts`): `createEngine(repository, ports)` wires
everything together. This is the one place a real deployment needs to change — swap
`MemoryRepository` for a real adapter, pass in real `skillGraph`/`semanticSimilarity` ports, and
every service, validator, and route works identically.

## Design decisions worth knowing about

The spec is a product vision, not a formal contract, so a few things needed concrete judgment
calls. Documented here (and in code comments at each site) rather than buried:

- **Severity → status mapping** is a single table in `determineQualityStatus`
  (`src/validators/pipeline.ts`): `CRITICAL` → `BLOCKED`, `HIGH`/`MEDIUM` → `NEEDS_REVIEW`,
  `LOW` → `PASS_WITH_WARNING`, nothing → `PASS`. Every validator's severity choice is a judgment
  call too — they're grouped by validator file with inline reasoning at each `makeIssue()` call.
- **System auto-rejection never happens.** A `BLOCKED` quality status routes the question to
  `NEEDS_REVIEW`, never to `REJECTED` — only a human `ReviewService` decision sets `REJECTED`.
  This matches "human review should be available for disputed correctness" (section 16) taken
  literally: the system flags, a person decides.
- **Purpose-aware auto-approval** (`questionQualityService.ts`): only low-stakes purposes
  (PRACTICE, LEARNING, DIAGNOSTIC, GUIDED, TRANSFER, TIMED) can be auto-approved by the system
  on a clean `PASS`/`PASS_WITH_WARNING`. `ASSESSMENT` and `MASTERY` always land on a human's desk
  regardless of how clean the pipeline result is (section 44).
- **Reviewers can override a CRITICAL block**, but only with an `overrideReason` that's logged
  prominently to the audit trail (`ReviewService.reviewQuestion`) — the alternative (an absolute,
  unoverridable hard gate) doesn't match how real content teams actually work, but silent
  overrides would defeat the entire point of Feature 53, so overrides are loud, not silent.
- **FairnessAccessibilityValidator** deliberately avoids being a general-purpose bias classifier
  (a keyword list claiming to detect "bias" would be both unreliable and overconfident). It
  checks well-established, objective item-writing flaws instead: option-length bias, absolute-term
  ("always"/"never") distractor bias, and diagram alt-text/stem-length accessibility basics.
- **Answer-position bias** (section 31) is implemented as a pool-level function
  (`poolAnalyticsService.ts`), not a per-question validator — the spec is explicit that a single
  question's answer sitting in slot B is meaningless; only the pool-wide distribution matters.
- **Provenance is inlined** onto `QuestionVersion` rather than a separate `QuestionProvenance`
  table — every provenance field (section 73) is 1:1 with a version anyway, so a join table would
  only add a foreign-key hop with no new information. Noted in `db/schema.sql`.
- **The independent math solver never uses `eval()`/`Function()`.** Question content — including
  any `CUSTOM_EXPRESSION` string — is untrusted input (section 87/132), so
  `src/utils/safeMath.ts` is a hand-written recursive-descent parser/evaluator. Tested against
  literal injection attempts in `tests/pipelineStatus.test.ts`.

## AI validation

`src/validators/aiValidator.ts` calls the Anthropic Messages API when `ANTHROPIC_API_KEY` and
`ANTHROPIC_MODEL` are set in the environment. Three things are enforced structurally, not just by
convention:

1. **Content is fenced and framed as data, never instructions**
   (`src/security/sanitizeContent.ts::wrapUntrustedContent`), with an explicit system-prompt
   instruction not to follow anything inside the fence (sections 87/132).
2. **AI output is capped below `CRITICAL` by construction** — `aiSignalToIssues` can only ever
   emit `MEDIUM` or lower. It is architecturally impossible for the AI step alone to block a
   question (sections 13/15).
3. **Unavailability degrades gracefully, purpose-aware.** If the key/model aren't set (or the
   call fails), low-stakes questions can still `PASS` on deterministic evidence alone;
   `ASSESSMENT`/`MASTERY` questions are routed to `NEEDS_REVIEW` instead of being silently
   auto-approved with one fewer check applied (sections 44/136/137/160 — tested in
   `tests/aiFallbackAndSecurity.test.ts`).

## Integration surface (for Features 42–52-style consumers)

None of those systems' code exists in this environment, so Feature 53 exposes the contract they'd
call rather than guessing at their internals:

- `PublicationService.isEligibleForMode(questionId, mode)` — the single choke point for "can this
  question be shown right now," mode-aware (`PRACTICE` tolerates `WATCH` health; `ASSESSMENT`/
  `TIMED_CHALLENGE` demand full `HEALTHY` + a validated trust level).
- `PublicationService.shouldExcludeFromAggregate(questionId, metric)` — the hook accuracy/speed/
  mastery/readiness systems should call before folding a question's results into an aggregate
  (sections 57–59/70). A suspended question's history is never deleted; this only says "don't
  trust new evidence from it."

## Security

- **RBAC** (`src/security/rbac.ts`): five roles, permission sets, and `filterQuestionVersionForRole`
  — students and trainers never receive `answerKey` or `solution` through the API, regardless of
  what they ask for (sections 89/103/130).
- **Tenant isolation** (`assertTenantAccess`): non-global content is only visible within its own
  tenant. A resource with no tenant assigned at all has nothing to isolate against and is treated
  as accessible (this exact edge case was caught by the live smoke test during development, not
  guessed at — see git-style note in `rbac.ts`).
- **Prompt-injection defense**: question content is fenced before reaching any AI call, and a
  separate detection-only heuristic (`containsSuspiciousInstructionPattern`) flags suspicious
  content for extra scrutiny **without ever changing validator behavior** — tested explicitly in
  `tests/aiFallbackAndSecurity.test.ts` by feeding a real injection attempt through the full
  pipeline and confirming the objective defect is still caught on its own merits.
- **Auth is a stand-in.** `demoAuth` middleware trusts headers as-is. `DEMO_ADMIN_TOKEN` in
  `.env.example` is where real verification plugs in.

## Test coverage

91 tests across 12 files. Each file header maps back to the spec sections it exercises; the
worked examples from the spec (20% of 500, the skill-mismatch example, the difficulty-anomaly
example) are reproduced **literally**, not paraphrased:

| File | Covers |
|---|---|
| `answerAndSchema.test.ts` | Schema validation; sections 19/26/144-146 (mismatch, no-valid-option, multiple-valid, probability bounds) |
| `solutionAndSkill.test.ts` | Sections 40/64/147/148 |
| `similarityAndClarity.test.ts` | Sections 34/35/94/149/150/167 |
| `difficulty.test.ts` | Sections 47/51/151 |
| `distractorAndFairness.test.ts` | Sections 28-31 |
| `lifecycleAndVersioning.test.ts` | Sections 8/14/71/72/105/161/162 |
| `reports.test.ts` | Sections 52-54/118/152/166 |
| `suspensionAndProtection.test.ts` | Sections 55-60/70/104/153-157 |
| `aiFallbackAndSecurity.test.ts` | Sections 87/132/136/137/158-160 |
| `reviewConcurrencyAndRoles.test.ts` | Sections 78/89/90/163-165 |
| `poolAnalytics.test.ts` | Sections 31/91-94 |
| `pipelineStatus.test.ts` | Pure `determineQualityStatus`; the safe-expression evaluator, including literal injection attempts |

**Not automated**: section 168's cross-feature regression suite (Features 42–52, mastery,
retention, readiness, dashboard) — those systems don't exist in this environment, so there's
nothing to regress against. The integration surface they'd consume is covered instead (see
above).

## P0 / P1 / P2 (section 141-143)

- **P0 — built and tested**: every checklist item in section 141 (schema/answer/solution/math/
  logic/skill/difficulty/clarity/ambiguity/single-multi-answer/distractor/duplicate validation;
  lifecycle; versioning; provenance; student reporting; review workflow; suspend; audit trail; AI
  validation safety; pool eligibility; mastery/readiness protection surface; security;
  accessibility heuristics; tests).
- **P1 — started**: structural fingerprints and pool-diversity checks (`similarityValidator.ts`,
  `poolAnalyticsService.ts`) and a working admin console are in; generator-quality analytics,
  automated revalidation scheduling, and a full statistical item-discrimination analysis are not
  — `AnalyticsService` logs every event needed to build them, but the aggregation itself isn't
  written.
- **P2 — architected for, not built**: multimodal/diagram correctness validation (the `Diagram`
  type has an `altText` field and a validator hook; no image analysis), autonomous question-family
  discovery, predictive item-failure detection.

## Extending this

- **Real database**: implement `QuestionRepository` (`src/db/repository.ts`) against
  `db/schema.sql` with your driver of choice; pass it to `createEngine()` instead of
  `MemoryRepository`.
- **Real auth**: replace the body of `demoAuth` in `src/api/middleware.ts` with real session/JWT
  verification that derives `role`/`tenantId` from a signed token.
- **Real skill graph**: implement `SkillGraphPort.isSkillValidForComputation` against Feature 45
  and pass it to `createEngine(repo, { skillGraph })`.
- **Semantic similarity**: implement `SemanticSimilarityPort.mostSimilar` against your embeddings
  provider and pass it the same way.

Run `npm audit` before any production use — the transitive dependency tree (mainly from
`express@4`) currently reports a handful of advisories typical of that ecosystem; none are in
code paths this project exercises, but it's worth checking against your own risk tolerance.
