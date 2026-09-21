# Feature 35 — Technical Interview Integration

An evidence-verification interview orchestration layer for CodeForge AI:
adaptive, evidence-grounded technical interviews that turn a candidate's
existing evidence (projects, code, prior signals — wherever it actually
exists) plus their live answers into structured skill evidence for the
existing Skill Signal Engine to consume. It does not score candidates
itself, does not duplicate any existing CodeForge engine, and never claims
more precision than a qualitative confidence band.

**This is a standalone reference implementation, not a merged PR.** There is
no reachable CodeForge repository in this sandbox — consistent with every
prior CodeForge/PrepVista part built the same way — so "integrate with the
existing X" is implemented as a typed **port** (an interface) plus either a
dev/simulated adapter (for local dev and the test suite) or, for the AI
gateway specifically, a real-but-unexercised provider adapter. See
`TRUTH_TABLE.md` for the exhaustive real/simulated/stub/not-built breakdown
mapped to every numbered section of the build spec.

## Quickstart

```bash
npm install
createdb codeforge_dev   # or point DATABASE_URL at an existing Postgres 16+
psql "$DATABASE_URL" -f db/migrations/001_technical_interview_schema.sql
npm run typecheck
npm test                 # 44 tests: unit, golden scenarios, live-Postgres RLS, real-Postgres e2e, React SSR
npm run dev:api          # Fastify on :8035
```

`tests/rls.test.ts` and `tests/postgresRepository.test.ts` need a real
Postgres reachable at `DATABASE_URL_ADMIN` / `DATABASE_URL_AUTH` /
`DATABASE_URL_SVC` (defaults assume `localhost:5432/codeforge_dev` with the
roles the migration creates). Everything else runs against the in-memory
repository and needs no database at all.

## Architecture — feature boundary, not a monolith

Per §6 of the spec, this owns interview orchestration, question
selection/validation, the adaptive engine, evaluation, evidence extraction,
and the interview-specific UI/API. It explicitly does **not** own mastery,
role readiness, role gap, next-best-action, or general code/project/
debugging/reasoning analysis — those stay behind ports:

```
src/domain/          state machine, blueprint builder, shared types — zero
                      npm dependencies, framework-agnostic on purpose
src/integration/      ports.ts (interfaces to every existing CodeForge
                      system) + devAdapters.ts (dev/simulated stand-ins) +
                      aiGatewayAdapter.groq.ts (real, unexercised)
src/orchestration/    question selection, validation, adaptive follow-up,
                      coverage tracking, evaluation pipeline, evidence
                      extraction, and interviewOrchestrator.ts tying it
                      together — this is Feature 35's actual owned logic
src/repository/       persistence port + in-memory impl (tests) + real
                      Postgres/RLS impl (production)
src/api/               Fastify routes, Zod-validated, tenant-context
                      middleware (DEV-ONLY — see below)
frontend/              React candidate UI + post-interview report,
                      SSR-verified
db/migrations/         schema, RLS policies, SECURITY DEFINER write
                      functions
fixtures/, tests/      golden §70 scenarios + unit + live-Postgres tests
```

Swapping any dev adapter for CodeForge's real implementation should never
require touching `src/orchestration/` — only writing a new class against
the same port and passing it into `InterviewOrchestrator`'s constructor
(wired in `src/api/server.ts`).

## What you need to wire up (in order of how blocking it is)

1. **Auth** (`src/api/middleware.ts`) — currently reads `x-org-id` /
   `x-actor-id` / `x-actor-role` from plain, unverified headers. This is
   deliberately as unfinished as the blank API keys you asked to leave —
   replace `extractTenantContext` with whatever validates a real session in
   the main CodeForge backend.
2. **Role-Based Skill Model** (`RoleSkillModelPort`) — swap
   `InMemoryRoleSkillModel` for a real lookup. Blueprint building already
   refuses to proceed on an unknown role rather than guessing, so a missing
   role will surface immediately and loudly.
3. **Candidate evidence** (`CandidateEvidencePort`) — swap
   `InMemoryCandidateEvidenceSource` for real queries against the
   Submission System / Engineering Simulator / prior skill snapshots. The
   shape it needs to return (`CandidateEvidenceBundle`) is in
   `src/domain/types.ts`.
4. **Skill Signal Engine** (`SkillSignalEnginePort.submitInterviewEvidence`)
   — this is the only thing Feature 35 ever hands to the rest of CodeForge.
   Reconcile the `SkillEvidenceRecord` shape here against that engine's
   actual ingestion contract (it wasn't reachable from this sandbox either
   — see that project's own truth table).
5. **AI gateway** — `GroqAIGatewayAdapter` is real, correct integration code
   (endpoint, headers, strict-JSON prompting, grounding instructions) but
   has never made a live call in this environment (no key supplied, no
   AI-provider network egress from this sandbox). Set `GROQ_API_KEY` and
   it's live; or write an adapter for whichever provider you actually use
   against the same `AIGatewayPort`.
6. **Reasoning Verification / Debugging Coach** — currently return "not
   available" rather than fabricating an opinion. Low blocking risk:
   Feature 35 degrades gracefully without them, it just won't get their
   signal.
7. **Voice** — `NoopVoice` always reports failure, which is exactly what
   exercises the §36 text-fallback path. Wire real STT/TTS when you have
   it; nothing else needs to change.
8. **Background queue** (§63) — evaluation currently runs inline inside
   `submitResponse`. `evaluationPipeline.ts` is a plain async function
   specifically so it's easy to move behind a real queue later without
   touching its logic.

## Security model

Every table is RLS-`FORCE`d, no role has a direct `INSERT`/`UPDATE`/`DELETE`
grant on anything, and every write goes through a `SECURITY DEFINER`
function that re-derives org/candidate identity from session GUCs (never
from a client-supplied parameter) before touching a row. Two roles:
`app_authenticated` (RLS-scoped, used for the request lifecycle) and
`app_service` (`BYPASSRLS`, trusted backend — the Node repository connects
as this and therefore does its **own** explicit `org_id` filtering on every
read, since RLS isn't protecting those queries; see the comment at the top
of `interviewRepository.postgres.ts`). Blueprints and the raw event log are
RLS-gated to `STAFF`/`SYSTEM` only — a candidate gets zero rows if they try
to read one directly, which is §18's question-leakage rule enforced by the
database, not just omitted from a response DTO.

## Testing — what's actually been run, not just written

44 tests, all passing, no skips:

- **Unit** (`tests/orchestration.test.ts`, 24 tests) — state machine
  legality, blueprint validation, coverage-state math, question-validation
  grounding/duplication checks, the full adaptive-follow-up decision table,
  idempotency, partial-answer handling, AI-failure handling.
- **Golden scenarios** (`tests/goldenScenarios.test.ts`, 5 tests) — the
  exact five scenarios named in §70, run end-to-end through the real
  orchestrator: strong project defense, working-code/weak-explanation,
  potential code-answer inconsistency, strong progressive follow-ups, and
  incomplete skill coverage.
- **Live Postgres security** (`tests/rls.test.ts`, 9 tests) — a real
  Postgres 16 instance, stood up in this sandbox specifically to verify RLS
  for real: cross-org isolation, cross-candidate-same-org rejection,
  staff-only blueprint visibility, illegal-transition rejection, DB-level
  idempotency, and a regression test for the exact "BYPASSRLS isn't
  inherited through role membership" bug class.
- **Real-Postgres end-to-end** (`tests/postgresRepository.test.ts`) — the
  full orchestrator against the real `PostgresInterviewRepository`, not the
  in-memory one.
- **React SSR** (`tests/ssr.test.tsx`, 5 tests) — every component actually
  rendered via `react-dom/server`, including both the complete- and
  incomplete-coverage report branches.

## Honest engineering notes — real bugs hit and fixed during this build

In the spirit of not hiding what testing actually found:

1. **Coverage-complete was checked before an in-progress follow-up chain
   got a chance to run.** A single-skill interview that started strong
   would hit "coverage sufficient" after just two questions and stop —
   correctly bounded, but it cut off the §27 depth ladder before it could
   ever demonstrate progressive depth. Fixed by splitting the stop check:
   hard resource caps (`maxQuestions`/`maxDuration`) apply unconditionally,
   but "coverage is already sufficient" is only consulted at the point
   where the orchestrator would otherwise go looking for a brand-new topic
   — never mid-chain. Caught by the "Strong Progressive Follow-Ups" golden
   scenario.
2. **`AIGatewayPort` had no signal for *why* a question was being
   generated.** A same-depth `CLARIFICATION`/`VERIFICATION`/`EVIDENCE_CHECK`
   follow-up produced text identical to the question it was following up
   on (same depth level, same evidence, same deterministic phrasing),
   which `questionValidation.ts` correctly rejected as a duplicate — that
   check was right; the gap was upstream. Fixed by adding `followUpReason`
   to `GenerateQuestionInput` so both the simulated and the real Groq
   adapter can phrase a follow-up as a follow-up.
3. **A skill that failed its retry budget could be re-selected as a "new"
   topic**, generating the same root question again (same skill, same
   fixed evidence) and hitting the same duplicate rejection. Real
   interviews don't restart a topic from scratch after giving up on it;
   fixed by tracking which skills already had a root question this session
   (`alreadyRootedSkills`) and excluding them from re-selection regardless
   of how their chain ended.
4. **`InMemoryCandidateEvidenceSource.seed()` overwrote the whole stored
   bundle per candidate instead of merging**, so seeding evidence for a
   second skill silently erased the first skill's evidence in test
   fixtures. Test-infrastructure bug, not orchestration logic, but a real
   one — caught because the "Strong Project Defense" scenario's first skill
   came back with no evidence-grounding at all.
5. **The Postgres repository's `addEvaluation` looked up a response's
   `org_id` through the plain connection pool without `SET ROLE
   app_service` first.** Since `BYPASSRLS` is a role *attribute* and isn't
   inherited through role membership, that specific query would have
   silently returned zero rows — the exact failure class already hit once
   on the related Skill Signal Engine build. Caught by code review before
   it ever reached a test run; fixed by routing it through the same
   role-setting helper as everything else, plus a live regression test
   (`tests/rls.test.ts`) that asserts this specific failure mode directly.

Not found: any case where an AI failure produced a candidate-visible grade,
any path where a follow-up loop failed to terminate, or any cross-tenant
read/write that RLS + the `SECURITY DEFINER` ownership checks didn't catch.

See `TRUTH_TABLE.md` for the section-by-section real/simulated/stub/not-built
breakdown.
