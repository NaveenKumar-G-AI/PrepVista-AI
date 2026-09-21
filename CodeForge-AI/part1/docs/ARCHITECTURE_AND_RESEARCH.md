# Reconnaissance, Research & Architecture Decisions

## 1. Reconnaissance (Step 0)

No repository was attached to the build prompt — only the prompt text itself. Step 0 asks to
inspect "the complete codebase available," find the existing student/auth model, existing
Supabase usage, existing design system, and so on. None of that exists here to inspect. Inventing
plausible-sounding details about infrastructure that wasn't provided would be exactly the kind of
fabrication the brief itself repeatedly warns against (Step 71, Step 89), so this build does the
opposite: it states the gap and builds a standalone module with clean integration seams instead.

**What was reused:** nothing — there was nothing to reuse.

**What was built:** the entire module (schema, domain logic, API, tests, demo UI) as a
self-contained package, using conventions common enough that dropping it into a real Supabase +
TypeScript repository should mean replacing a handful of named seams, not rewriting the domain:

| Seam | Where | What a real integration replaces it with |
|---|---|---|
| Authentication | `src/api/auth.ts` | Real session/JWT verification. Every route already reads identity only from `req.auth`, never from the request body or query string, so this is a one-file change. |
| Student identity | `student` table (schema + `CareerContextRepo.getStudentById`) | A view/join against the real PrepVista student table. |
| Persistence | `src/db/connection.ts` (better-sqlite3) | `db/postgres/schema.sql` is the production-intended schema; swapping the repository layer to `pg`/Supabase client calls is mechanical since the SQL shape doesn't change. |

## 2. Research (Step 1)

Two O*NET occupation profiles and the SFIA programming skill were checked directly (not
trusted from memory) before finalizing the taxonomy:

**O*NET 15-1252.00, Software Developers** (onetonline.org/link/summary/15-1252.00). O*NET's
profile frames the occupation around building and maintaining software to meet user needs, using
engineering and computer-science methods, and working with others to define and validate a
system. *Adopted:* this maps directly onto the Programming, Problem Solving, Testing & Quality,
Debugging, and Engineering Communication competencies used across every Software Development role
in the seed. *Not adopted:* O*NET has no notion of "competency vs. skill vs. technology" — that
three-way split (Step 2) had to be designed from scratch; O*NET's occupational structure doesn't
need it, this domain does.

**O*NET 15-2051.00, Data Scientists** (onetonline.org/link/summary/15-2051.00). O*NET frames the
occupation as turning large, often messy datasets into decisions — statistical processing and
modeling on the front end, communicating what was found on the back end, with the whole point
being an answer someone else can act on rather than the model itself. *Adopted:* this is what
motivated keeping Data Scientist and Data Analyst as two distinct roles rather than one —
modeling-and-inference work and day-to-day SQL/BI reporting are genuinely different jobs — and it
grounded the "Business & Stakeholder Interpretation" competency.

**SFIA, "Programming/software development" (PROG)** (sfia-online.org). SFIA's central idea is that
a skill isn't one fixed thing — it's evaluated at graduated levels, from close supervision on
simple, well-defined work up through independent ownership of complex, ambiguous work. *Adopted:*
that graduated-independence idea is exactly what the 5-level Proficiency framework (Step 12) is.
*Not adopted, and why it matters:* SFIA runs to seven levels, and its top two are organizational
and strategic leadership — that doesn't fit a student audience, so this domain caps at five levels
(FOUNDATION→ADVANCED), and every seeded role requirement is capped at STRONG. ADVANCED is
deliberately unused anywhere in the seed data. Step 71 bans inflated career claims; the same
discipline was applied to proficiency bars — an entry-level catalog shouldn't imply senior-level
expectations by default.

Beyond these three primary checks, the remaining role definitions (Frontend/Full Stack/QA-SDET/
DevOps/Data Engineer, and the specific skill and technology lists) were synthesized from common,
widely-documented industry practice rather than one named source — noted here rather than
attributed to a framework that wasn't actually consulted for each of them.

## 3. Key design decisions

**Role content is versioned as immutable snapshots, not a mutable counter.** `role` is the stable
identity; `role_version` rows are never edited after creation, and every `role_competency` /
`role_skill` / `role_technology` row points at a specific `role_version_id`, not just a role. This
is what makes Step 6/48's requirement literal: a student's history can point at version 1 forever,
even after version 2 becomes current. `data-analyst` ships with two real versions to prove this —
see `docs/FINAL_REPORT.md` and `tests/careerContext.service.test.ts`.

**Skill vs. Technology, resolving the brief's own inconsistency.** Step 2 lists "Python" as a
Language/Technology example; Step 8/20 use "Python" as the canonical *skill* reuse example; Step 9
then nests general programming sub-topics (Functions, Classes, Exception Handling, Async) directly
under "Python" as if it were a skill with subskills. Those can't all be true in one schema without
breaking Step 20's own reusability requirement (you'd duplicate "Exception Handling" once per
language). Resolution used here: Technology answers *what you'll use* (Python, Java, React, …);
Skill answers *what you can demonstrate, in any language* (Exception Handling, Object-Oriented
Programming, …), grouped under the competency "Programming." Python remains a Technology, attached
to nine of the ten active roles — the reuse Step 20 asks for is demonstrated across technologies
and skills both, not just one axis.

**Slugs, not database ids, are the external identity** (Step 5). Every API path and every request
body field uses a stable slug (`backend-engineer`, `data-structures-algorithms`); UUIDs never
leave the database layer.

**`skill.competency_id` is a display grouping hint, not an ownership constraint.** A role's actual
requirements are `role_competency` and `role_skill`, independently. The optional link just lets a
role-detail page group "Hashing" under "Data Structures & Algorithms" without forcing every skill
into exactly one competency's exclusive ownership.

**SQLite prototype, Postgres-shaped production schema.** No live Postgres/Supabase instance is
reachable from this build environment. `db/sqlite/schema.sql` (what actually runs, with real
foreign keys, unique constraints, and check constraints enforced by SQLite itself) and
`db/postgres/schema.sql` (native enums, `gen_random_uuid()`, the intended production DDL) are kept
structurally identical on purpose — regenerate one from the other if they ever drift.
