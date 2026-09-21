# Feature 37 — Career Readiness Proof Engine

Evidence-based readiness for ACEAPT: instead of "you are 82% job ready," this answers
*what can this student actually prove, for the role they're targeting, and what should
they go prove next*.

## Read this first

**No existing ACEAPT repository was attached when this was built.** The original brief
assumes an existing codebase to inspect — frontend framework, backend framework,
database, auth, Features 33–36, an existing design system. None of that was available,
so rather than ask and stall, this was built as a **self-contained, integration-ready
module** on a standard modern stack, with the seams to your real systems made explicit
everywhere (`src/integrations/`). Drop it in, replace the seams marked below, done.

Two other calls worth knowing about before you read further:

- **Data layer is Drizzle ORM + Postgres, not Prisma.** Prisma's query engine needs to
  download a native binary from `binaries.prisma.sh`; that domain wasn't reachable from
  the sandbox this was built in, so it couldn't be verified. Drizzle is pure TypeScript
  (no binary, no codegen step) and every line of the data layer below has actually been
  run against a real local Postgres instance — see "What's actually been verified."
  Prisma remains a perfectly fine choice if your team standardizes on it; the repository
  layer (`src/repositories/`) is the only place that would need to change.
- **Every secret is blank.** See `.env.example` in `backend/` — nothing sensitive is
  checked in anywhere. Fill in `DATABASE_URL` and wire your real auth in per the notes
  below.

## What's actually been verified (not just written)

- `npm install`, full `tsc` typecheck, and `npm run build` — clean, in both `backend/`
  and `frontend/`.
- **24/24 unit tests pass** for the readiness engine (`backend/src/engine`), including
  an end-to-end test that reconstructs the brief's own worked "Backend Developer"
  example (section 6/70) from raw evidence items and checks the output matches exactly.
- Beyond the unit tests: a real local Postgres 16 instance was stood up, the Drizzle
  schema was pushed to it, the seed script was run against it, and
  `ReadinessService.getRoleReadiness()` was called for real — real SQL, zero mocks. The
  result matched the brief's worked example exactly:

  ```
  Python:        STRONG      (expected STRONG)
  SQL:           STRONG      (expected STRONG)
  REST APIs:     DEVELOPING  (expected DEVELOPING)
  Testing:       LIMITED     (expected LIMITED)
  System Design: UNKNOWN     (expected UNKNOWN)
  Role state:    READY_TO_TEST
  Top gap:       Testing
  Next proof:    "Backend testing simulation"
  ```

- A real initial SQL migration was generated from the schema (`backend/drizzle/`) —
  it's checked in, not hand-written.
- Two real dependency vulnerabilities were found and fixed while building this (not
  hypothetically — `npm audit` actually flagged them): a high-severity SQL-injection
  advisory in an old `drizzle-orm` range, and a moderate dev-server advisory via
  `vite`/`esbuild`. Both are pinned to patched versions; `npm audit` is clean on both
  packages now.
- **Known remaining advisory:** `drizzle-kit`'s dev-only CLI transitively pulls an
  `esbuild` version affected by a moderate dev-server advisory. This only affects
  running `drizzle-kit` locally, never the shipped runtime code or the production
  build. Worth upgrading when a fixed `drizzle-kit` release lands; not worth a breaking
  downgrade today.

What hasn't been verified: anything that requires your real ACEAPT auth system or
Features 33–36, because they don't exist in this environment. That's exactly what the
adapters in `src/integrations/` are for.

## Architecture

```
                     ┌─────────────────────────────────────────┐
                     │              routes/ (Express)           │
                     │  auth + tenant checks, thin controllers   │
                     └───────────────────┬───────────────────────┘
                                          │
                     ┌───────────────────▼───────────────────────┐
                     │         services/ (orchestration)          │
                     │  ReadinessService, EvidenceIngestService    │
                     └──────┬──────────────────────┬──────────────┘
                            │                       │
              ┌─────────────▼───────────┐  ┌────────▼─────────────────┐
              │   engine/ (pure, 100%    │  │  integrations/ (seams to  │
              │   deterministic, zero    │  │  Features 33-36 — swap    │
              │   framework dependency)  │  │  the default adapter for  │
              │                          │  │  a real client per seam)  │
              │  evidenceClassification  │  └───────────────────────────┘
              │  freshness               │
              │  capabilityEvidence      │  ┌───────────────────────────┐
              │  readinessEngine         │  │ repositories/ (Drizzle) —  │
              │  claimVsProof            │  │ Feature 37's own data:    │
              │  nextProof               │  │ role/opportunity catalogs,│
              │  preparationSignals      │  │ evidence, snapshots, audit│
              └──────────────────────────┘  └───────────────────────────┘
```

The engine layer is the actual "intelligence" the brief keeps asking for, and it is
**plain TypeScript with zero imports from Express, Drizzle, or anything else** — every
function takes plain data in, returns plain data out. That's what makes the 24 unit
tests possible without a database, and it's what makes "deterministic systems for
calculations, state transitions, permissions" (brief, section 37) actually true rather
than aspirational.

### The evidence model, concretely

Every evidence item is classified onto a ladder — `SELF_REPORTED → ACTIVITY →
KNOWLEDGE → PRACTICE → DEMONSTRATED → VALIDATED → REAL_WORLD` — based on its source
type, then adjusted by outcome (a failed coding test doesn't count as proof) and
validation state. Per capability, evidence is aggregated into a label
(`UNKNOWN/LIMITED/DEVELOPING/STRONG`) with a **separate** confidence level, freshness
state, and conflict flag — see `engine/capabilityEvidence.ts`. Role-level readiness
(`engine/readinessEngine.ts`) turns a role's capability requirements plus that
per-capability picture into one of seven states, gates the top two states
(`READY_TO_TEST`, `STRONG_EVIDENCE`) on **core** capabilities being met, and ranks gaps
by importance and distance. Every one of these rules is a named, commented, unit-tested
function — nothing is a black box, including to whoever maintains this next.

### Data model

New tables, all under `backend/src/db/schema.ts`: `capabilities`, `role_profiles`,
`role_capability_requirements`, `student_role_targets`, `opportunities`,
`opportunity_capability_requirements`, `evidence_items`, `readiness_snapshots`,
`readiness_audit_logs`. `studentId` / `tenantId` are plain text columns on purpose, not
foreign keys — see the comment block at the top of `schema.ts` for exactly what to
change before a real migration (mainly: if ACEAPT already has a skills taxonomy or a
target-role concept, point these tables at it instead of standing up a parallel one).

### API

```
GET  /api/v1/students/:studentId/roles
GET  /api/v1/students/:studentId/readiness/:roleId
GET  /api/v1/students/:studentId/readiness/:roleId/journey
GET  /api/v1/students/:studentId/readiness/:roleId/capabilities/:capabilityId/evidence
GET  /api/v1/students/:studentId/opportunities/:opportunityId/readiness
POST /api/v1/students/:studentId/evidence
```

One deliberate deviation from the brief's per-section endpoint sketch (section 39):
capabilities/gaps/next-proof are all part of one `computeReadiness()` call, so they're
returned together on `GET /readiness/:roleId` instead of as separate round trips that
would each recompute the same thing. That's what section 40 ("do not recompute complete
readiness on every page load") actually asks for. Evidence detail is the one thing kept
as its own lazy endpoint, since it's a secondary drill-down that shouldn't bloat the
main payload as evidence history grows.

## Integrating with real Features 33–36

Nothing in `engine/`, `services/`, or `routes/` talks to another feature directly.
Everything goes through an interface in `src/integrations/types.ts`:

| Interface | Feature | Default in this build | Replace with |
|---|---|---|---|
| `TrajectoryProvider` | 34 (career trajectory) | Reads Feature 37's own `student_role_targets` table | A client that asks Feature 34 which role(s) a student targets |
| `OpportunityProvider` | 33 (opportunity intelligence) | Reads Feature 37's own `opportunities` table | A client that asks Feature 33 for a real opportunity's requirements |
| `OutcomeAnalysisProvider` | 35 (outcome/failure analysis) | Returns `[]` (never fabricates outcome evidence) | A client that turns Feature 35's outcome analysis into `EvidenceItem[]` |
| `NextActionSink` | 36 (next best action) | Logs to console | A publish call into Feature 36's queue/service |
| `ValidationCatalogProvider` | *(not 33-36, but the same idea)* | A tiny static starter catalog by capability name | Your real simulation/assessment catalog, matched by capability id |

All of it is wired in one place: `src/composition.ts`. Swapping a default for a real
adapter is a change to that one file — nothing downstream needs to know.

## Auth

`src/middleware/security.ts` does **not** implement authentication. It expects your
existing ACEAPT auth middleware to run first and populate:

```ts
req.user = { id: string; tenantId: string; roles: string[]; permissions?: string[] }
```

Mount `buildReadinessRouter(...)` (from `src/routes/readinessRoutes.ts`) *behind* that
middleware in your real app, rather than adopting `src/app.ts` wholesale — `app.ts` /
`server.ts` exist only so this can run standalone for local dev and the verification
above. A student's own data is only visible to themselves unless the caller holds
`VIEW_STUDENT_EVIDENCE` (read) or `WRITE_STUDENT_EVIDENCE` (write) — separate
permissions on purpose, least-privilege (brief, section 41).

## Running it locally

```bash
# Backend
cd backend
cp .env.example .env        # fill in DATABASE_URL against your own Postgres
npm install
npm run db:push             # or db:generate + db:migrate for a tracked migration
npm run db:seed             # seeds the exact worked example above
npm run dev                 # http://localhost:4037 — note: real auth isn't wired
                             # up here, so hitting routes directly will 401 until
                             # you add your own auth middleware in front

npm test                    # the 24 engine tests — no database needed for these

# Frontend
cd ../frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to :4037
```

The frontend is a small Vite dev harness (`App.tsx`) around the actual reusable piece,
`src/pages/ReadinessDashboard.tsx` plus everything in `src/components/`. When folding
this into ACEAPT's real frontend, take those, not the harness shell — per the brief's
own instruction to reuse existing navigation rather than bolt on a second one (section
45).

## Design

No existing design system to inspect either, so this leans into what the product
actually is — a system that turns evidence into readiness — rather than a generic
dashboard look. Paper-white background, deep verified-green / muted amber / a sparing
brick-red for actual gaps and conflicts, IBM Plex Mono for anything that's a readout
(dates, evidence metadata, the big state word) paired with IBM Plex Sans for body copy.
The one deliberate signature element is the **evidence ladder** on every capability row
(`frontend/src/components/EvidenceLadder.tsx`) — discrete ticks for the seven real
evidence classes, not a smooth percentage bar, because the thing it's showing (which
named rung of evidence a student has reached) is genuinely discrete. That's also the
mechanism behind "don't overuse numbers" (brief, section 4): states and ladders are the
primary UI; a numeric score exists only internally, feeding the state machine.

## What's built vs. not (the brief's own phasing, section 57–59)

**Built and fully functional (P0):** target role → role requirements → capability map →
evidence → readiness state → top gap → next proof, end to end, real data, no mocks.

**Also built, because it's core to the product's actual argument and cheap once the
engine exists:** evidence consistency/conflict detection, claim-vs-proof (both
directions), evidence freshness, opportunity readiness (reuses the same engine against
a different requirement set), the readiness journey/audit trail, over/under-preparation
signals, and an optional AI explanation layer that's deterministic by default and can
never become the source of truth (`services/explanationProvider.ts`).

**Deliberately not built (P1/P2, per the brief's own "don't overbuild P2 during MVP"):**
resume claim extraction (needs a real resume parser to feed it), the TPO/trainer cohort
intelligence views (section 42–43 — the per-student engine underneath is ready; the
aggregation queries and screens aren't built), the career capability passport and
readiness report as dedicated screens (the data for both already exists in the
`ReadinessDTO` and snapshot history; these are presentation work once you have a real
design system to place them in), and a formal focus-trap in the evidence detail modal
(it closes on Escape and focuses on open, but doesn't cycle Tab — worth fixing with
your real modal component rather than this standalone one, per the "reuse existing
design system" principle).
