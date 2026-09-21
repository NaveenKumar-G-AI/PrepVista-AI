# ACEAPT Feature 40 — Career Horizon
### Future Career & Market Evolution Intelligence Engine

Standalone, runnable implementation. **No existing ACEAPT repository was
uploaded or connected for this build** — same situation as Features 8, 20,
and 29: built without asking clarifying questions, config/keys left blank for
you to fill in, engineered to a "next gen" production bar rather than a
scoped demo. Everything below was actually run, not just written — see
"What was verified" for the real numbers.

---

## 1. What this is

The full P0 scope from the spec (§94) plus a substantial slice of P1 (§95),
built as a real Node/TypeScript/Express + PostgreSQL service with a
React/Tailwind frontend, following the same architectural conventions as the
other ACEAPT feature builds in this project (Features 8, 20, 29):

- **Real Postgres with Row-Level Security**, not an in-memory or SQLite
  stand-in. Three distinct DB roles (`aceapt_owner` / `aceapt_app` /
  `aceapt_worker`) so RLS actually binds — see §4.
- **A deterministic core, an AI-adapter shell.** Every classification,
  severity, and confidence level is computed by plain TypeScript from real
  stored data. The Anthropic-adapter layer only ever phrases an
  already-decided result into prose, and **automatically falls back to a
  real templated explanation when `ANTHROPIC_API_KEY` is blank** — the
  product is fully correct and fully functional with zero AI key configured;
  a key only upgrades wording quality.
- **A durable outbox**, not a direct call, handing strategic actions to
  Feature 36 so a crash between "decide the action" and "notify Feature 36"
  can't silently drop it.

## 2. Honest scope: P0 / P1 / P2

**P0 (spec §94) — done, all 17 items**, including all five upstream
integration points (34/37/38/39 as data adapters, 36 as the outbox
consumer).

**P1 (spec §95) — done**: market snapshots + historical "what changed",
skill combinations (schema + query path; not deeply exercised in the seed
data), career concentration risk, skill concentration risk, the technology
decision engine, career scenarios ("What If?"), career experiments, and the
daily/weekly market brief.

**Not built (P1 partial / P2, spec §96)**: market alert *notifications*
(the `market_insights` rows that would drive them exist and are queried, but
there's no push/email delivery layer); the institutional/TPO cohort views
(§98–100); multi-year simulation. These are explicitly out of scope for this
pass, not silently dropped — the data model doesn't block adding them later.

## 3. Setup

```bash
# 1. Install
npm install
cd frontend && npm install && cd ..

# 2. Bootstrap Postgres roles (ONCE, as a superuser) -- see db/bootstrap-roles.sql.
#    Change every password in that file before using this anywhere but local dev.
psql -U postgres -f db/bootstrap-roles.sql

# 3. Copy env and fill in real values (all blank by default -- see §7)
cp .env.example .env

# 4. Run migrations (connects as aceapt_owner, the schema-owning role)
npm run migrate

# 5. Seed realistic demo data (5 roles, 15 skills, 3 quarters of postings, 2 students)
npm run seed
# prints STUDENT_1_ID (has an active target role) and STUDENT_2_ID (discovery mode)

# 6. Ingest market snapshots for each period (normally a scheduled worker job --
#    see tests/integration/ingestAll.ts for the one-off version used to build this)
npx ts-node tests/integration/ingestAll.ts

# 7. Start the API
npm run dev        # http://localhost:4040

# 8. Start the frontend (separate terminal)
cd frontend && npm run dev   # http://localhost:5173
# paste a student id from step 5 into the "stand-in auth" screen
```

## 4. Architecture

```
db/migrations/          7 SQL migrations, run in order (see file headers for
                         why 006 and 007 exist as separate later migrations --
                         both fix real issues found while building, see §6)
db/bootstrap-roles.sql  Privileged, superuser-only role setup -- deliberately
                         NOT a numbered migration (see file header)
db/seed/seed.ts         Deterministic demo data, hand-derived against the
                         actual classification thresholds in src/services

src/lib/confidence.ts   Deterministic confidence/staleness/source-quality engine
src/lib/contentSanitizer.ts   Prompt-injection defense for untrusted market text
src/ai/                 Anthropic adapter + prompt templates, all with real
                         deterministic fallbacks (never just "AI unavailable")
src/integrations/       One adapter file per upstream feature (34/37/38/39) plus
                         the outbox + Feature 36 dispatcher -- the ONLY files
                         that would need to change to wire into the real ACEAPT repo
src/services/           The 10 services doing the actual Feature 40 work
src/routes/              Express routes, thin -- all logic lives in src/services
src/middleware/auth.ts   STAND-IN auth (X-Student-Id header) -- swap for real
                         session/JWT handling; every route already depends only
                         on `req.studentId` being set, so this is a one-file change

frontend/src/           React/Tailwind SPA implementing the Career Horizon
                         dashboard (see §8 for the design system)
```

### Why some tables aren't "real" Feature 33/34/37/38/39 data

No ACEAPT repository existed to extend, so `db/migrations/001_standalone_core_standins.sql`
creates the *smallest* stand-in shape of that data (students, roles, skills,
career_directions, evidence_items, positioning_snapshots, opportunities,
applications) so Feature 40 could be built, seeded, and tested end to end
against something real, rather than mocked. **Every one of those tables is
read through exactly one adapter file** in `src/integrations/`
(`feature34.adapter.ts`, `feature37.adapter.ts`, etc.) — swapping to the real
ACEAPT repo means rewriting those five files to call the real
services/tables instead, using the same return shapes. Nothing in
`src/services/` talks to the stand-in tables directly.

## 5. What was verified (not just written)

This was built and tested against a real, running PostgreSQL 16 instance and
a real running Express server in this environment — every claim below is
reproducible with the commands in §3.

- **28/28 unit tests** (`npm run test:unit`, Vitest) — confidence scoring,
  gap-severity classification (all four tiers plus the LOW-confidence
  ceiling), skill-trend classification (all six outcomes, including a
  regression test for a real bug — see §6), and the prompt-injection
  sanitizer.
- **40/40 checks in a live-HTTP walkthrough** (`npm run test:integration`)
  against the real running server — not the service functions directly, the
  actual HTTP layer: auth rejection (missing/unknown student), future-gap
  computation and outbox dispatch, the full Career Horizon hero-screen
  assembly, **cross-student RLS isolation verified over real requests as two
  different students**, role evolution, skill trends, career branching (all
  four categories produced from real jaccard-similarity computation),
  career comparison, scenario simulation, a full career-experiment
  start→complete lifecycle, daily/weekly market briefs, and the technology
  decision engine.
- **Migration path proven from zero**: ran the full 7-migration sequence
  against a throwaway, completely fresh database (created and destroyed
  during this build) to confirm `npm run migrate` genuinely works for a
  first-time install, then confirmed a second run is a clean no-op.
- **Outbox dispatch confirmed**: verified `dispatchPendingOutboxEvents`
  actually transitions real `PENDING` rows to `DISPATCHED`, not just that
  rows get written.
- **Both `tsc --noEmit` (backend) and `tsc -b` (frontend) pass clean**, and
  both `npm run build` (backend) and `vite build` (frontend) produce real
  output. The production frontend build was served and smoke-tested over
  HTTP.
- **What was NOT verified**: no visual/screenshot check of the frontend.
  This sandbox's only available Chromium is an Ubuntu snap stub with no
  working snap daemon behind it (`chromium-browser --version` fails with
  "requires the chromium snap to be installed") — confirmed by trying it
  directly rather than assumed. The frontend does build cleanly and serve
  correctly over HTTP; its actual rendered appearance is unverified.

## 6. Real bugs found and fixed while building

Documented honestly, including the ones that were design mistakes, not just
typos:

1. **`future_gaps` had no unique constraint** backing the upsert
   `futureGap.service.ts` was written to use — would have failed on the
   very first recomputation for any student. Fixed with migration 007
   rather than a try/catch workaround.
2. **`skills.evidence_type` doesn't exist** — copy-paste column reference
   left over from an earlier draft; the column belongs on `evidence_items`.
   Caught by the live pipeline run, not by typechecking (it was valid SQL
   syntax, just wrong).
3. **Market-signal queries weren't scoped to the current period.** Role
   evolution's "emerging" section and its classifier inputs were reading
   *every* signal ever generated, so a role's very first ingested period
   (where every skill "jumps" from a blank snapshot) permanently dominated
   what should have been "what's moving *right now*". Caught by noticing
   the computed "emerging" list was identical to "then" in real output —
   fixed by threading `period` through five call sites.
4. **`getOpportunityRequirementFrequencies` had no date filter** — it
   aggregated a role's *entire* opportunity history regardless of which
   period was being ingested, which would have silently collapsed three
   seeded quarters into one identical snapshot the first time more than one
   period was ingested for the same role. Caught by tracing the ingestion
   path *before* seeding (not after seeing wrong output) and fixed by adding
   `periodToDateRange()` and threading a real date range through the
   adapter and standin-query layers.
5. **The skill-trend "stable" threshold (0.08) was too tight for realistic
   sampling noise.** A skill seeded to be flat around ~85–90% swung 8.7
   points across three quarters from Bernoulli sampling noise alone at
   n=150/quarter and was misclassified `DECLINING`. Widened to a
   dedicated `STABLE_BAND = 0.10` with the reasoning written into the code
   comment, and added a regression test using the exact real numbers that
   triggered it (`tests/unit/skillTrend.test.ts`).
6. **A wrong-but-plausible RLS auth check.** The first draft of the
   stand-in auth middleware ran a verification query on the raw connection
   pool with no `app.current_student_id` set — which the `students` table's
   own RLS policy would always reject, making the check dead code that
   happened to fall through to a second, correct path. Simplified to the
   one query that actually works, with the reasoning in a comment.
7. **`aceapt_owner` correctly could not grant `BYPASSRLS`** — a genuine
   least-privilege success, not a bug, but it meant migration 005 as first
   written would fail on a real deploy. Split role bootstrapping
   (superuser-only) from ordinary schema migrations (`aceapt_owner`) into
   `db/bootstrap-roles.sql`, run once, separately.

## 7. Environment variables (`.env.example`)

All blank or non-secret defaults, as requested. Notably:
- `ANTHROPIC_API_KEY` — optional. Leave blank and every endpoint still
  returns fully correct, fully classified data with clear templated
  explanations (see §1). Add a key later to upgrade explanation quality;
  nothing about correctness depends on it.
- `WORKER_PGUSER` / `WORKER_PGPASSWORD` — the BYPASSRLS role. Keep these out
  of the HTTP-facing server's environment in any real deployment; only the
  offline market-intelligence batch job should ever use them.
- `FEATURE36_ACTION_ENGINE_URL` — blank in this standalone build (there's no
  real Feature 36 to call). `src/integrations/feature36.adapter.ts` marks
  outbox events `DISPATCHED` locally when this is unset, which is the
  honest behavior for a standalone build — set this URL when wiring into
  the real ACEAPT repo and that branch is never reached.

## 8. Frontend design system

Signature element is a literal **horizon-line instrument** in the hero: each
of the role's top real market signals is plotted as a marker that rises
into the dark "sky" band for growing/emerging signals, sits on the line for
stable ones, and dips toward the light "ground" for declining ones — a
direct visual encoding of `market.signals`, not decoration. Palette and type
are documented inline in `frontend/tailwind.config.js`; full reasoning
(including which AI-design clichés this was deliberately built to avoid)
was worked out before writing any component code.

## 9. Known limitations

- Stand-in auth (`X-Student-Id` header) — see §4, one-file swap.
- No push/email delivery for market alerts (data layer exists; delivery
  doesn't).
- Skill combinations (spec §19) has a working schema and query path but the
  seed data doesn't populate `skill_combinations` rows, so
  `getSkillCombinationsForRole` will return empty against the seeded demo.
- No visual/screenshot verification of the frontend (see §5).
- AI-generated explanation text quality is untested with a real key (none
  was available in this environment) — only the deterministic-fallback path
  was exercised. The fallback path is what runs by default per your
  instruction to leave keys blank.
