# CodeForge AI — Role-Based Technical Identity & Career Context
## Final Report

## 1. Purpose and scope

This module answers, with structured data rather than an LLM guess: what does a given technical
role actually require, at what level, and how does that relate to adjacent roles? It gives
students a way to explore and select a career target, and gives every future CodeForge capability
(diagnostics, challenges, mastery, readiness) one authoritative place to ask "what should I
measure for this role" instead of re-deriving it.

Explicitly **not** built here, per the brief's own scope boundary: coding challenges, code
execution, diagnostics, mastery scoring, role-readiness calculation, or any AI recommendation
logic. Those are future consumers of this domain, not part of it.

## 2. What actually runs, with real output

Everything below is copy-pasted from actually running the code in this repository, not projected.

**Seed (`npm run seed`):**
```
career domains: 2
role families: 4
roles: 11 (10 active)
competencies: 17
skills: 68
technologies: 25
skill prerequisites: 17
```

**Validation report (`npm run validate`):**
```
Content counts
  Career domains: 2            Role-competency mappings: 94
  Role families: 4             Role-skill mappings: 64
  Roles (total): 11            Role-technology mappings: 66
  Roles (ACTIVE): 10           Skill prerequisites: 17
  Roles (DEPRECATED): 1        Institutions: 2
  Role versions: 12            Role variants: 1
  Competencies: 17
  Skills: 68
  Technologies: 25

Integrity checks — all 14 checks: 0
Result: PASS
```

**Tests (`npm test`):** 33 tests / 3 files, all passing —
- `tests/domain.test.ts` (10): cycle rejection (including the exact A→B→C→A example from the
  brief), search ranking tiers, comparison logic.
- `tests/careerContext.service.test.ts` (9): selection, deprecated-role rejection, unknown-role
  rejection, duplicate-primary/secondary rejection, history preservation across a role change,
  per-slot isolation (changing secondary doesn't touch primary's history), idempotency, and the
  version-pinning guarantee (data-analyst v1 vs. v2).
- `tests/api.test.ts` (14): unauthenticated/unknown-student rejection, RBAC (a student can only
  ever read/write their own context), payload validation, deprecated-role selection rejected via
  the API, cross-tenant institution access denied identically to a nonexistent institution, search
  and compare over HTTP.

**Live smoke test:** the dev server was actually started and hit with real HTTP requests
(`curl`) — role listing, a role selection, and an unauthenticated request returning 401 — outside
of the test harness, confirming the wiring works end to end and not just in-process.

`npm run typecheck` is clean (`tsc --noEmit`, strict mode, zero errors).

## 3. Integration contracts (Step 97)

Every contract below is implemented, not aspirational — the function names are real.

| Future consumer | Calls | Returns | Who owns what |
|---|---|---|---|
| Diagnostic | `RoleService.getRoleRequirements(slug)` | Competencies/skills/technologies at the role's current version, each with `importance` + `expectedProficiency` | This module owns *what's required*. A diagnostic module owns *what the student demonstrated* and must record which `role_version` it assessed against, the same way `student_role_history` does. |
| Coding Challenge | Same `RoleDetail`, filtered by `skill.slug` / `technology.slug` | A set of skills and supported languages (`role_technology`) to draw problems from | This module owns the requirement catalog and the skill prerequisite graph (`listAllSkillPrerequisites()`). The challenge module owns problem content and grading. |
| Adaptive sequencing | `listAllSkillPrerequisites()` | The DAG of what must come before what | The prerequisite *graph* lives here; sequencing *decisions* belong to the adaptive module. |
| Mastery | `PROFICIENCY_DEFINITIONS` (`src/domain/types.ts`) | The single shared meaning of FOUNDATION…ADVANCED | This module defines what "STRONG" means; a mastery module measures whether a student has reached it. Never mixed — no student score is stored or computed anywhere in this codebase (Step 40). |
| Role Readiness | Role requirements (here) **+** student evidence (future mastery module) | — (not computed here) | Deliberately not implemented — Step 41 draws this line explicitly. |
| PrepVista Unified Student Intelligence | `getStudentCareerContext(studentId)` → `CareerContextService.getContext`; `getPrimaryRole(studentId)` → derived from the same call; `getRoleRequirements/CompetencyMap/SkillMap(roleId)` → `RoleService.getRoleRequirements(slug)` and its `.competencies`/`.skills` fields | Everything the brief's Step 81 contract names | Read-only from PrepVista's perspective; nothing here writes into PrepVista's own tables. |

## 4. Hostile review (Step 93) — condensed, with real findings

| Reviewer | Finding | Severity | Resolution |
|---|---|---|---|
| Database Engineer | Neither Postgres nor SQLite can express "no cycles in this graph" as a declarative constraint. | HIGH | Enforced in the service layer at write time (`wouldCreateCycle`) and re-audited for the whole graph by `validate.ts` (`findCycles`, Kahn's algorithm) — two independent implementations so a bug in one isn't masked by the other. Documented as a DB limitation, not silently assumed away. |
| Security Engineer | Mock auth trusts a raw `x-student-id` header with no verification. | CRITICAL for production / acceptable for a labeled prototype | Isolated to one function (`src/api/auth.ts`), loudly commented, and every route reads identity only from `req.auth` — never the body or query string — so replacing it with real session/JWT verification is a one-file change with zero route changes. |
| Security Engineer | Should an unexpected field in the `PUT career-context` body (e.g. an attempted `studentId` override) be silently dropped or rejected outright? | MEDIUM | Rejected outright (`zod.strict()` → 400). A clear error is a better signal than a silent no-op, and it means there is no code path anywhere that reads a caller-supplied student id — tested in `tests/api.test.ts`. |
| Principal Architect | Step 17's conceptual `role_technology` schema lists both `usage_type` and `importance` — two axes for one relationship. | MEDIUM | Kept `usage_type` only; its four values (`COMMON`→`SUPPORTING`) already read as an importance ordering, so a second field would be redundant. Simplification documented here rather than left unexplained. |
| Accessibility Specialist | Semantic markup, labelled controls, and visible focus states are implemented in the demo UI, but nothing has been run through an automated audit tool or a real screen reader. | MEDIUM | Left as a known gap — see the truth table below. Not claimed as done. |
| College Placement Team | `role_variant` has a schema and a tenant-scoped read endpoint, but no admin workflow exists to create one. | Not a gap — by design | Step 36 explicitly says not to build the full admin surface unless an existing architecture requires it. Recorded as NOT IMPLEMENTED (by design), not silently omitted. |
| Investor | Why is this more than a role picker? | — | Because every future CodeForge capability (diagnostic, challenge, mastery, readiness) can call `getRoleRequirements()` instead of re-deriving "what does this role need" from scratch or an LLM guess. The picker is the visible 10%; the structured, versioned, tenant-safe requirement catalog underneath it is the actual deliverable. |

## 5. Truth table (Step 99)

| Capability | Status |
|---|---|
| Domain hierarchy (domain→family→role→competency→skill→subskill), technology as a separate axis | IMPLEMENTED |
| Role versioning with immutable snapshots, proven with a real two-version role | IMPLEMENTED |
| Circular-dependency protection, proven against the brief's own A→B→C→A example | IMPLEMENTED |
| Deterministic search, no LLM | IMPLEMENTED |
| Role comparison derived purely from mappings | IMPLEMENTED |
| Student career context: select, change, preserve history, idempotent writes | IMPLEMENTED |
| RBAC: students read-only on the catalog, read/write only their own context, no mutation routes exist for catalog data at all | IMPLEMENTED |
| Tenant isolation for institution-scoped resources, cross-tenant request indistinguishable from "not found" | IMPLEMENTED |
| Validation/report script with real, live-queried numbers | IMPLEMENTED |
| Automated tests (33, three levels: pure domain logic, service, HTTP) | IMPLEMENTED |
| Integration contracts for future modules | IMPLEMENTED |
| Interactive demo of the full student-facing flow | IMPLEMENTED (as a self-contained artifact — see §6) |
| Accessibility (semantic markup, labels, focus, keyboard nav) | PARTIAL — implemented, not independently audited |
| Institution/tenant admin workflow (creating role variants) | NOT IMPLEMENTED — by design, per Step 36 |
| Observability / metrics pipeline | NOT IMPLEMENTED — structured error codes exist; no metrics backend exists to wire into |
| Integration into a real "PrepVista" repository | NOT IMPLEMENTED — none was provided |
| Live Postgres/Supabase deployment | NOT IMPLEMENTED — no reachable instance in this environment; production DDL is provided instead |
| AI recommendation engine | NOT IMPLEMENTED — explicitly out of scope per the brief itself |
| Coding challenges, diagnostics, mastery scoring, readiness calculation | NOT IMPLEMENTED — explicitly out of scope per the brief itself |
| Third-party security penetration test | NOT IMPLEMENTED — automated RBAC/tenant tests exist; not a substitute for a real audit |

## 6. The demo (Step 96)

The backend above is real but not reachable from a browser-rendered artifact (this sandbox's
server isn't exposed to the internet). The interactive demo is therefore a self-contained React
artifact using the same taxonomy content and the artifact platform's persistent storage API in
place of hitting this API over HTTP — so selections and history genuinely persist across reloads,
not just within one session. See the artifact for the full search → browse → detail → compare →
select → confirm → change-target flow.

## 7. Final self-check (Step 100)

- Can a student understand the role? Yes — role detail view with plain-language description, no
  jargon-only competency dumps.
- Can they select it, is it persisted, can they change it, is history preserved? Yes to all four —
  proven by `tests/careerContext.service.test.ts`, not just asserted.
- Are role requirements structured, are competencies separated from technologies, are skills
  reusable across roles? Yes — see §3 of `ARCHITECTURE_AND_RESEARCH.md` for how the brief's own
  ambiguity on this point was resolved, and Python's reuse across nine roles in the seed data.
- Are proficiency definitions standardized? Yes — one shared export, five levels, capped at STRONG
  in this seed on purpose.
- Are prerequisite relationships validated, including against cycles? Yes, twice over (write-time
  check + whole-graph audit).
- Can future modules consume requirements without an LLM inventing them? Yes — §3.
- Can unauthorized users modify anything? No mutation route exists for catalog data at all; a
  student can only ever write their own career context, enforced from the authenticated identity,
  never from caller-supplied input — tested.
- Can one institution reach another's private context? No — tested, and a cross-tenant request is
  indistinguishable from a nonexistent one.
- Are all claims here backed by something that actually ran? Yes — §2 is real output, not a
  projection, and §5 says NOT IMPLEMENTED wherever that's the honest answer.
