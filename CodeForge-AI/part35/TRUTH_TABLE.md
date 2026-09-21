# Feature 35 — Truth Table

Legend: ✅ real & tested (incl. live Postgres where relevant) · 🔧 real code, not live-exercised in this sandbox · 🔌 port defined, dev/simulated adapter only · ❌ not built (reason given)

| § | Capability | Status | Notes |
|---|---|---|---|
| 7 | Nine interview modes, one configurable engine | ✅ | Not nine engines — `mode` drives question-type defaults in `questionSelection.ts` |
| 8–9 | Interview blueprint, role integration | ✅ | Refuses to build with zero/mismatched role skills rather than inventing them |
| 10–11 | Candidate evidence, missing stays missing | ✅ orchestration / 🔌 real sources | `InMemoryCandidateEvidenceSource` is a dev stand-in — no real Submission System / Engineering Simulator evidence reachable here |
| 12 | Qualitative confidence, never a fake number | ✅ | `ConfidenceBand` is `LOW\|MODERATE\|HIGH` everywhere, including in the DB schema |
| 13–14 | Evidence-weighted, coverage-aware, personalized question selection | ✅ | `questionSelection.ts`, unit-tested |
| 15 | Nine question types | ✅ | Modeled and mode-driven |
| 16–18 | AI question generation, validation, leakage protection | ✅ orchestration / 🔧 real model / 🔌 simulated for tests | `GroqAIGatewayAdapter` is real, correct integration code, never live-called here (no AI-provider network egress, no key). `SimulatedAIGateway` drives all 44 tests via the identical `AIGatewayPort` contract. Leakage protection is DB-enforced (blueprints are RLS-gated to STAFF only — live-tested) |
| 19–20 | Project / code defense grounded in real evidence | ✅ | `evidenceRef` required for `PROJECT_BASED`/`CODE_BASED`, enforced by `questionValidation.ts` |
| 21 | Code-answer consistency, never auto-dishonesty | ✅ | `POTENTIAL_INCONSISTENCY` → `EVIDENCE_CHECK`, tested (golden scenario) |
| 22 | Implementation ≠ understanding | ✅ orchestration | Tested (golden scenario B). The *implementation-strength* evidence itself is assumed pre-existing (Submission System) — Feature 35 only ever asserts what the *interview* found |
| 23 | Reasoning Verification reuse | 🔌 | `ReasoningVerificationPort` defined; dev adapter returns "not available" (`null`), never fabricated |
| 24 | Debugging Coach reuse | 🔌 | Same pattern as §23 |
| 25 | Architecture interview | ✅ | `ARCHITECTURE_INTERVIEW` mode tested end-to-end (golden scenario D) |
| 26–27 | Adaptive follow-up, progressive depth ladder | ✅ | `adaptiveFollowUp.ts`, unit- and golden-scenario-tested, including the "ladder has an end" case |
| 28–29 | Adaptive stopping, honest coverage reporting | ✅ | Includes the maxQuestions-mid-follow-up-chain edge case (see engineering notes in README) |
| 30–32 | Structured evaluation, partial answers, "I don't know" | ✅ | Never binary; `DONT_KNOW` is its own recorded state, tested |
| 33 | Communication clarity as its own dimension | ✅ | Modeled as an `EvaluationDimension`; quality of the judgment itself depends on whichever `AIGatewayPort` implementation is wired in |
| 34–36 | Voice input, text mode, safe fallback | ✅ orchestration / ❌ real speech engine | `submitVoiceResponse` + fallback path is real and tested-by-construction (`NoopVoice` always "fails," exercising the fallback). No real ASR/TTS — that's explicitly "existing infrastructure" per §34, not Feature 35's to build |
| 37–38 | State machine, session recovery | ✅ | Legal/illegal transitions tested at both the TS and Postgres layers. Recovery works because session state is *derived* from persisted question/response/evaluation history, not an in-memory blob |
| 39 | Idempotency | ✅ | Tested at three independent layers: orchestrator, TS repository, and a raw Postgres unique-constraint test |
| 40–41 | Interview history, versioning | ✅ | Every attempt is its own row; `blueprint.version` / `evaluation_version` both real. No real "Role Model Version" to track (no real role model) |
| 42–45 | Evaluation pipeline, AI must not set authoritative state, grounding, failure handling | ✅ | Orchestrator only ever calls `skillSignalEngine.submitInterviewEvidence` — no code path touches mastery/readiness/gap. An AI failure produces zero evaluation rows and a session in `EVALUATION_FAILED`, never a fabricated grade (tested) |
| 46–47 | Skill evidence, existing-intelligence integration | ✅ emission / 🔌 receiving end | Evidence is correctly shaped and submitted; `RecordingSkillSignalEngine` proves the contract. No real Skill Signal Engine is reachable to receive it (see README) |
| 48 | Gap verification interviews | ✅ | `restrictToSkills` narrows a blueprint to just the uncertain skills, tested |
| 49–50 | Project→Interview, Interview→Next-Action | 🔌 | Structurally supported (any port can feed `getExistingEvidence`; any consumer can read `SkillSignalEnginePort` output) — not verifiable end-to-end without the real downstream engines |
| 51 | Anti-gaming | ✅ design property | Follow-ups, evidence grounding, and duplicate rejection all work against this; not independently red-teamed |
| 52 | Interviewer tone | ✅ | Baked into both the simulated phrasing logic and the real Groq system prompt |
| 53–54 | Candidate UI, post-interview report | ✅ | Real React, SSR-verified (5 render-branch tests), no hidden fields ever passed to the client |
| 55 | Institutional UI | ❌ | Not built — scope cut, documented in README |
| 56–57 | Security, tenant isolation | ✅ | Live-tested against real Postgres 16: cross-org read isolation, cross-candidate-same-org write rejection, staff-only blueprint visibility |
| 58 | Authorization reuse | ❌ dev stand-in only | `extractTenantContext` reads plain headers with zero verification — as unfinished as the blank API keys, on purpose (§58 says reuse CodeForge's real auth; none is reachable here) |
| 59–60 | Database schema, integrity | ✅ | Migration applies cleanly to Postgres 16; FKs, indexes, uniqueness, RLS all live-verified |
| 61–62 | API, frontend trust model | ✅ | Fastify + Zod; the request schemas simply have no score/mastery/confidence field for a client to set |
| 63 | Background processing | ❌ | Evaluation runs inline in this reference build; the seam (`evaluationPipeline.ts` is a plain async function) is where a real queue would wrap it |
| 64–65 | Observability, auditability | ✅ emission / 🔌 real backend | Every key transition calls `auditLog.record(...)`; `ConsoleAuditLog` is the dev sink |
| 66 | Security testing | ✅ | Covered live: cross-org, cross-candidate, question/blueprint leakage, a regression test for the exact "service role reads return zero rows" bug class |
| 67–70 | Unit / adaptive / integration / golden-scenario tests | ✅ | 44/44 passing — see README for the full breakdown |
| 71 | Performance testing | ❌ | Would need a real deployed instance under concurrent load |
| 72 | Failure testing | ✅ partial | AI failure and duplicate-request paths tested; worker-restart/queue-failure not applicable (no real queue built, §63) |
| 73 | Regression testing | ❌ N/A | No existing CodeForge test suite is reachable from this sandbox to run |
| 74–75 | Execution order, code quality | ✅ | Followed in practice — see README's "how this was actually built" section |
| 76 | No fake production data | ✅ | Every fixture candidate/role is explicitly named `FIXTURE_*` / seeded in test files only |
| 77 | No duplicate intelligence engines | ✅ | Verified by construction — Reasoning/Debugging/Skill-Signal/Mastery/etc. are all ports, none reimplemented |
| 78 | End-to-end acceptance flow | ✅ | Exercised twice: once against the in-memory repo (golden scenarios) and once against real Postgres (`tests/postgresRepository.test.ts`) |
