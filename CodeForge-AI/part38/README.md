# CodeForge Feature 38 — Technical Mastery Report

A reference implementation, built with no existing CodeForge repository
attached to the session. **Read `docs/ARCHITECTURE.md` first** — it
explains what's real Feature 38 code versus what's a labeled placeholder,
and exactly what a real integration involves (short version: replace
`server/src/adapters/fixture-adapters.ts` with real service calls; nothing
else should need to change). `docs/ENGINEERING_SUMMARY.md` has the full
build/test/limitations report.

## Layout

```
server/   Node + TypeScript + Express + SQLite (node:sqlite) + Zod + PDFKit
web/      React + TypeScript report UI (drop into the host app's build)
docs/     Architecture and engineering summary
preview/  A rendered example (JSON + standalone HTML) — see below
```

## Running it

```bash
cd server
cp .env.example .env        # fill in AUTH_JWT_SECRET at minimum; AI is optional
npm install
npm run db:migrate
npm run db:seed             # seeds 3 demo students, incl. the golden student from brief §76
npm run dev                 # API on :4038
npm run worker              # separate process — generation happens here, not in the API process
```

Then, with a bearer token for one of the seeded demo users (see
`src/testing/test-tokens.ts` — test/script use only):

```bash
curl -X POST localhost:4038/api/reports \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"studentId":"student_golden"}'
```

## Tests

```bash
npm test              # unit (vitest) + integration (plain script — see its header for why)
npm run typecheck      # tsc --noEmit
```

25/25 passing as of this build — see `docs/ENGINEERING_SUMMARY.md` for
exactly what each covers.

## Preview

`preview/technical-mastery-report-preview.html` is a standalone HTML file
— open it directly in a browser. It's not hand-mocked: it's rendered by
`server/scripts/render-preview.ts`, which runs the real pipeline for the
seeded golden student and writes both the HTML and the raw
`golden-student-report.json` it was built from.
