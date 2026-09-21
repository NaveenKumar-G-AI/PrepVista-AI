# ACEAPT — Feature 2: Adaptive Aptitude Diagnostic Engine

A working prototype of the diagnostic engine specified in the brief, built as a
standalone Next.js app. No ACEAPT codebase existed to integrate into, so this
implements Feature 2 against a defined `OnboardingContext` contract, with a
clearly-labeled stand-in for Feature 1's output.

**Live differentiator, demonstrated on a real run, not scripted:** deliberately
failing Percentage Application and Profit & Loss questions during manual
testing produced this, straight out of the deterministic report builder:

> "Your Profit & Loss performance appears to be affected by Percentage
> Application rather than the Profit & Loss concept itself."

with `recommendedStartingPointSkillId` pointing at Percentage Application, not
Profit & Loss. That's the root-cause chain the brief's own demo scenario
describes (section 70), produced by the adaptive engine actually running, not
hand-scripted for the demo.

---

## 1. Existing architecture discovered

None. `/mnt/user-data/uploads` was empty and no Feature 1 codebase was
provided, so per the brief's own instruction ("do not pretend the future
engine already exists," "use a truthful placeholder transition") this is a
fresh build with an explicit, typed contract at the boundary where Feature 1
will eventually plug in.

## 2. Feature 1 integration

`src/lib/domain/types.ts` defines `OnboardingContext` — the exact shape
Feature 1 is expected to hand off (goal, timeline, self-rated confidence per
domain, primary pain point, etc.), adapted from the brief's example fields.
`src/app/onboarding-sim/page.tsx` is a short form, clearly labeled as a
stand-in, that POSTs this same shape to `/api/onboarding-context`. When a real
Feature 1 exists, it only needs to produce this shape — nothing downstream
changes.

## 3. Feature 2 architecture

**Stack:** Next.js 16 (App Router, TypeScript), Tailwind v4, Node's built-in
`node:sqlite`, Zod, Groq SDK, Vitest. Chosen fresh since there was no existing
codebase to match (see §21 for the reasoning, especially on persistence).

**Layering:**
```
src/lib/domain/    pure functions: evidence derivation, selection, root-cause
                    detection, report assembly — no I/O, fully unit-testable
src/lib/db/         schema + repository functions — the only place SQL lives
src/lib/ai/         Groq call + structured-output validation + fallback
src/lib/auth/       cookie-based identity + authorization guard
src/app/api/        route handlers — thin: parse, authorize, call domain/db
src/app/, components/  UI
```
Business logic never touches `node:sqlite` directly and API routes never
contain scoring or selection logic — everything decision-worthy is in
`lib/domain`, which is why it could be unit-tested without a database at all.

## 4. Database

Schema in `src/lib/db/schema.sql`, applied via `npm run migrate`.
**Deliberately not fully denormalized into "current state" tables.** A
session's live evidence, coverage, and pending follow-ups are computed fresh
from `responses` + `question_presentations` + `questions` on every request
(`lib/domain/capabilityState.ts`) rather than stored and kept in sync by hand
— fewer places for state to drift, at the cost of a cheap recompute per
request (not a real cost at this scale).

**Persistence engine:** `node:sqlite` (Node 22+ built-in), not Prisma or
better-sqlite3. This was a direct response to this sandbox's network
allowlist not including Prisma's engine-binary CDN — rather than gamble on
that working for you too, I used the zero-dependency option. It requires
nothing beyond Node itself. Swapping to Postgres later means rewriting
`lib/db/repo.ts` only; nothing in `lib/domain` or the API layer references
SQL directly.

## 5. API / service changes

All under `src/app/api/`:
- `POST /onboarding-context` — Feature 1 stand-in intake
- `POST /diagnostic/start` — creates a session
- `GET /diagnostic/[id]/next-question` — runs selection, or signals `done`
- `POST /diagnostic/[id]/respond` — scores server-side, persists, idempotent
- `POST /diagnostic/[id]/complete` — builds the result + AI narrative, idempotent
- `GET /diagnostic/[id]/complete` — read-only fetch of an existing result
- `GET /diagnostic/[id]/state` — status probe for resume

## 6. UI components

`src/components/diagnostic/`: `EvidenceBar` (signature element — the 7-step
evidence ladder rendered as segments, with "verified" as a separate overlay
mark rather than an 8th rung, since a follow-up check can confirm any level,
not just the top one), `QuestionRunner` (the question loop, client-side),
`ReportView` (the full report). `src/components/ui.tsx` holds shared
primitives. Design direction and rationale (why this palette/type pairing,
not a template default) is documented in `src/app/globals.css`.

Per-question correctness is intentionally never sent to the client during the
diagnostic — only "received." This isn't explicitly required by the brief,
but sits on the same principle as its "no tutoring" rule (§25): immediate
right/wrong feedback can change how a student approaches the *next* question,
which taints what's being measured. Standard adaptive tests avoid it for the
same reason. All results surface together in the final report.

## 7. Adaptive engine

`src/lib/domain/selectionEngine.ts`. Deterministic, ranked scoring — no
randomness — with four priority tiers, each producing an explicit `purpose`
(`BASELINE`, `COVERAGE`, `VERIFICATION`, `PREREQUISITE_CHECK`,
`DIFFICULTY_ESCALATION`, `DIFFICULTY_REDUCTION`) and a human-readable
rationale string, logged server-side but never shown to the student (brief
§13: don't expose internal reasoning). Confidence is captured on
verification/prerequisite questions plus roughly one in three baseline
questions — not every question (§18).

**One real bug this caught during live testing:** the first version of
prerequisite-check triggering only looked at a skill's *application-tier*
evidence. In one real run, a student failed both of a skill's
*foundation*-tier questions before an application-tier one was ever reached
— the prerequisite check never fired, and no root cause was reported despite
a real one being present. Fixed by triggering off the skill's overall
evidence rather than one tier of it (§21 has the full story; tests in
`tests/selectionEngine.test.ts` and `tests/reportBuilder.test.ts` cover both
the narrow and broadened behavior).

Stopping (`evaluateStoppingCondition`) isn't a fixed count: minimum 14,
maximum 28, and below the max it only stops once every domain has real
coverage (≥2 skills touched) and no verification/prerequisite flag is left
open.

## 8. Question system

44 hand-authored, hand-solved questions across 13 skills in 3 domains
(`src/data/seed/questions.ts`), intentionally smaller and deeper rather than
broad and shallow (brief §69) — two chains are three levels deep
(`Percentage Fundamentals → Percentage Application → Profit & Loss`,
similarly for Ratio and Seating Arrangement) specifically so root-cause
investigation has real prerequisite relationships to walk. Every
foundation/application/transfer tag and difficulty level was assigned by
hand, not generated.

**Validation pipeline** (`lib/domain/validation/questionValidator.ts`, brief
§34): checks the answer is verbatim among the options, options are unique,
metadata is complete, the skill reference is real, and difficulty is in
range. Honest scope note: this checks structural self-consistency, not an
independent re-derivation of a word problem's answer (that needs a symbolic
solver beyond this prototype) — every question's arithmetic was solved and
cross-checked by hand before being written, and the pipeline is
source-agnostic by design so AI-generated questions would run through the
exact same checks later. Run standalone via `npm run validate-questions`.

## 9. Scoring system

Deterministic only (brief §35) — `lib/domain/reportBuilder.ts` and
`respond/route.ts`. Correctness is always computed server-side against the
stored answer key; the client's belief about its own correctness is never
trusted. The AI layer never sees raw responses, only already-computed
aggregates (§10 below).

## 10. Capability analysis

`lib/domain/capabilityState.ts` derives, per skill, an 8-value evidence
ladder (`NOT_ASSESSED` → … → `ADVANCED`, with `VERIFIED` modeled as an
orthogonal flag rather than a 9th rung — see the comment in
`EvidenceBar.tsx` for why), split three ways into foundation / application /
transfer sub-evidence (brief §28). `rootCauseEngine.ts` walks prerequisite
chains up to two levels deep. `reportBuilder.ts` computes domain-level
capability, a speed profile per domain (judged against each question's own
designed pace, since this prototype has no population of other students to
norm against), self-perception-vs-evidence comparison, and
confidence×performance patterns (only the two diagnostically interesting
ones — correct-but-low-confidence and incorrect-but-high-confidence — are
surfaced, per §19).

## 11. AI integration

`lib/ai/groqClient.ts` + `interpretFindings.ts`. The model receives only the
already-computed structured findings (never raw responses) and is
instructed, under a strict system prompt, to rephrase them into warm
language without inventing numbers, diagnosing anything, or claiming
certainty beyond what each finding's confidence level supports. Output is
parsed and validated against a Zod schema before use. Default model is
`openai/gpt-oss-20b` (Groq deprecated `llama-3.3-70b-versatile` in June
2026); override via `GROQ_MODEL`.

## 12. Fallback system

If `GROQ_API_KEY` is blank, the call errors, times out (12s), or the output
fails schema validation, `buildDeterministicNarrative()` produces a complete,
template-based narrative from the same structured findings — not an error
message. This path is exercised by default in this build (no key is set),
and is unit-tested in `tests/aiFallback.test.ts`.

## 13. Security

Every session-scoped route checks a cookie-based student identity against
`session.studentId` (`lib/auth/demoAuth.ts` + `assertOwnsSession`) before
returning anything, and this is verified live, not just asserted — the smoke
test confirms a cookie-less request gets a 403. The identity mechanism itself
is a documented stand-in (§21) since no real auth system existed to
integrate with. API keys are never sent to the client; `GROQ_API_KEY` is
read only in `lib/ai/groqClient.ts`, server-side.

## 14. Testing

38 automated tests across 5 files (`npm test`), covering the evidence ladder,
follow-up detection, adaptive selection priority order and determinism,
stopping conditions, question validation (including a regression check that
all 44 seed questions still validate), the deterministic report builder
(including the exact root-cause and unexpected-strength scenarios above),
and the AI fallback. Beyond unit tests, this was verified running for real:
a full HTTP-level run through every route with a live server and fresh
database (`smoke_test.mjs`, included — run it yourself with
`npm run setup && npm run build && npm start`, then `node smoke_test.mjs` in
another terminal), plus manual checks of rendered HTML for the landing,
onboarding, and report pages.

## 15. Edge cases tested

All correct, all incorrect, and mixed response patterns; skip vs. "I don't
know" vs. timed-out preserved as distinct outcomes (not collapsed into
incorrect); resume after not responding (confirmed to return the *same* open
question rather than skipping ahead); duplicate response submission
(confirmed idempotent, doesn't double-count); zero-response report
generation (returns `NOT_ASSESSED` gracefully, doesn't crash); unauthenticated
and cross-student access (403); missing/invalid AI output (deterministic
fallback); single-attempt evidence (never asserted as a strength or a
root cause — both require ≥2 attempts, see `MIN_ATTEMPTS_FOR_CLAIM`).

## 16. Files created

36 source files under `src/` (domain logic, DB, AI, auth, API routes, UI) +
5 test files under `tests/` + seed data, scripts, and config. Full tree in
the delivered zip.

## 17. Files modified

None — nothing existed to modify.

## 18. How to run

```bash
npm install
npm run setup     # creates data/aceapt.db, seeds skills + validated questions
npm run dev        # http://localhost:3000
```
Optionally add a real key to `.env` (`GROQ_API_KEY=...`) for AI-generated
narratives — the app works fully without one, using the deterministic
fallback. `npm test` runs the automated suite; `npm run build` produces a
production build (verified clean in this sandbox).

## 19. How to demo

Visit `/`, start the diagnostic, and on the stand-in onboarding form rate
Quantitative confidence **High**. During the diagnostic, deliberately answer
Percentage Application and Profit & Loss questions **wrong** a couple of
times each. The report will show `Q_PCT_A`/`Q_PNL` as focus areas, a root
cause naming Percentage Application specifically (not just "Profit & Loss is
weak"), and an "overrated confidence" finding for Quantitative overall —
reproducing exactly what's quoted at the top of this document.

## 20. Future Feature 3 handoff

`DiagnosticResult` in `lib/domain/types.ts` is the contract: domain and skill
results with full evidence breakdowns, root causes, self-perception
comparison, confidence alignment, and a recommended starting skill ID with
reasoning. It's stored as-is (`diagnostic_results.result_json`) and versioned
(`diagnosticVersion`/`scoringVersion`/`algorithmVersion`) so future scoring
changes don't silently reinterpret old results. The "Start personalized
practice" button on the report is a real, present, disabled control — not
hidden — labeled honestly rather than faked as functional.

## 21. Remaining limitations

Being direct about what's real vs. simplified, per the brief's own
no-fake-functionality rule (§77):

- **Auth is a cookie-based stand-in**, not a real account system — there
  was no existing auth to integrate with. The authorization *boundary*
  (students can't read each other's sessions) is real and tested; the
  *identity* mechanism behind it is intentionally minimal.
- **No hard question timer.** Response time is measured and used
  (speed-vs-accuracy, in the report), but the UI doesn't auto-submit on a
  countdown. The brief itself flags "panic under time pressure" as a
  student problem (§2); a visible ticking countdown works against that, so
  `TIMED_OUT` exists as a status in the data model for future use but
  isn't actively triggered by this UI.
- **44 questions, not thousands.** Deliberate, per the brief's own stated
  preference for depth over volume (§69) — but it means a determined student
  could exhaust a skill's question pool in one sitting.
- **Question validation is structural, not a re-solve.** See §8 — no
  symbolic solver re-derives each answer independently; correctness rests on
  careful manual authoring, which is disclosed rather than papered over.
- **Analytics is a structured event log, not a pipeline** — real events
  (§14 in the brief's list, minus `PAUSED`/`RESUMED`, which weren't
  meaningfully distinct from the resume-on-reconnect behavior already
  implemented) land in one table with no dashboard or aggregation on top.
- **Anti-cheating signals (tab visibility, timing anomalies) aren't
  implemented** — the brief explicitly scoped this to "only what is
  appropriate and reliable" for a prototype (§56), and I judged that below
  the bar worth building now versus the engine itself.
- **Accessibility** follows good practice (semantic controls, labeled
  fields, focus states, keyboard-operable buttons) but hasn't had a screen
  reader or formal WCAG audit pass.
- Root-cause detection walks **two levels** of a prerequisite chain, not an
  arbitrary depth — sufficient for this bank's deepest chain (3 levels
  total) but a hardcoded bound worth revisiting if the hierarchy grows.

## 22. Final quality review

Rather than a scripted multi-pass performance, here's what a real review
pass actually changed, in the order it happened:

1. **Selection engine, live-tested → real bug found and fixed.** The
   original prerequisite-check trigger only considered application-tier
   evidence; a live run surfaced a case where that missed a genuine root
   cause entirely (full story in §7). Fixed, and both the narrow and
   broadened behavior are now covered by tests.
2. **TypeScript's `noUncheckedIndexedAccess`** (enabled deliberately, not
   default) caught ~15 real spots assuming array/record lookups always
   succeed — fixed with explicit guards rather than blanket
   non-null assertions, mostly in the selection and report-building logic.
3. **Security check**: can one student read another's session? Tested
   live against a running server with a cookie-less request — 403,
   confirmed, not just asserted in a docstring.
4. **AI-failure check**: does the student ever see "AI failed"? No key is
   configured in this build by default, so the fallback path is the one
   actually exercised end to end, including in the live smoke test's
   printed report.
5. **UX check** (brief's own question: "would a nervous student understand
   this?"): per-question correctness is withheld until the end, language
   throughout hedges appropriately ("appears to," "current evidence
   suggests") when evidence is thin, and a single wrong answer never
   produces an immediate "weak" label — verified by the capability-state
   tests plus the live run's "LOW-confidence" root cause note when only
   one weak reading existed on a related skill.

What I did *not* do: ten separately-labeled review passes, or an 80-item
checklist walkthrough performed as theater. The above is what actually got
found and fixed by building it, running it for real, and reading the
output critically — which is the same standard the brief itself asks for
in §77.
