# Consolidation decisions

All 41 original folders were inventoried before integration. `source-inventory.json` records every original file, `source-snapshot.json` records 2,060 SHA-256 hashes, and `copy-manifest.json` identifies copied code/content. Copies were adapted only inside `codeforge-unified`.

The final application uses the existing React/Next.js framework from part11. Its obsolete Next.js 14 / React 18 dependency graph was replaced with a supported Next.js 16 / React 19 graph for the consolidated build. Database-specific identity, institution, and authenticated routing were not copied. The existing textarea-based editing interaction was retained and hardened with per-problem drafts, reset confirmation, copy feedback, explicit execution support and mobile stacking.

## Sources and disposition

| Source | Existing capability | Final decision / destination |
| --- | --- | --- |
| part1 | Role taxonomy, skills, prerequisites, institutional identity | Copied role/skill catalog into concept library and optional role path. Removed fake students/institutions and all identity gates. |
| part2 | Diagnostic tasks, adaptive questions, code and reasoning checks | Copied authored tasks. Nine non-function diagnostics appear in Reasoning checks; duplicate word counting and Two Sum route through practice. Choice answers use actual answer keys; open responses remain ungraded with mentor feedback. |
| part3, part311 | Overlapping personalized challenge implementations | Kept part311's richer five challenge definitions, examples, hints, public/extended tests and comparison logic. One challenge library and editor. |
| part4 | Evaluation, diagnosis and evidence pipeline | Replaced server execution with isolated browser VM results; actual outcomes feed persistent attempts. No process-based Python execution carried over. |
| part5 | Adaptive practice, authored algorithms, mastery estimators | Copied ten authored challenge definitions and prerequisite data; integrated nine unique algorithms and merged duplicate word counting into the canonical exercise. Copied weighted mastery estimator for explicitly labelled practice estimates. |
| part6 | Role roadmap and prerequisites | Consolidated into optional role/skill path using canonical part1 prerequisite catalog and part5 exercise progression. SQLite/demo-student persistence excluded. No fictional readiness or deadline plan. |
| part7 | Assessment/session/evidence services; README points at absent unified paths | Copied five additional assessment exercises (duplicate detection, DNA families, Fibonacci, inclusive-range debugging, and shortest-path BFS) with original tests and Python references; retained original Two Sum language starters and references. Consolidated student session behavior into saved drafts, immutable attempt snapshots, previous/next navigation and real results. Institutional assessment/batch/readiness services are not deployed. |
| part8 | Interview stages, clarifications, reasoning, follow-ups | Adapted restatement → approach → edge-case reasoning → complexity journey. Central Gemini mentor supplies contextual feedback. Removed fallback grading that asserted correctness without evaluation. |
| part9 | Duplicate mastery evidence pipeline | Resolved into part5's pure estimator and the single local attempt store. No parallel database or score system. |
| part10 | Notification service engineering project | Copied complete project requirements, edge cases, rubric and criteria. Local architecture notes, code artifact, checklist and project mentor. Existing mock execution seam is not presented as working service tests. |
| part11 | Incident/SRE simulation and Next.js UI | Copied deterministic action/state/scoring-related engines and the full authored incident content. Integrated logs, traces, historical metrics, deployments, services, intervention actions, verification, notes and debrief into one lab. Replaced Supabase auth/database with local simulation records. |
| part12, part111 | Submission queues and hidden execution | Unified immutable local attempt snapshots and actual result states. Excluded process/shell executors, queue infrastructure and hidden-test security claims. Browser tests are honestly described as visible practice checks. |
| part13 | Execution interpretation | Unified explicit wrong answer, syntax/runtime error, timeout and pass states plus per-check expected/returned values. |
| part14, part15 | Code coach and progressive hints | One hint-first mentor and the authored hint ladder. Per-problem assistance tracking. |
| part16 | Correctness analysis | Actual check output remains the deterministic correctness evidence; mentor review is advisory. No fabricated correctness from an AI fallback. |
| part17 | Python complexity analysis | No Python process analyzer deployed. Authored algorithm complexity and mentor reasoning remain available; the UI never claims measured Big-O or runtime performance. |
| part18 | Deterministic code quality AST rules | Copied JS parser, normalized AST, structural analysis, duplication, naming, error handling and quality rule engine. Exposed through bounded `/api/review`, without executing submitted code. Removed broad `any` casts in copied rules. |
| part19, part20, part21 | Reasoning verification, consistency and understanding checks | Consolidated into reasoning notes, original diagnostics, interview questions, and central reasoning/concept mentor modes. No unsupported numerical reasoning grade. |
| part22, part23 | Debugging workspace and debug coach | Consolidated into Debug & review plus coding test results, saved observations and contextual mentor. Unsafe execution infrastructure excluded. |
| part24 | Revision and code review | Saved comparison snapshot, visible earlier code, changed-line count, deterministic findings and code-review mentor. |
| part25 | Adaptive challenge selection | Unified into evidence-based next challenge / revisit behavior and the canonical challenge catalog; no separate duplicate session/API. |
| part26 | Skill signal intelligence | One bounded local evidence store; no claims of inference beyond observed practice checks. |
| part27, part28, part29 | Duplicate growth systems | Kept part29's pure comparability/trend logic and part5 evidence weighting. Insufficient evidence is visible, not replaced by fabricated growth. |
| part30, part39 | AI gateway, cost and reliability controls | Replaced multiple gateways with one server-only Gemini REST layer, schema validation, cancellation, timeout, bounded input, same-origin checks and per-process rate limits. Enterprise accounting/control planes excluded. |
| part31, part32 | Role readiness and gap analysis | Canonical role requirements and prerequisites retained. Role exploration and incomplete practice are shown without claiming verified placement readiness. |
| part33&37 | Unrelated PrepVista interview application | Excluded completely; untouched. |
| part34, part35 | Duplicate technical-interview integrations | One anonymous interview journey, contextual feedback and local answers. Authentication, synthetic evaluations and duplicate services excluded. |
| part36 | Cohort/institution/admin intelligence | Excluded from the student-only anonymous prototype; no fake cohort or institutional metrics. Original remains intact. |
| part38 | Technical mastery report | My growth shows actual attempts, weighted practice estimates, guidance and local code snapshots; JSON export replaces a separate report service. |
| part40 | Security/audit/reliability platform | Applied relevant boundary validation, secret handling, error protection, rate limiting and security headers locally; multi-tenant audit/admin infrastructure excluded. |

These dispositions do not claim API-for-API parity with every original backend experiment. The standalone student product preserves useful educational flows without requiring the original databases, tenants, shell runners, mock providers or admin systems.

## Existing duplicate content

Word-frequency exercises from parts 2, 5 and 311 share the same learning objective. Part311 supplies the canonical punctuation/apostrophe contract and detailed authored hints. Two Sum uses part5's executable test bank, including duplicate values. JavaScript equivalents were added to the five Python-first part311 exercises so their actual tests can run safely in the browser. Equivalent JavaScript solutions and short explanatory hints support the copied adaptive algorithm bank; these are authored content, never represented as live AI.

## AI and execution

No OpenAI or Anthropic runtime packages or calls remain. Gemini is the sole provider. Groq was unnecessary and was not added. There was no configured Gemini key in the process or non-template CodeForge environment files; values outside the permitted scope were not inspected or copied. Live Gemini success therefore requires deployment configuration.

QuickJS executes submitted JavaScript only inside WebAssembly in a dedicated browser worker. No host callbacks expose DOM, network, process, filesystem or shell access. Every test gets a fresh VM, a 24 MiB memory limit, a 512 KiB VM stack limit and a 400 ms execution budget. An independent 15-second worker deadline handles initialization/parser stalls. There is no public server code-execution endpoint. Browser practice is not tamper-proof grading.

## Self-containment

The final app has its own package and lockfile, bundled worker, source content, styles, API routes and Render configuration. Next.js production file traces have zero dependencies outside this folder. The original-source audit command is optional development tooling and is not part of install, build, test or runtime. No runtime copy operations or symlinks to original parts are used.
