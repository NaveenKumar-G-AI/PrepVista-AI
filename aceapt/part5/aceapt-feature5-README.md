# ACEAPT Feature 5 — Adaptive Practice & Dynamic Challenge Engine

A working implementation of Feature 5 from the master prompt: the system decides
what a student should practice next, at what difficulty, and *why* — not a
question bank with an LLM bolted on.

## What this actually is

No existing ACEAPT repository was provided, so this was built as a **new,
self-contained project** rather than a patch onto something else — a
backend engine (Node/TypeScript/Express/SQLite) plus a React frontend, both
real and runnable, not mockups. Every "intelligence" behavior described
below is backed by actual code you can read and tests you can run, not
hand-waved. API keys and secrets are left blank in `.env.example` for you to
fill in — see [Where your keys go](#where-your-keys-go).

If this needs to be merged into a real, existing ACEAPT codebase, the
`backend/src/adapters/` layer (see [Integration notes](#integration-notes))
is the seam designed for that.

## Quick start

```bash
# Backend
cd backend
npm install
cp .env.example .env        # blank secrets are fine for local dev — see below
npm run seed                 # builds the question pool + a demo student
npm run dev                  # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

Open `http://localhost:5173`, sign in with student ID `demo-student` (the
seed script pre-populates this student with a realistic practice history so
the dashboard and adaptive behavior are visible immediately instead of
starting from zero).

## Where your keys go

Everything in `backend/.env.example` that's blank is intentionally left for
you to fill in — nothing was hidden or hardcoded elsewhere:

| Variable | Required? | What happens if it's blank |
|---|---|---|
| `JWT_SECRET` | No, for local dev | A random secret is generated per process start (logged as a warning). Tokens won't survive a server restart. Set a real 32+ byte value before deploying. |
| `ANTHROPIC_API_KEY` | No | The AI-assisted question generation path (`backend/src/generation/anthropicProvider.ts`) reports itself unavailable and the pipeline falls straight through to the deterministic template generator. **The product works fully end-to-end without this key** — see [§51 AI design principle](#ai-design-principle-in-practice) below. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-5`. |

There is a **separate, obvious dev-only shortcut**: `POST /api/auth/dev-login`
mints a valid JWT for any student ID with no password check. It's blocked
when `NODE_ENV=production` and is meant to be deleted (`backend/src/api/routes/devAuth.ts`)
the moment this is wired to real authentication.

## Reproducing the §49 demo script

The master prompt's own demo script (§49) is: student starts with a known
weak/strong/slow profile → starts a personalized session → answers correctly
twice, comfortably → misses a harder question due to a calculation error →
the system visibly adapts, easing off *slightly* and shifting focus to
calculation rather than crashing back to easy questions.

To see this exactly:

1. Seed and start both servers (above), sign in as `demo-student`.
2. The dashboard should read **"Improve Percentage Application"** with the
   reason **"Basic accuracy is strong (~90%) but percentage application
   performance is inconsistent (~56%)"** — this is computed live from the
   seeded attempt history, not hardcoded text.
3. Click **Start Practice**. Answer the first one or two questions correctly
   (any correct, reasonably quick answer will do — the dial in the header
   shows difficulty stepping up).
4. Once you reach a **Hard** question, deliberately pick the wrong option
   that represents a calculation slip rather than a conceptual error — for
   the successive-percentage-change questions this is usually the option
   described as *"the intermediate value was rounded before applying the
   second change."* You won't see the tag in the UI (that would give away
   the mechanic); just pick the option closest to correct-but-not-quite.
5. Watch for the amber **"Recalibrated"** banner. It should show difficulty
   easing by exactly one tier with a **calculation** focus — not a jump back
   to Easy — and the message should read close to *"Concept understanding
   appears strong, but a calculation slip affected the result."*

This exact mechanic is unit-tested in `backend/test/difficultyEngine.test.ts`
(`"§10 worked example"`) and verified live over HTTP in `backend/test/smoke.mjs`.

## What's fully implemented vs. intentionally scaffolded

Being direct about this rather than papering over it (per §50 — "isolate
prototype limitations cleanly rather than presenting mock behavior as real"):

**Fully real, not mocked:**
- Every engine in `backend/src/engines/` — difficulty adaptation, error
  classification, selection scoring, session planning/adaptation, hints,
  explanations, retries, anti-memorization, mastery evidence — is
  deterministic logic you can read top to bottom, with unit tests.
- The question generation pipeline actually generates, validates, and gates
  content; nothing is pre-scripted to "look adaptive."
- Server-side scoring: the client only ever sends `selectedOptionId`; the
  server looks up the question and decides correctness itself (§42).
- The demo student's history was produced by **replaying scripted attempts
  through the real engines** (`backend/src/seed/demoState.seed.ts`), not by
  hand-setting accuracy numbers — so the dashboard narrative is a genuine
  output of the system, not a hardcoded string.

**Deliberately simplified, and isolated so it's easy to extend:**
- **Content domain**: one topic (Percentages) across 7 skills / 12 question
  templates, matching the §27 example transfer chain exactly. Adding a new
  domain means adding templates in `backend/src/generation/templates*.ts`
  and a skill in `backend/src/seed/skills.seed.ts` — nothing else changes.
- **Persistence**: SQLite via a repository layer (`backend/src/repositories/`)
  because no existing database convention was provided to adapt to. Every
  query lives behind a repository interface; swapping to Postgres/whatever
  the real ACEAPT stack uses means rewriting those files only.
- **Feature 3/4 integration**: `backend/src/adapters/feature34Adapters.ts`
  defines the two interfaces Feature 5 needs from Skill Intelligence and
  Mastery Path, with in-memory stub implementations. Nothing else in the
  codebase talks to Feature 3/4 directly — see [Integration notes](#integration-notes).
- **Auth**: a real JWT layer with role checks, but the login route itself is
  a dev-only stand-in (see table above).
- **Difficulty ladder vs. content depth**: the adaptive engine reasons over
  the full 8-step Foundation→Expert ladder regardless of how much content
  exists at each step for a given skill. With only 2-3 templates per skill,
  some skills' pools top out or bottom out before the ladder does — the
  selection engine gracefully serves the closest available difficulty when
  that happens (this is real, tested behavior, not a bug: see the "content
  ceiling" handling in `backend/test/difficultyEngine.test.ts` and the fix
  notes in `practiceOrchestrator.submitAttempt`). A production content team
  would fill out more templates per skill/difficulty over time.
- **AI-generated content is never auto-trusted.** `qualityGate.ts` holds
  *all* AI-sourced questions at `REVIEW_REQUIRED` even when structurally
  perfect, because a formula-backed template can self-verify its own answer
  and an open-ended AI-authored word problem can't be re-derived the same
  way. A human review step (or a stronger automated verifier) is the
  intended next piece there — it was not faked as "already solved."
- **TPO/institutional view**: only the read-only, de-identified aggregate
  endpoint (`GET /api/admin/aggregate`) exists, on purpose — no dashboard UI
  was built for it since it wasn't on the prototype-priority list (§48), and
  no recruiter/placement functionality was added anywhere, per the hard
  boundary in §5.
- **Frontend verification**: typechecked, production-built, and exercised
  with a server-render smoke test (`frontend/test/render-smoke.tsx`) that
  actually mounts the more complex components and checks their output — but
  this sandbox has no browser available, so it has not been visually
  eyeballed in an actual browser. Run `npm run dev` and look at it before a
  live demo.

### AI design principle in practice

Per §51, deterministic logic owns everything that must be reliable — state,
scores, timing, difficulty stepping, session progression — and AI is used
only where it adds real value: authoring question content. Concretely:
`AnthropicProvider` (`backend/src/generation/anthropicProvider.ts`) can
propose a question, but it never touches correctness, adaptation, or
anything else; if it's not configured or its output doesn't pass the same
`QualityGate` every other question passes through, the pipeline silently
falls back to the template generator rather than surfacing anything
unreviewed.

## Testing

```bash
cd backend
npm run typecheck   # tsc --noEmit
npm test            # 83 unit tests: engines, quality gate, every template's math
npm run seed && npm run dev   # then, in another terminal:
node test/smoke.mjs # live end-to-end HTTP run of the full student journey

cd ../frontend
npm run typecheck
npm run build
npx tsx test/render-smoke.tsx
```

## Integration notes

Feature 5 talks to Feature 3 (Skill Intelligence) and Feature 4 (Mastery
Path) **only** through `SkillIntelligenceAdapter` and `MasteryPathAdapter`
in `backend/src/adapters/feature34Adapters.ts`. To connect this to the real
features once they exist:

1. Implement both interfaces against Feature 3/4's real APIs.
2. Swap the two bindings near the top of `backend/src/services/practiceOrchestrator.ts`:
   ```ts
   const skillIntelligence = new InMemorySkillIntelligenceAdapter(() => SkillRepository.all());
   const masteryPath = new InMemoryMasteryPathAdapter();
   ```
3. Nothing else changes — every engine and route only ever sees the
   interface, never the concrete implementation.

If ACEAPT already has a database, auth system, or design system, the same
seam pattern applies: repositories for persistence, `api/middleware.ts` for
auth, and `frontend/tailwind.config.js` / `src/index.css` for visual tokens
are the three places to point at what already exists instead of what's
seeded here.

## Acceptance criteria (§52) status

Everything on this list is implemented and exercised by the smoke test
and/or unit tests, not just present as a UI stub:

- [x] Personalized practice recommendation — `sessionPlanner.ts` + dashboard
- [x] Session has a clear objective — every session carries `objective` + `objectiveReason`
- [x] Skill-aware, controlled-difficulty questions — `selectionEngine.ts`
- [x] Difficulty adapts — `difficultyEngine.ts`, tested against the §10 example
- [x] Attempts recorded, response time captured — server-authoritative timing
- [x] Errors classified — `errorClassifier.ts`
- [x] Progressive hints, explanations, retry — `hintEngine.ts` / `explanationEngine.ts` / `retryEngine.ts`
- [x] Similar-question generation, controlled repetition — `antiMemorization.ts` + selection novelty scoring
- [x] Session adapts in real time, adaptation is visible — `sessionAdapter.ts` + `AdaptationBanner.tsx`
- [x] Session summary, next-best-action — `buildSummary()` + `SessionSummary.tsx`
- [x] Evidence generated for Feature 3/4 — `mastery.ts` + `masteryRepository.ts` + the adapter push
- [x] No unrelated placement/recruiter functionality anywhere
- [x] No broken generated question can reach a student — `qualityGate.ts` is the only path into the servable pool
- [x] End-to-end flow works — `backend/test/smoke.mjs` runs it live over HTTP

## Project structure

```
backend/
  src/
    domain/         enums.ts, types.ts — the shared vocabulary
    db/              SQLite schema + client
    repositories/    one file per aggregate — the only code that touches SQL
    engines/         the actual intelligence: difficulty, errors, selection,
                     planning, adaptation, hints, explanations, retries,
                     anti-memorization, mastery
    generation/      question templates + quality gate + AI/template providers
    adapters/        Feature 3/4 interfaces + stub implementations
    services/        practiceOrchestrator (ties everything together), analytics, audit
    api/             Express routes, auth/role/validation middleware
    seed/            skills, question pool, and the demo student's history
  test/              vitest unit tests + smoke.mjs (live HTTP run)
frontend/
  src/
    components/      Dashboard, PracticeSession, QuestionCard, Dial,
                     AdaptationBanner, SessionSummary, ConfidenceSelector, Login
    api.ts           typed fetch client
    types.ts         mirrors the backend response shapes actually consumed
  test/              render-smoke.tsx
```
