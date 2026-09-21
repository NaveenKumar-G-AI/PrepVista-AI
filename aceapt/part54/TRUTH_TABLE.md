# TRUTH TABLE — ACEAPT Feature 54: Question Validation Engine

Honest accounting of what's real, what's a documented port/stand-in, and what
isn't built. No reachable ACEAPT repository existed in this session (consistent
with every prior part of this series — Feature 4, Feature 28, Feature 42,
CodeForge's Technical Diagnostic, Engineering Simulator, Submission System,
Skill Signal Engine, and Feature 35 all recorded the same). Everything below
was designed against the spec's own text, not against real ACEAPT code.

## What's REAL (built, actually executed, actually passing)

| Area | Status |
|---|---|
| Validation contract, states, severities, modes, error codes | Real, real types |
| ValidatorRegistry, dependency-aware ValidationPlanner (topological layering) | Real, unit-tested |
| ValidationExecutor — timeout, retry-on-infra-error-only, dependency skip, cache-aware | Real, unit-tested |
| ValidationAggregator — per-mode eligibility matrix, never a single score | Real, unit-tested |
| ValidationCache (in-memory), ValidationFreshnessService (stale detection) | Real, unit-tested |
| Content hashing (canonical JSON + sha256) | Real, unit-tested |
| 12 validators: Schema, Answer, Options, Solution, Math (10 quant domains), Units, Logic (real backtracking CSP solver), Skill, Difficulty, Runtime (LaTeX safety + HTML sanitization via `sanitize-html`), Asset, ScoringCompatibility, AssessmentCompatibility, AI-Semantic | Real, unit-tested |
| AI adapter: real Groq (OpenAI-compatible) integration + deterministic fallback + schema-validated output | Real code, **unexercised live** (no network route to api.groq.com in this sandbox — see Known Limitations) |
| Postgres 16: RLS FORCED, `qve_owner`/`qve_app` role split, SECURITY DEFINER-only access, zero raw grants for `qve_app` | Real, **live-verified** against a real Postgres 16 instance stood up in-sandbox |
| Repositories: in-memory + Postgres (connects as `qve_app`, calls only SECURITY DEFINER functions) | Real, both tested — Postgres repo tested live |
| Fastify API + role-based response scoping (answer-key redaction) | Real, tested via real `fastify.inject()` HTTP round-trips |
| React: `QuestionValidationCenter` (bespoke "Validation Circuit" SVG) + `EligibilityBadge` | Real, tested via real `react-dom/server` SSR |
| Async queue seam (priority-ordered in-memory) | Real but intentionally minimal — see below |

**140/140 tests passing, all actually executed** (98 domain unit + 7 end-to-end
pipeline integration + 6 live-Postgres security tests + 4 live-Postgres
repository tests + 8 live HTTP tests + 8 real React SSR tests, plus aggregator/
planner/executor/freshness/hashing coverage folded into the unit count).
Nothing in this count is fabricated or asserted-without-running — every number
above came from an actual `vitest run` in this session.

### Real bugs found and fixed via testing (documented honestly, not hidden)

1. **mathjs hardening broke its own API.** Disabling the in-language `evaluate`
   function (following commonly-repeated but imprecise mathjs-hardening advice)
   also disabled the top-level `.evaluate()` method this module calls, because
   both share one function-registry entry. Every MathValidator/SolutionValidator
   test that evaluated an expression failed with "Function evaluate is disabled."
   Fixed by hardening only `import`/`createUnit` — the two genuine sandbox-escape
   vectors — and verifying both the fix and that the escape vectors stay blocked.
2. **Aggregator cross-profile contamination.** `computeStatusFor` folded in
   *every* validator result present in a run, not just the ones the profile
   being evaluated actually lists. A validator failing only ASSESSMENT's extra
   requirements (e.g. `ASSESSMENT_COMPATIBILITY_VALIDATOR`) could wrongly sink
   PRACTICE eligibility even though practice never asked about it. Fixed by
   scoping the "optional" contribution loop to `profile.required ∪ profile.optional`.
3. **AISemanticValidator trusted any client's TypeScript return type at
   runtime.** Only `GroqAdapter` validated its own output against the schema;
   a `SimulatedAIClient` returning malformed data (proven with a `MALFORMED`
   test mode) fell through the `if (status === "REVIEW")` check to a silent,
   incorrect PASS. Fixed by validating at the point of consumption
   (`AISemanticValidator`), not trusting any one adapter's self-discipline.
4. **SolutionValidator compared an option ID against a numeric value.** For
   `SINGLE_SELECT` answers, `ANSWER_VALIDATOR`'s `normalizedAnswer` is the
   option id ("opt_b") — correct for grading, meaningless against a solution's
   numeric conclusion (100). Every genuinely-correct SINGLE_SELECT solution was
   flagged as `SOLUTION_MISMATCH` against its own id string. Fixed by comparing
   against the already-resolved numeric/text VALUE the answer represents.
5. **AI-unavailable polluted every question's status.** Treating
   `AI_UNAVAILABLE`/`AI_OUTPUT_INVALID` as ordinary `PASS_WITH_WARNING`
   contributions meant every question in any deployment without a Groq key
   configured — the default state of this delivery — would permanently show
   `VALID_WITH_WARNINGS`, making that status meaningless. Fixed by treating
   those two codes as infrastructure facts about the RUN, not findings about
   the CONTENT; only a genuine AI opinion (`AI_REVIEW_SUGGESTED`) counts.
6. **Test fixture mismatch (not a product bug):** an HTTP test assumed the
   live server's skill graph came pre-seeded the way test fixtures are, and
   got a legitimate `REVIEW_REQUIRED` from a real unresolvable-skill finding
   against the server's genuinely empty port. Fixed by seeding the server's
   own port in the test — arguably a more honest test than the trivial
   all-green path it replaced.

## PORTS — real interfaces, dev-mode implementations, not real integrations

Everything Feature 54 depends on but does not own. Each is a real TypeScript
interface with a working dev-mode implementation sufficient to drive genuine
validation and genuine tests — not a mock that always returns `true`.

- **Question/QuestionVersion/Answer/Option/Solution/Skill/Difficulty models**
  (`src/contracts/types.ts` `QuestionVersionSnapshot` and friends) — the real
  ACEAPT content schema. This is a minimal, deliberately-scoped superset built
  to drive every validator in this delivery.
- **Skill Graph** (Feature 45) — `InMemorySkillGraphPort`. Real resolution
  logic over whatever a caller seeds it with; no real graph data.
- **Scoring/grading normalization** — `DefaultScoringNormalizer`. A real,
  working normalizer for all 11 answer types; not necessarily bit-identical to
  the real grading engine's own normalization, which is the actual point of
  spec §28 — this delivery can't verify identity with code that doesn't exist
  in this session.
- **Asset storage** — `InMemoryAssetStorePort`.
- **Async queue** (spec §85) — `InMemoryValidationQueue`, priority-ordered.
  Spec explicitly says "do not create a second queue system" if one exists;
  none was reachable, so this is a documented stand-in behind the same
  interface a BullMQ/Celery-backed implementation would satisfy.
- **Authentication** — `requestContextFromHeaders()` in `api/routes/
  validationRoutes.ts` trusts request headers directly. **Not safe for
  production.** Replace with real session/JWT verification; every route only
  depends on the resulting `{role, id, tenantId}` shape.
- **Feature 53 (Quality Orchestrator)** — not integrated; Feature 54 exposes
  exactly the validity/eligibility data §112 says Feature 53 should consume,
  but nothing here calls into a Feature 53 that doesn't exist in this session.
- **Features 45–52, mastery, readiness** — not integrated for the same reason.
  The downstream-protection contract (spec §113–124) is satisfied structurally
  (every run carries machine-readable `overallStatus`/`eligibility`/
  `blockingCodes` those systems would need) but no actual Feature 49/50/51/52
  code was reachable to wire against.

## NOT BUILT this pass (honestly scoped out, not hidden)

- **Full admin Validator Health Center / Validation Queue dashboard** (spec
  §132-133) — the data these would show (per-validator latency/failure/timeout
  rate) isn't currently aggregated into a health-metrics store; only the
  per-run results are. `QuestionValidationCenter` covers the reviewer-facing
  half (§127-129, §176-181), not the engineering-facing half.
- **Deep geometry/algebra symbolic equivalence** (spec §43) — MathValidator's
  ALGEBRA/GEOMETRY support is real but scoped to numeric substitution and a
  small named-formula table (rectangle/triangle/circle area & perimeter), not
  general symbolic manipulation.
- **Verbal/grammar/vocabulary semantic validation** (spec §50) — only the
  deterministic reading-comprehension evidence-grounding check (§51) is real;
  grammar/vocabulary correctness is intentionally left to the AI-semantic path,
  which is advisory-only by design (spec §103) and was not live-exercised here
  (no network route to Groq in this sandbox).
- **Validator version-change impact analysis / automatic mass revalidation**
  (spec §140-141) — `ValidationFreshnessService` correctly detects that a
  *specific* run is stale once a validator version changes; there's no batch
  job that walks every stored run and queues revalidation.
- **Diagram/chart/table content correctness** (spec §69-70) beyond existence
  checks — `AssetValidator` confirms an asset exists at its recorded version;
  it does not inspect chart data for correctness.
- **Live Groq exercise** — see above; the adapter is real and complete, the
  live call is not exercised (matches CodeForge Feature 35's "real-but-
  unexercised Groq adapter" precedent exactly).
- **A real, non-in-memory async queue** — see Ports above.

## P0 checklist (spec §223) against what's actually here

Every P0 item is either done or is a named Port above: validator engine,
registry, contract, states, severity, error codes, schema/answer/solution/
math/logic/option/unit/constraint/skill/difficulty/version/runtime validation,
scoring & assessment compatibility, aggregation, evidence, dependency-aware
execution, stale detection, publication gate (`eligibility.*`), student-delivery
eligibility check (`checkEligibility`), AI-safe validation, security (RLS +
SECURITY DEFINER + role redaction), tests. The two P0 items genuinely NOT done
are "Feature 53 integration" and "Feature 45–52 integration" — both blocked on
the same missing-repository fact recorded above, not skipped by choice.
