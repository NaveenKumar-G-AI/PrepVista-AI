# Database — Part 3

## 1. Architecture overview

PostgreSQL + SQLAlchemy 2.x (async, via `asyncpg`) for the application,
Alembic for migrations, with the connection string centralized in
`Settings.database` (see `docs/configuration.md`). No AI provider, agent,
planner, sandbox, or orchestration logic exists yet -- this document
describes only the persistent data foundation those future parts will
build on.

## 2. Entity-relationship diagram

```
USER
 │  (owns; RESTRICT on delete)
 ├── PROJECT ───────────────────────────┐
 │     │  (organization_id optional,     │
 │     │   SET NULL on org delete)       │
 │     │                                  │
ORGANIZATION ── PROJECT                  │
 │  (member of; CASCADE)                 │
 └── ORGANIZATION_MEMBERSHIP             │
                                          │
        PROJECT ◄───────────────────────┘
          │
          ├── REPOSITORY            (1:1, CASCADE with project)
          │
          ├── TASK                  (RESTRICT; hierarchy via parent_task_id,
          │     │                    SET NULL when a parent is deleted)
          │     ├── TASK_DEPENDENCY  (edges between tasks; CASCADE)
          │     │
          │     └── AGENT_RUN        (RESTRICT)
          │           ├── TOOL_EXECUTION   (RESTRICT)
          │           ├── TEST_RUN          (RESTRICT; also -> TASK)
          │           ├── EVALUATION        (RESTRICT; also -> TASK)
          │           └── REPAIR_ATTEMPT    (RESTRICT; also -> TASK)
          │
          ├── GIT_CHECKPOINT        (RESTRICT to project; SET NULL to task/run)
          └── PROJECT_EVENT         (RESTRICT to project; SET NULL to task/run)
```

14 tables total. `TaskDependency` and `OrganizationMembership` are pure
edge/join records, not domain entities in their own right.

## 3. Entities

| Entity | Purpose |
|---|---|
| `User` | Ownership anchor. No auth (password/OAuth/sessions) -- future identity part. |
| `Organization` | Optional team ownership of projects. |
| `OrganizationMembership` | User↔Organization join with a role. |
| `Project` | A software system the autonomous engineer works on. |
| `Repository` | The source repo backing a project (no credentials stored). |
| `Task` | A unit of engineering work; supports hierarchy + dependencies. |
| `TaskDependency` | A directed "must finish before" edge between two tasks. |
| `AgentRun` | One autonomous execution attempt against a task. |
| `ToolExecution` | One tool call (`read_file`, `run_tests`, ...) made by an agent run. |
| `TestRun` | One test-suite execution and its result. |
| `Evaluation` | A judgment of whether a task's implementation met requirements (distinct from "tests passed"). |
| `RepairAttempt` | One autonomous attempt to diagnose/fix a failure. |
| `GitCheckpoint` | A record that a commit was made (does not perform Git operations). |
| `ProjectEvent` | Activity-stream / audit-log entry. |

Every model lives in `backend/app/db/models/`, one file per entity (or
tightly-coupled pair, e.g. `Task` + `TaskDependency`), registered in
`app/db/models/__init__.py` so Alembic autogeneration discovers them via
`Base.metadata`.

## 4. IDs

Every table uses a PostgreSQL-native `UUID` primary key, generated
application-side via `uuid.uuid4()` at object-construction time (see
`UUIDPrimaryKeyMixin` in `app/db/models/mixins.py`) -- not a database
default -- so a new entity's ID is known immediately, before flush, which
matters for wiring up related objects (e.g. creating a `Task` and an
`AgentRun` that references it) within a single unit of work.

## 5. Timestamps

Every persisted timestamp is timezone-aware. This is enforced structurally,
not by convention: `app/db/base.py` sets
`type_annotation_map = {datetime: DateTime(timezone=True)}` on the shared
declarative `Base`, so a plain `Mapped[datetime]` annotation anywhere in
the codebase automatically gets a timezone-aware column -- a model author
cannot accidentally create a naive timestamp column just by forgetting to
write `DateTime(timezone=True)` explicitly.

Two timestamp mixins exist:

- `TimestampMixin` (`created_at` + `updated_at`, both server-side
  `now()`): for entities that change after creation (`User`, `Organization`,
  `Project`, `Repository`, `Task`).
- `CreatedAtMixin` (`created_at` only): for immutable, append-only
  execution-history records (`AgentRun`, `ToolExecution`, `TestRun`,
  `Evaluation`, `RepairAttempt`, `GitCheckpoint`, `ProjectEvent`,
  `TaskDependency`, `OrganizationMembership`) -- there is deliberately no
  `updated_at` to mutate, since nothing should ever UPDATE these rows in
  place.

Lifecycle timestamps beyond `created_at`/`updated_at` (`started_at`,
`completed_at`) are added as plain nullable columns on the specific models
that need them (`Task`, `AgentRun`, `ToolExecution`, `TestRun`,
`RepairAttempt`).

## 6. State models (enums)

Core, stable, queryable status/type fields are native PostgreSQL `ENUM`
types (see `app/db/models/enums.py`, `pg_enum()` helper), not free strings
-- so the database itself rejects an invalid status, not just application
code. Enum member values are the lowercase strings listed in the original
spec (`active`, `pending`, `queued`, ...).

**Deliberate exception: `ProjectEvent.event_type`.** This is a plain
indexed `VARCHAR`, not a native enum. Event types are expected to grow
frequently as future parts add new kinds of activity (new tool events, new
evaluation events, ...); a native enum would require an Alembic migration
for every single new event type, which does not scale as a workflow. A
curated, documented set of known values lives in `ProjectEventType` in
`app/db/models/project_event.py` for discoverability, but the column does
not enforce membership in that set at the database level.

## 7. JSONB usage

JSONB is used only for genuinely dynamic data:

- `AgentRun.extra_metadata`, `TestRun.extra_metadata`,
  `ProjectEvent.extra_metadata` -- provider/framework/event-specific
  details that vary and evolve.
- `ToolExecution.input` / `.output` -- every tool has a different payload
  shape.
- `Evaluation.criteria` -- the structured per-criterion breakdown
  (`functional_correctness`, `code_quality`, ...), since the exact
  criteria set is expected to evolve.

Everything that is always present and commonly queried or filtered on
(status, provider, model, task type, priority, score, timestamps, foreign
keys) is a first-class column instead, per the project's JSONB discipline
rule. Fields are named `extra_metadata`, not `metadata`, because `metadata`
is reserved by SQLAlchemy's declarative API.

## 8. Cascade / deletion behavior

Three deliberate patterns, chosen per relationship rather than applying one
rule everywhere:

| Behavior | Used for | Rationale |
|---|---|---|
| **RESTRICT** | `Project.owner_id`, `Task.project_id`, `AgentRun.task_id`, `ToolExecution.agent_run_id`, `TestRun.{task_id,agent_run_id}`, `Evaluation.{task_id,agent_run_id}`, `RepairAttempt.{task_id,agent_run_id}`, `GitCheckpoint.project_id`, `ProjectEvent.project_id` | Historical/execution records must never silently disappear because something upstream was deleted. The database refuses the delete; an operator must act deliberately (e.g. via a future archival process). |
| **CASCADE** | `Repository.project_id` (1:1 config, not history), `TaskDependency.{task_id,depends_on_task_id}` (pure graph edges), `OrganizationMembership.{organization_id,user_id}` (pure join) | These rows have no independent meaning once their parent/endpoint is gone. |
| **SET NULL** | `Task.parent_task_id`, `Project.organization_id`, `GitCheckpoint.{task_id,agent_run_id}`, `ProjectEvent.{task_id,agent_run_id}` | Optional contextual links. Losing the specific reference is acceptable; the row itself (a task, a checkpoint, an event with its message) still carries useful information on its own. |

`docs/database.md`'s test suite (`tests/integration/test_constraints.py`)
verifies each of these three behaviors directly against real PostgreSQL
foreign key constraints, not just application-level assumptions.

## 9. Soft deletion

`deleted_at` exists on `User`, `Organization`, and `Project` only.
Deactivating a user or archiving a project/org is expected to be routine;
hard-deleting the row would either cascade-destroy history (bad) or be
blocked by RESTRICT everywhere it has execution history hanging off it
(annoying for a routine operation) -- soft deletion sidesteps both.

Execution-history entities (`Task` and everything under it) do **not** get
soft deletion. A task that shouldn't proceed gets `status=cancelled`; there
is no scenario in this design where a `Task`, `AgentRun`, or similar record
should be hidden-but-retained rather than either kept visible or genuinely
gone. Adding `deleted_at` there would be redundant with the status enum and
invite two competing "is this still relevant" signals on the same row.

## 10. Constraints

Beyond foreign keys, enforced at the database level (not just application
code):

- `User.email`, `Organization.slug` -- globally unique.
- `Project` slug -- unique **per ownership scope**, not globally. Two
  partial unique indexes (`uq_project_slug_per_owner` on
  `(owner_id, slug) WHERE organization_id IS NULL`, and
  `uq_project_slug_per_org` on `(organization_id, slug) WHERE
  organization_id IS NOT NULL`) implement "unique within whichever scope
  actually owns this project," which a single `UNIQUE` constraint cannot
  express.
- `Repository.project_id` -- unique, enforcing one repository per project.
- `TaskDependency` -- unique `(task_id, depends_on_task_id)` pair; CHECK
  `task_id != depends_on_task_id` (no self-dependency).
- `OrganizationMembership` -- unique `(organization_id, user_id)` pair.
- Non-negative CHECKs: `Task.attempt_count`, `AgentRun.{input_tokens,
  output_tokens,estimated_cost}`, `ToolExecution.duration_ms`,
  `TestRun.duration_ms`.
- Positive CHECKs: `Task.max_attempts >= 1`, `RepairAttempt.attempt_number
  >= 1`.
- Range CHECK: `Evaluation.score` between 0 and 100 (`NUMERIC(5,2)`,
  human-readable on a dashboard).

### Task dependency cycles

The database only prevents the trivial cases above (self-dependency,
duplicate edges). Detecting longer cycles (A→B→C→A) is a graph traversal
problem that does not fit a single-row CHECK constraint or a reasonably
simple trigger. This is deliberately left to application-level validation
in the future task-scheduling service: before inserting a new dependency
edge, that service should run a graph traversal (e.g. DFS from the
proposed `depends_on_task_id` looking for a path back to `task_id`) and
reject the edge if one exists. Nothing in the schema prevents that check
from being added later.

## 11. Indexing

Indexes exist where the acceptance criteria's listed query patterns need
them: every foreign key (`Task.project_id`, `AgentRun.task_id`,
`ToolExecution.agent_run_id`, ...), every `status` column that will be
filtered on, plus two composite indexes for the two query patterns that
benefit from them specifically: `(Task.project_id, Task.status)` (list a
project's tasks by status) and `(ProjectEvent.project_id,
ProjectEvent.created_at)` (paginate a project's activity feed
chronologically). No index exists "just in case" -- every index has a
write cost, and the spec explicitly warns against indexing every column.

## 12. Migration strategy

One Alembic migration for this part (`e04a09d285c8`, "domain data layer"),
on top of Part 1's empty baseline (`ecad5723cc59`). Notable details:

- **Native PostgreSQL ENUM types require explicit cleanup in
  `downgrade()`.** This was caught during development: `op.drop_table()`
  does not drop the ENUM types a column depended on, so an
  `upgrade → downgrade → upgrade` cycle failed the second `upgrade` with
  "type already exists" until explicit `DROP TYPE IF EXISTS ...`
  statements were added at the end of `downgrade()` for all 16 enum types.
  `tests/integration/test_migrations.py` exercises exactly this cycle
  against a fresh, throwaway database so this class of bug cannot silently
  return.
- Table creation order in `upgrade()` respects FK dependencies
  (`organizations` → `users` → `organization_memberships` → `projects` →
  ... ); `downgrade()` drops in the reverse order.

## 13. Transaction strategy

The database dependency (`app/db/session.py:get_db`) yields one
`AsyncSession` per request scope and does not auto-commit. Callers
(services, in future parts) are responsible for explicit transaction
boundaries: perform one or more operations, then `commit()` -- or let an
exception propagate, in which case nothing is persisted. There is no
implicit "commit at the end of every request" middleware, so a service can
group multiple writes (e.g. "create a task and its first agent run") into
one atomic transaction when that's the correct unit of work.

## 14. Concurrency considerations

Part 3 does not implement a worker or task queue, but the data model does
not make safe concurrent task-claiming impossible for when that arrives.
The intended future approach (not implemented here):

- A worker claims a task by transactionally updating
  `Task.status: pending -> queued` (or `queued -> running`) using
  `SELECT ... FOR UPDATE SKIP LOCKED` (or an equivalent optimistic
  check-then-update with a `WHERE status = 'pending'` guard on the
  `UPDATE`) so two workers can never both successfully claim the same row.
- `AgentRun` rows are created only after a task is successfully claimed,
  so "which agent run is currently working on this task" is always
  derivable from `Task.status` plus the most recent `AgentRun` for that
  task, without a separate locking table.

## 15. Retention considerations

Not implemented in Part 3 (explicitly out of scope), but the schema is
structured so it can be added later without a redesign: durable domain
state (`User`, `Organization`, `Project`, `Task`) is structurally distinct
from high-volume execution artifacts (`ToolExecution`, `TestRun`,
`ProjectEvent`, and to a lesser extent `AgentRun`). A future archival
process can target the latter tables (e.g. "move `ToolExecution` rows
older than N days to cold storage") without touching the former, because
nothing in the durable tables depends on execution-artifact rows still
being present in the primary tables (they're referenced by ID, not
embedded).

## 16. Security

No table in this schema stores API keys, passwords, access tokens, private
keys, or other raw credentials -- `Repository` explicitly has no
credential fields (see its docstring), and provider credentials for the
future AI layer live in `Settings.ai` (environment-variable-backed
`SecretStr` fields), not the database.

`ToolExecution.input` / `.output` and `TestRun.stdout` / `.stderr` are the
main risk surface: a tool call or test run can easily capture a secret
(an env var, an API response, file contents) in its output. This schema
does not sanitize that data itself -- the future tool-execution engine and
test-runner integration are responsible for redacting secrets and bounding
payload size *before* persisting. This is a documented expectation for
those future parts, not a solved problem here.

## 17. What Part 3 deliberately does not do

Per the spec's scope boundary: no LLM provider adapters, model routing,
agent framework, planner, coding agent, tool execution engine, Docker
sandbox, evaluator engine, debugger, autonomous loop, Git automation,
browser automation, dashboard, billing, or authentication. No CRUD API was
added for any of these models -- the existing `/api/v1/health` endpoint
already proves database integration (see its `database: "ok"` field), and
a full CRUD surface belongs to a later application layer once there's an
actual consumer for it.

No Pydantic API schemas were added for these models either, for the same
reason: schemas exist to mediate an API/domain boundary, and there is no
API boundary for projects/tasks/etc. yet. Adding schemas now would mean
speculative, untested contracts that the next part would likely have to
revise anyway once real endpoints are designed around real use cases.
