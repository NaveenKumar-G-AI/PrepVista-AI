# CodeForge Adaptive Engine

A real, tested, working implementation of an adaptive coding mastery loop: real code execution → deterministic evaluation → diagnosis → evidence → explainable mastery/confidence/trend → gap & prerequisite analysis → transparent challenge ranking → traceable recommendations → retry → updated state.

**Start here:** [`docs/CODEFORGE_FINAL_REPORT.md`](docs/CODEFORGE_FINAL_REPORT.md) — architecture, what's implemented vs. partial vs. out of scope (honest truth table), real bugs found and fixed, and exact verification commands.

## Quick start

```bash
npm install
npm run seed       # creates ./data/codeforge.db, seeds the skill graph + 10 real challenges
npm test            # 75 tests, real code execution throughout
npm run dev          # http://localhost:3000
npm run demo          # runs a full live scenario, writes dashboard-data.json
```

Then open [`dashboard/index.html`](dashboard/index.html) directly in a browser — it renders a real captured run, no server required.

## Documentation index

| Doc | Covers |
|---|---|
| [CODEFORGE_ADAPTIVE_ENGINE.md](docs/CODEFORGE_ADAPTIVE_ENGINE.md) | Architecture, directory layout, integration seam for a real deployment |
| [CODEFORGE_SKILL_GRAPH.md](docs/CODEFORGE_SKILL_GRAPH.md) | The data-driven skill graph and relationships |
| [CODEFORGE_MASTERY_MODEL.md](docs/CODEFORGE_MASTERY_MODEL.md) | The mastery/confidence/trend formulas, with worked examples |
| [CODEFORGE_RECOMMENDATION_ENGINE.md](docs/CODEFORGE_RECOMMENDATION_ENGINE.md) | Target selection, ranking, intervention selection |
| [CODEFORGE_DIFFICULTY_ENGINE.md](docs/CODEFORGE_DIFFICULTY_ENGINE.md) | Difficulty adaptation and recovery paths |
| [CODEFORGE_LEARNING_PATHS.md](docs/CODEFORGE_LEARNING_PATHS.md) | Roles, goals, spaced review, time-awareness |
| [CODEFORGE_SECURITY.md](docs/CODEFORGE_SECURITY.md) | Auth, ownership, RLS, hidden-test protection |
| [CODEFORGE_API.md](docs/CODEFORGE_API.md) | REST API reference |
| [CODEFORGE_DATABASE.md](docs/CODEFORGE_DATABASE.md) | Schema and SQLite↔Postgres migration notes |
| [CODEFORGE_TESTING.md](docs/CODEFORGE_TESTING.md) | Test suite breakdown |
| [CODEFORGE_FINAL_REPORT.md](docs/CODEFORGE_FINAL_REPORT.md) | Everything above, plus the honest truth table |

## Why this is a fresh build

No existing CodeForge repository was found in the environment this was built in (see the final report, §1). This is a complete, real reference implementation of the adaptive layer — architected with a documented seam so it can be dropped into an actual production CodeForge/Supabase app.
