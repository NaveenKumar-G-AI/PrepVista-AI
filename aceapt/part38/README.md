# Feature 38 — Personal Career Positioning Engine (P0 slice)

## What this is, and the one assumption it's built on

No existing ACEAPT repository, schema, or Feature 33–37 code was available
in this conversation — nothing was uploaded besides the spec itself. Rather
than ask before building, this was built as a **standalone module** with
clean interfaces at every point it would plug into the real system, using a
plain, common stack (Node/TypeScript/Express + React/TypeScript/Vite). Drop
the real integrations in behind the interfaces described below and this
becomes a component of ACEAPT rather than a separate app.

Every piece of this has actually been run, not just written: `npm install`,
`npm run typecheck`, and the full test suite pass on both sides, the backend
was started with seeded demo data and hit with a real HTTP request (see
sample response below), and the frontend was built for production and run
against that live backend.

## What's implemented (P0, spec section 91)

Target role → role requirements → student evidence → best relevant evidence
→ positioning → positioning gap → best project → best story, end to end,
plus the primary **"My Professional Position"** dashboard (spec sections 10,
58, 95) and the introduction/story-angle/consistency endpoints from the P1
list (section 92) that were cheap to include alongside it.

**Not built**: career fair mode, recruiter/networking modes, resume
positioning UI, profile consistency UI, positioning health/evolution UI, TPO
and trainer intelligence, positioning experiments, application-outcome
learning. These are P1/P2 in the spec's own priority order (sections 92–93)
— "build foundations" (section 90) means this slice, not a shallow stub of
all fifteen screens. Happy to build any specific one of these next.

## Architecture

```
backend/
  src/types/            Domain types + the ports Features 33-37 fill in
  src/data/              In-memory adapters (empty by default) + demo seed
  src/services/          One engine per concern: relevance, gaps, project
                          ranking, stories, introductions, consistency,
                          differentiators — plus positioningEngine.ts, the
                          orchestrator
  src/ai/narrativePort.ts   Deterministic template by default; optional
                             Anthropic-backed phrasing that can never add facts
                             and always falls back safely
  src/cache/, src/middleware/, src/routes/, src/server.ts
  src/__tests__/         7 tests covering the engines + the full pipeline

frontend/
  src/components/MyProfessionalPosition.tsx   the primary screen
  src/components/{WhyYouFit,BestProjectCard,PositioningGapList,EmptyState}.tsx
  src/api/positioningClient.ts
  src/styles/index.css   the design system (see "Design" below)
```

### Why it's structured this way

- **Every engine is a pure function** that takes real data in and returns a
  structured result — nothing free-text is generated except the one final
  narrative sentence, and even that is optional and always falls back to a
  template built from the same structured facts (spec section 77,
  auditability: you can trace every field on a `PositioningProfile` back to
  something read from `dataSource`).
- **`PositioningDataSource`** (`src/types/integrationPorts.ts`) is the single
  seam for Features 33/34/37 (opportunities, career trajectory, evidence).
  `InMemoryPositioningDataSource` implements it with empty Maps — real
  production data must never be fabricated (spec section 50), so the honest
  default is "no data yet," not sample data.
- **Gaps are six independent detectors** (`src/services/gapEngine.ts`), one
  per spec category (sections 15–20), each returning `[]` when it has
  nothing to say rather than forcing a conclusion (spec section 49).
- **The auth middleware is an explicit, commented stub** — it fails closed
  in production and allows requests in dev only with a loud console warning.
  It is not real auth. Replace it with your session/JWT verification.

## Try it locally

```bash
# Backend
cd backend
cp .env.example .env
npm install
SEED_DEMO_DATA=true npm run dev      # demo data only visible in THIS process
npm test                             # 7 tests
npm run typecheck

# Frontend, in a second terminal
cd frontend
cp .env.example .env                 # point VITE_API_BASE_URL at the backend
npm install
npm run dev                          # opens on http://localhost:5173
```

Real sample response from a running instance (`GET
/api/students/demo-student/positioning?roleId=role-backend`), included here
so you can see the shape without starting anything:

```json
{
  "targetRoleName": "Backend Developer",
  "primaryPosition": "Backend Developer focused on Python, REST API and PostgreSQL.",
  "narrativeSource": "template-fallback",
  "strongestEvidence": [
    { "name": "Python", "evidenceStrength": "validated" },
    { "name": "REST API", "evidenceStrength": "demonstrated" },
    { "name": "PostgreSQL", "evidenceStrength": "demonstrated" }
  ],
  "differentiators": [],
  "positioningStrength": "strong",
  "confidence": "medium"
}
```

`differentiators` is empty on purpose: the demo seed's Machine Learning
capability is only "developing," not validated or demonstrated, so the
engine correctly declines to claim an "AI-integrated" differentiator even
though the spec's own mock (section 95) shows one — that claim only appears
once real evidence backs it (spec section 36).

## Wiring in the real system

| Seam | File | Replace with |
|---|---|---|
| Evidence/projects/roles/opportunities | `backend/src/data/inMemoryRepository.ts` | A class implementing `PositioningDataSource` against Features 33/34/37 and your real DB |
| Persisted positioning history | same file, `InMemoryPositioningResultStore` | Same interface, backed by your database |
| Auth | `backend/src/middleware/auth.ts` | Your real session/JWT check |
| Cache invalidation triggers (spec section 54) | `backend/src/cache/positioningCache.ts` | Call `positioningCache.invalidateStudent(id)` from your evidence/project/role update hooks |
| AI narrative | `backend/src/ai/narrativePort.ts` | Already wired to Claude — just set `ANTHROPIC_API_KEY` in `.env` |
| Feature 36 hand-off (spec section 8) | `backend/src/types/integrationPorts.ts`, `NextActionSink` | Implement and call from wherever gaps are computed |

Secrets are intentionally blank in both `.env.example` files — fill them in
yourself; nothing here guesses at credentials.

## Design

Built against the frontend-design skill's brief-first process rather than
reaching for a template: the subject is an **evidence ledger** — the spec's
own vocabulary (✓ / △ / gap) is the signature device, rendered as a running
audit trail down the page instead of generic progress bars or a stack of
bordered cards (which the spec itself asks to avoid, section 60). Palette is
a cool paper/ink base with a single "verified" teal accent and a muted amber
for developing/gap states — deliberately not the cream+serif+terracotta or
near-black+neon looks that generative UI defaults to. Type: Space Grotesk
(display), Inter (body), IBM Plex Mono (labels and evidence stamps, tying
back to the "ledger" idea). Single column, mobile-first, hairline dividers
instead of cards, per spec section 61.

## Known simplifications, stated plainly

- Requirement/technology matching is exact-name string matching
  (`relevanceEngine.ts`). Fine for a demo; a real system will want fuzzy
  matching or a shared taxonomy from Feature 37.
- The differentiator category dictionary (`differentiatorEngine.ts`) is a
  small hardcoded list (backend/ai/frontend keywords) — a placeholder for a
  real skills taxonomy.
- Communication gaps (spec section 19) always return `[]` — there's no
  interview-evidence source to read from yet (Feature 35).
- The in-memory data store and cache are single-process and non-persistent
  by design — they exist to prove the engine logic, not to be the real
  database.
