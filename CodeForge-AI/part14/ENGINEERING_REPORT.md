# Final Engineering Report — AI Code Coach

## Architecture discovered

None. `/mnt/user-data/uploads` was empty and no CodeForge repository exists
anywhere in the build environment — confirmed by directory listing before
any code was written, not assumed. Every item in the spec's "FIRST ACTION —
DEEPLY INSPECT THE EXISTING CODEBASE" section (frontend framework, DB,
Supabase config, execution sandbox, existing AI integrations, etc.) is
therefore **NOT VERIFIED**, not "verified and reused." This report does not
claim otherwise anywhere below.

## Architecture implemented

A framework-free TypeScript engine (`src/`) plus two illustrative,
framework-specific integration points (`examples/`). See "Files created"
below. Stack assumed: Next.js + Supabase/Postgres + TypeScript + Groq/Gemini,
because those are the specific technologies the spec itself names.

## Files created

```
ai-code-coach/
  package.json, tsconfig.json, .env.example, .gitignore
  README.md, ENGINEERING_REPORT.md
  db/migrations/0001_create_coach_tables.sql
  src/types.ts, src/schema.ts
  src/prompt/{systemPrompt.ts, buildPrompt.ts}
  src/providers/{provider.interface.ts, groqProvider.ts, geminiProvider.ts, mockProvider.ts, providerRouter.ts}
  src/context/contextBuilder.ts
  src/security/{groundingGuard.ts, promptInjectionGuard.ts, policyEnforcement.ts}
  src/engine/{coachEngine.ts, antiRepetition.ts, attemptComparison.ts}
  src/telemetry/telemetry.ts
  src/rateLimit/rateLimiter.ts
  src/db/repository.ts
  src/__tests__/*.test.ts (7 files, 23 tests)
  examples/{nextjs-api-routes.example.ts, CoachPanel.example.tsx}
```

## Files modified

None — there was nothing to modify.

## Database changes

`db/migrations/0001_create_coach_tables.sql`: `coach_sessions`,
`coach_messages`, `coach_observations`, `coach_state`. Foreign keys, check
constraints, indexes, timestamps, and RLS included. **Not applied** — no
live Postgres instance exists here, and `problem_id` intentionally has no
FK yet (your real `problems` table name is unknown). TEST-ONLY / BLOCKED.

## API changes

`examples/nextjs-api-routes.example.ts` shows the required request
lifecycle (auth → rate limit → duplicate check → ownership check → context
assembly → engine → sanitized response, persisted). Reference-only: auth
and DB calls are stubbed with `TODO`/`BLOCKED` markers, not wired to
anything real.

## AI provider changes

`GroqProvider` and `GeminiProvider` (`src/providers/`) are real HTTP
clients against each provider's actual API shape, both reading credentials
from `process.env` and both left unset. Neither has been exercised against
a live API in this build — no keys, and both providers' domains are outside
the build sandbox's network allowlist. `ProviderRouter` does policy-based
routing (fast tier for simple explanation, large-context tier when needed).

## Prompt architecture

Layered exactly as the spec's "PROMPT ARCHITECTURE" section: fixed system
policy (`systemPrompt.ts`) + coaching-policy addendum + structured,
JSON-serialized problem/code/evidence/state/request blocks, with untrusted
content (code, student question) wrapped behind a random per-request
delimiter tag (`buildPrompt.ts`) so it can't forge its way out of the
untrusted block. No uncontrolled string concatenation of raw DB values.

## Context architecture

`context/contextBuilder.ts` is the one place raw domain data becomes
model-facing context. `hiddenTests` and `referenceSolution` are declared on
the raw input type (because the real caller will have them) but are never
read into the output — proven by a test that serializes the assembled
context and asserts hidden strings are absent. Hidden-test failure surfaces
only as a boolean (`hiddenEvaluationFailed`), never counts or details.
Oversized source is truncated rather than sent whole.

## Coaching-state architecture

`CoachingStateSnapshot` (depth, previous hints/observations, identified
concept, unresolved/resolved issues) is engine-internal state, persisted via
`CoachRepository` against `coach_state`. Anti-repetition
(`engine/antiRepetition.ts`) checks new hints against `previousHints` by
lexical similarity before they're returned. Depth ladder logic
(`nextCoachingDepth`) resets to 1 on a resolved issue, advances (capped at 5)
otherwise.

## Security controls

- **Grounding guard** (`groundingGuard.ts`): rejects/rewrites specific
  execution claims made without `hasExecuted` evidence, HIGH confidence
  without hard evidence, fabricated line numbers, and solution reveal
  outside practice mode. Applied to every response, not just logged.
- **Prompt injection**: structural (delimiter tags + explicit system-policy
  instruction that untrusted content is never authoritative) plus a
  telemetry-only detection signal (`promptInjectionGuard.ts`) — the report
  is honest that regex detection is a signal, not the actual defense.
- **Policy enforcement** (`policyEnforcement.ts`): response-type allowlist
  per `practice`/`assessment`/`interview` mode, enforced independently in
  the engine *and* the grounding guard (defense in depth).
- **Structured output validation**: `CoachResponseSchema.strict()` rejects
  malformed or extended model output outright; the engine retries once,
  then returns a safe, non-crashing fallback.
- **Rate limiting & dedup** (`rateLimiter.ts`): per-user sliding window +
  request-hash dedup within a short window.
- **Telemetry redaction** (`telemetry.ts`): a secret-pattern scrub runs on
  every emitted event before it's serialized.

## RLS policies

Written in `0001_create_coach_tables.sql`: session ownership via
`auth.uid() = student_id`; messages/observations/state reachable only
through a session the caller owns. Instructor/admin read access is written
but **commented out** rather than guessed, since CodeForge's real role
model is unknown — enabling it with an invented schema would be exactly the
kind of unverified claim the spec warns against. **Not tested against a
live database** (none exists here) — BLOCKED, not IMPLEMENTED.

## Frontend changes

`examples/CoachPanel.example.tsx`: header with status dot + 5-segment depth
indicator, observation text, code-location chips wired to an `onNavigate`
callback, a serif-italic "Consider" callout for the Socratic question
(the one deliberate design accent), action buttons, loading/unavailable/
empty states. Not integrated into a real editor or workspace — none
exists here. Colors/fonts are a stated default, not a match to CodeForge's
actual design system.

## Tests created

23 tests across 7 files — **all passing** (`npx vitest run`, confirmed in
this build) against a clean `tsc --noEmit`. Mapped to the spec's TEST
SCENARIOS section:

| Scenario from spec | Test file |
|---|---|
| No execution yet / missing evidence | `groundingGuard`, `e2eLearningFlow` |
| Hidden-test extraction attempt | `contextBuilder` |
| Prompt injection attempt | `promptInjection`, `e2eLearningFlow` |
| Malformed AI response | `e2eLearningFlow` |
| Improved / regression submission | `attemptComparison` |
| Repeated hint request | `antiRepetition` |
| Student asks for complete answer (assessment mode) | `groundingGuard`, `policyEnforcement` |
| Full learning flow, 8/12 → 10/12 → 12/12 | `e2eLearningFlow` |

## Security tests

Prompt injection containment and hidden-data-leak-at-assembly are real,
passing tests. **IDOR / RLS bypass, unauthorized session access**: the RLS
policies and repository ownership checks are written to make this testable,
but actually testing it needs a live Postgres instance with the migration
applied — NOT IMPLEMENTED here, BLOCKED on a real database.

## Failure tests

Provider timeout/malformed-output handling (`e2eLearningFlow`'s "falls back
safely" test) is real and passing — the engine returns a safe fallback
without throwing after two bad attempts. Provider outage against a *live*
Groq/Gemini endpoint: NOT IMPLEMENTED (no network path to those domains
from this sandbox, no keys either).

## End-to-end tests

**IMPLEMENTED AND PASSING.** The exact scenario from the spec —
8/12 → hint → 10/12 → recognized improvement → address remaining issue →
12/12 → reflection — runs against a scripted mock provider and asserts
every test count came from the submission history, never the model.

## Environment variables

```
GROQ_API_KEY=      # server-side only
GEMINI_API_KEY=    # server-side only
```

## Run commands

```bash
npm install
npm run typecheck
npm test
```

## Deployment considerations

- Swap `InMemoryRateLimitStore` for a shared store (Redis) before running
  more than one instance — the in-memory one won't coordinate across
  processes.
- Swap `ConsoleTelemetrySink` for your real observability pipeline.
- Streaming isn't implemented — both providers support it, but adding it
  means changing `LLMProvider.generate` to an async-iterable variant, which
  wasn't worth guessing at without knowing your actual transport.
- `npm audit` flags esbuild/vite advisories pulled in transitively by
  `vitest` (dev-server-only, affects nothing in production or in a one-shot
  `vitest run`) — noted rather than silently fixed with a breaking upgrade.

## Known limitations

- Nothing here has touched a real CodeForge codebase, because none exists
  in this environment. Every "BLOCKED" item above needs your actual repo.
- Multi-language support is implemented at the prompt/context level
  (language is passed through, the system prompt is told to reason in that
  language) — no per-language static analysis was added, since the spec
  explicitly scopes that to other systems this capability doesn't own.
- Streaming, live provider calls, and RLS bypass testing are the three
  concrete NOT IMPLEMENTED items above.

## Status legend applied throughout this report

**IMPLEMENTED** (built + tested here): grounding guard, no-hallucination
guard, structured output validation, prompt-injection structural defense,
solution-leakage/policy enforcement, anti-repetition, deterministic attempt
comparison, hidden-data stripping at context assembly, provider abstraction
+ routing (code, not live-tested), rate limiting (in-memory reference),
telemetry + redaction (console reference), end-to-end learning scenario.

**PARTIALLY IMPLEMENTED** (real code, not wired to anything live): API
routes, DB repository, frontend panel, code-location navigation contract.

**BLOCKED** (needs a real repo/DB/keys to finish): RLS verified against a
live database, IDOR tests against a live database, live provider calls,
instructor/admin RBAC policy, matching CodeForge's actual design system.

**NOT IMPLEMENTED**: streaming.

**TEST-ONLY**: `ScriptedMockProvider`, `InMemoryTelemetrySink`.
