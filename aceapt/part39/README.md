# Feature 39 — Intelligent Opportunity & Application Strategy Engine

A working implementation of the Feature 39 spec: a real backend API + database and a real
React frontend that take a job posting from "found" to "understood, verified, fit-analyzed,
prioritized, and prepared" — never just another job list.

**Important context on scope.** This was built standalone, in a fresh environment with no
existing ACEAPT repository attached to work against, and no API keys were provided (as
requested — every key field is left blank in `.env.example` for you to fill in). So instead
of "inspecting the existing codebase and reusing Features 33–38," this build creates small,
clearly-labeled **stand-in** services for the pieces those features would normally own
(evidence/capability data, positioning, next-action suggestions, career direction), each
written behind the same interface a real integration would use. Section 7 below explains
exactly what to swap out when you plug this into the real product. Everything else —
the JD parser, matching engine, priority engine, safety checker, application tracker,
follow-up engine, and the full UI — is genuinely functional, not a mock.

---

## 1. Quick start

Requires Node.js **22.5+** (uses the built-in `node:sqlite` module — see §8 for why).

```bash
# Backend
cd backend
npm install
cp .env.example .env      # leave ANTHROPIC_API_KEY blank to run fully deterministic
npm run seed               # creates data/aceapt.db with a demo student + 4 opportunities
npm start                  # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

Open `http://localhost:5173`. You'll land on **Today**, with a seeded student ("Aditi
Sharma," targeting Backend Developer roles) and four pre-analyzed opportunities that
exercise the different recommendation tiers:

| Opportunity | Recommendation | What it demonstrates |
|---|---|---|
| Backend Developer @ Company X | **Apply now** | Strong evidence match; the spec's own worked example (§104), reproduced with real matching logic |
| Software Engineer – Backend @ Meridian Systems | Low priority | A real limitation of rule-based extraction — see §9 |
| Frontend Developer Intern @ Luma Design Co | Low priority | An adjacent, off-direction role |
| Data Entry Executive @ QuickHire Global | **Verify before applying** | The safety checker catching upfront-fee / bank-detail / guaranteed-job signals |

Run `npm test` in `backend/` to run the automated test suite (11 tests, all passing) covering
the matching engine, priority engine, safety checker, and claim-safety checker.

---

## 2. What's actually built (P0, per spec §100)

Every item below is real, working code you can exercise through the UI or the API — not a
placeholder:

1. **Opportunity ingestion** — paste JD text, or a URL (best-effort server-side fetch with a
   graceful "paste it instead" fallback, since most job sites block automated fetching).
2. **Job description parser** — section-aware, splits must-have vs. preferred, extracts
   skills/seniority/work mode/location/compensation/deadline. Deterministic by default;
   optionally AI-enhanced (§6).
3. **Requirement extraction & classification** — CRITICAL / IMPORTANT / SUPPORTING / OPTIONAL,
   each with a plain-language reason.
4. **Student evidence matching** — every requirement mapped to STRONG_MATCH / PARTIAL_MATCH /
   GAP / UNKNOWN. Self-declared evidence is structurally incapable of producing a
   STRONG_MATCH (§8, and see the spec's own "Python certificate" example).
5. **Career alignment** — computed from role/industry overlap against the student's stated
   direction (with a small synonym fold so "Software Engineer" and "Developer" aren't
   treated as unrelated — see §9 for where this still falls short).
6. **Why You Fit** — generated from actual STRONG_MATCH requirements + alignment + project
   relevance, never a canned message.
7. **Gaps** — both hard gaps (no evidence at all) and soft gaps (limited/self-declared
   evidence on an important requirement), which is what lets the flagship "Testing —
   limited evidence" example from the spec actually work correctly.
8. **Opportunity priority** — a transparent weighted score (never shown as a raw number to
   the student) mapped to one of the five recommendation tiers, with a HIGH safety concern
   always overriding to VERIFY_FIRST regardless of fit.
9. **Should I Apply?** — recommendation + why + gaps + effort + risk + next action, as its
   own endpoint and its own moment in the UI.
10. **Application strategy** — positioning statement, emphasize/de-emphasize, best project
    (+ secondary projects), ranked resumes.
11. **Application tracker** — the full 14-state stage machine from the spec, with stage
    history.
12. **Follow-up engine** — never classifies silence as rejection; states are WAITING → FOLLOW
    UP RECOMMENDED → NO RESPONSE → POSSIBLY INACTIVE, on a configurable interval.
13. **Outcome recording** — feeds the funnel and weekly insights.
14. **Safety verification** — heuristic scam-signal detection (fees, bank-detail requests,
    guaranteed-job language, shortened/suspicious links, unclear company identity), always
    framed as "verify," never a definitive accusation.
15–17. **Feature 37 / 38 / 36 integration points** — implemented as swappable stand-ins;
    see §7.

## 3. What's included beyond P0 (P1)

Resume ranking, the full Application Workspace (positioning/resume/project/questions/
recruiter-message/follow-up/submit), claim-safety checking on generated text, duplicate
opportunity detection, opportunity portfolio classification (Target/Stretch/Adjacent/
Exploratory), company-comparison-ready data shape, the weekly intelligence view, and the
recurring high-value-gap engine are all implemented.

**Deliberately not built** (P2, per spec §102, or out of scope for a standalone build):
TPO/cohort mode, trainer intelligence aggregation, positioning A/B experiments, a browser
extension, recruiter-signal ingestion, real email/push delivery (notification *records* exist
in the events table; nothing is actually sent), and multi-tenant production auth. These are
all noted inline in the code where they'd plug in.

---

## 4. Architecture

```
backend/
  src/
    db/
      schema.sql            All tables (see §8)
      index.js               SQLite connection + init
      seed.js                 Demo student, evidence, projects, 4 opportunities
    services/                 Pure, mostly-synchronous business logic (no Express/DB coupling
                               except analysisOrchestrator, which ties it to storage)
      skillsDictionary.js      Canonical skill list + synonym normalization
      jdParser.js               Deterministic JD parsing + optional AI enhancement
      matchingEngine.js          Evidence matching + fit-dimension scoring
      priorityEngine.js           Should-I-Apply recommendation logic
      safetyChecker.js             Scam-signal heuristics
      positioningService.js         Feature 38 stand-in (statement, emphasize, best project, resumes)
      applicationContentService.js   Answer/recruiter-message drafting + claim-safety check
      followUpEngine.js               Responsiveness state + follow-up drafting
      insightsService.js               Funnel, weekly review, recurring gaps, portfolio
      aiClient.js                       Anthropic API wrapper w/ prompt-injection defenses
      analysisOrchestrator.js            Ties parsing → matching → priority into a cached row
    routes/                    Express route handlers (thin — call services, touch the DB)
    middleware/                 auth.js (stub), rateLimit.js (naive in-memory)
  test/services.test.js        Automated tests for the deterministic core

frontend/
  src/
    api/client.js              Fetch wrapper, one function per endpoint
    components/shared/UI.jsx    Badge, SectionCard, FitDimensionBar, etc.
    components/opportunities/   OpportunityCard, AddOpportunityModal
    components/layout/AppShell.jsx
    pages/                       Dashboard, Opportunities, OpportunityDetail, Applications,
                                  ApplicationWorkspace, FollowUps, Insights
```

**Request flow for "add an opportunity":** paste/URL → `POST /api/opportunities` → dedupe
check → `analysisOrchestrator.parseAndIngest` (JD parser → `opportunity_requirements` rows) →
`analysisOrchestrator.runAnalysis` (safety check + matching + fit dimensions + priority +
best-project selection, all synchronous/deterministic unless AI is enabled) → cached into
`opportunity_analysis` → returned to the client. Analysis is cached and only recomputed on
explicit re-analyze or when the student edits the posting (spec §81) — not on every page load.

---

## 5. The "Should I Apply?" moment

This is the interaction the spec calls out as signature (§20), and it's real end to end:
`GET /api/opportunities/:id/should-i-apply` returns the recommendation, the why (3–5 bullets
built from actual STRONG_MATCH requirements and alignment), the gaps (hard + soft, worst
first), the effort estimate, the safety status, and one plain-language next action. Nothing
in that payload is templated filler — every field traces back to a specific matched
requirement, evidence record, or safety signal.

---

## 6. AI integration (optional, off by default)

Every AI-facing service has a fully-functional deterministic path, used automatically when
`ANTHROPIC_API_KEY` is unset, invalid, or the request fails for any reason
(`backend/src/services/aiClient.js`). Nothing breaks if you never set a key — that's the state
this was tested and shipped in.

What AI enhancement upgrades, if you add a key:
- JD parsing picks up nuance the bullet/regex parser misses (see §9's "Python or Java" issue).
- Positioning statements and application answers get more natural phrasing.
- All AI calls wrap untrusted content (job descriptions, in particular) in an explicit
  `<untrusted_content>` block with a system instruction never to follow instructions found
  inside it — see `aiClient.wrapUntrusted` (spec §78, prompt-injection defense).
- AI-drafted application text still passes through the same claim-safety heuristic as the
  deterministic path (defense in depth — the model is told not to invent claims, and the
  output is checked anyway).

To enable: set `ANTHROPIC_API_KEY` in `backend/.env`. Optionally set `ANTHROPIC_MODEL`
(defaults to `claude-sonnet-5` — check [docs.claude.com](https://docs.claude.com) for current
model names before deploying, since this may be out of date by the time you read it).

---

## 7. Wiring in the real Features 33–38

Each stand-in is isolated behind a small, obvious interface so swapping it for the real
service is a localized change, not a rewrite:

| Spec feature | What it owns | Where the stand-in lives | How to swap it |
|---|---|---|---|
| **37** (evidence) | Validated capabilities | `evidence` / `projects` tables, read via plain `SELECT` in routes and `analysisOrchestrator.js` | Replace those reads with calls into Feature 37's real API/service. `matchingEngine.js` only needs `{skill, evidence_type, strength}` objects — it doesn't care where they came from. |
| **38** (positioning) | Presentation strategy | `positioning_profiles` table + `positioningService.js` | `positioningService.buildPositioning()` already accepts a `positioningProfile` parameter shaped for this — point it at Feature 38's real output instead of the local table. |
| **34** (career direction) | Target role/trajectory | `students.target_role` / `career_direction` columns | Same pattern — `matchingEngine.computeFitDimensions` just needs those two strings. |
| **36** (next actions) | What to do next | `insightsService.computeHighValueGaps` → surfaced as `EVIDENCE_GAP` items in Today's Priorities | Currently only surfaces recurring gaps; a real integration would hand those gaps to Feature 36's action engine instead of just displaying them. |
| **35** (outcome history) | Cross-application patterns | `insightsService.computeWeeklyReview` | Already framed as "OBSERVED DATA," never causal, and already gates on sample size — extend with more of Feature 35's history once available. |
| **33** (opportunity discovery) | Sourcing opportunities | `POST /api/opportunities` (manual add + best-effort URL fetch) | This build has no automated discovery — it's intentionally reactive (the student adds an opportunity). Feature 33 would push opportunities in via the same `parseAndIngest`/`runAnalysis` pipeline. |

---

## 8. Data model

`students` · `projects` · `evidence` · `positioning_profiles` · `resumes` · `opportunities` ·
`opportunity_requirements` · `opportunity_analysis` (cached, versioned via `stale`) ·
`opportunity_safety_signals` · `applications` · `application_stage_history` ·
`application_documents` · `followups` · `events`.

Full column definitions are in `backend/src/db/schema.sql`, which is heavily commented.

**On the database driver:** this uses Node's built-in `node:sqlite` module (`DatabaseSync`),
not the popular `better-sqlite3` package — deliberately. `better-sqlite3` is a native addon;
when no prebuilt binary matches your platform/Node version, its install falls back to
compiling from source, which needs a C++ toolchain and a working connection to
`nodejs.org` for headers. That failed in a clean-room test of this exact repo during
development (network-restricted sandbox), which is precisely the kind of "works on my
machine, breaks on yours" risk not worth shipping. `node:sqlite` ships inside Node itself, so
`npm install` never has a native compile step. The trade-off: it's still labeled experimental
by Node (stable enough that this app's full test suite and every manual flow passed against
it) and requires Node 22.5+. The schema and every query are plain SQL, so swapping to
`better-sqlite3` or Postgres later only means editing `backend/src/db/index.js`.

---

## 9. Known limitations (honest, not hidden)

- **"X or Y" requirements aren't understood as alternatives.** A line like *"Python or Java"*
  gets extracted as two independent CRITICAL requirements rather than one either/or
  requirement. This is why the seeded Meridian Systems opportunity scores lower than it
  probably should — the student has strong Python evidence but no Java evidence, and the
  parser doesn't know Python alone satisfies the line. This is a genuine trade-off of
  keyword/bullet-based extraction, and a good candidate for the AI-enhanced path to fix,
  rather than something worth hand-coding disjunction parsing for.
- **Career alignment is token-overlap, not semantic understanding.** A small synonym fold
  (engineer/developer/programmer) covers the most common case, but it will still under- or
  over-score role titles that are equivalent in meaning but don't share words.
- **Company name isn't guessed from pasted JD text**, only role is. This is deliberate —
  misattributing a posting to the wrong company is a trust problem, not just an accuracy one,
  so an unclear company name is instead surfaced as a safety signal to verify, rather than
  silently guessed.
- **Claim-safety checking is a heuristic**, not real entailment checking. It catches specific
  numbers/scale claims that don't appear anywhere in recorded evidence, which covers the
  clearest fabrication case, but it isn't a substitute for the student actually reading what
  gets drafted.
- **URL fetching will fail on most real job sites** (bot protection, JS-rendered content) —
  the "paste the text instead" fallback is the reliable path, by design.

## 10. Security notes before any real deployment

- **Auth is a stub.** `middleware/auth.js` reads an `x-student-id` header and defaults to the
  seeded demo student if absent. This is enough to make every route genuinely
  ownership-checked and multi-student-safe in shape, but it is not authentication — replace
  it with real sessions/JWT before this touches real user data.
- **Rate limiting is a naive in-memory counter**, fine for a single dev instance, not for a
  multi-process deployment (state isn't shared). Swap for `express-rate-limit` + Redis.
- Input validation is present but not exhaustive (no schema library like `zod`/`joi` yet) —
  worth adding as the API surface grows.

## 11. Testing

`backend/test/services.test.js` covers the parts where a silent regression would be worst:
requirement extraction, evidence-matching honesty (self-declared ≠ strong match), the safety
override on priority, scam-signal detection, and claim-safety checking. Run with `npm test`.
Beyond that, every endpoint in this README was exercised manually against the running server
during development (listing/sorting, detail, should-i-apply, application creation, the full
strategy bundle, document drafting, stage transitions, outcome recording, duplicate detection,
follow-up generation, and all four insights endpoints) — route-level integration tests
(supertest or similar) are the natural next addition.

## 12. Roadmap (P2, per spec §102)

Browser extension · automated opportunity discovery · deeper company intelligence · recruiter
signal ingestion (application-viewed, recruiter-response) · positioning A/B experiments with
real sample-size tracking · TPO/cohort aggregate view · a real career-agent loop
(discover → analyze → shortlist → prepare → notify → track → learn) that still preserves
human approval before submission, which this build already guarantees end to end — nothing
here ever submits anything on the student's behalf.
