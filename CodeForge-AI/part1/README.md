# CodeForge AI — Role-Based Technical Identity & Career Context

The structured technical career-context domain for CodeForge AI: a role/competency/skill/
technology taxonomy, versioned role requirements, and a student's selectable career target with
full history — built as a standalone module (no existing repository was provided to integrate
into; see `docs/ARCHITECTURE_AND_RESEARCH.md` §1 for why, and for the seams a real integration
replaces).

**Start here:** `docs/FINAL_REPORT.md` — real output from every script and test run, an honest
truth table, and the integration contracts future modules are meant to call.

## What this is

- `db/postgres/schema.sql` — the intended production schema (Postgres/Supabase).
- `db/sqlite/schema.sql` — the same schema, SQLite dialect, actually enforced by the code below.
- `src/` — domain logic, repositories, services, and a small Express API.
- `src/seed/data.ts` — the actual taxonomy content: 2 career domains, 4 role families, 10 active
  roles (+1 deprecated fixture), 17 competencies, 68 skills, 25 technologies.
- `scripts/seed.ts` / `scripts/validate.ts` — load the taxonomy; report a live integrity check.
- `tests/` — 33 tests across pure domain logic, the service layer, and the HTTP API.
- `docs/` — reconnaissance, research (O*NET/SFIA, actually checked), architecture decisions,
  hostile review, and the final report.

The interactive student-facing demo (search → browse → role detail → compare → select → confirm →
change target) ships separately as a self-contained artifact, since this sandbox's API server
isn't reachable from a browser — see `docs/FINAL_REPORT.md` §6.

## Running it

```bash
npm install
npm run seed        # loads the taxonomy into data/codeforge.db
npm run validate     # prints a live integrity report
npm test              # 33 tests
npm run typecheck     # tsc --noEmit, strict
npm run dev            # starts the API on :4000
```

Once the dev server is running:

```bash
curl -H "x-student-id: student-demo-1" http://localhost:4000/codeforge/roles
curl -X PUT -H "x-student-id: student-demo-1" -H "Content-Type: application/json" \
  -d '{"primaryRoleSlug":"ai-ml-engineer"}' \
  http://localhost:4000/codeforge/student/career-context
```

`student-demo-1`, `student-demo-2`, and `student-demo-3` are seeded fixture students (see
`src/seed/data.ts`) — `x-student-id` is a stand-in for real session/JWT auth; see
`src/api/auth.ts` for exactly what a real integration replaces.
