# Skill Graph

## Design

The skill graph is entirely data — `skills` and `skill_relationships` tables — never hardcoded into application logic. `SkillGraphService` (`src/skillgraph/skillGraphService.ts`) is the only place that queries it, via plain functions (`getChildren`, `getDirectPrerequisites`, `getAllPrerequisites`, `getRelated`, `getDependents`). No module outside this service contains a skill name as a string literal in a conditional — every downstream module (mastery estimator, gap detector, ranking engine) operates on whatever skills and relationships happen to be in the database.

## Hierarchy (SUBSKILL_OF)

Modeled via `skills.parent_skill_id` rather than a relationship-table row, since it's a strict tree and a dedicated column is simpler to query correctly than a self-referential relationship type. The seeded tree (`src/db/seed.ts`):

```
Programming
├── Python
│   ├── Python Functions
│   ├── Python Collections
│   └── Python OOP
├── Data Structures
│   ├── Arrays
│   ├── Strings
│   ├── Hash Maps
│   ├── Stacks
│   ├── Queues
│   ├── Trees
│   └── Graphs
└── Algorithms
    ├── Searching
    ├── Sorting
    ├── Two Pointers
    ├── Sliding Window
    ├── Recursion
    ├── Dynamic Programming
    └── Graph Algorithms
```

21 skills total (including the root grouping node, which is never itself a recommendation target — see `CODEFORGE_RECOMMENDATION_ENGINE.md`, "content-bearing skills").

## Relationships (PREREQUISITE / RELATED_TO / BUILDS_ON / TRANSFER_TO)

Stored in `skill_relationships(from_skill_id, to_skill_id, relationship_type, weight)`. Convention: for `PREREQUISITE`, `from` is the prerequisite **of** `to`.

The seeded relationships (12 total):

| From | Type | To |
|---|---|---|
| Arrays | PREREQUISITE | Two Pointers |
| Arrays | PREREQUISITE | Sliding Window |
| Arrays | PREREQUISITE | Searching |
| Two Pointers | BUILDS_ON | Sliding Window |
| Hash Maps | RELATED_TO | Sliding Window |
| Stacks | RELATED_TO | Queues |
| Queues | PREREQUISITE | Graph Algorithms |
| Graphs | PREREQUISITE | Graph Algorithms |
| Recursion | PREREQUISITE | Graph Algorithms |
| Recursion | PREREQUISITE | Dynamic Programming |
| Searching | TRANSFER_TO | Graph Algorithms |
| Python Functions | PREREQUISITE | Python OOP |

The `Queues → Graph Algorithms` edge is deliberately the exact chain used as a worked example in the original spec (Queues → BFS → Graph Traversal), and is the edge exercised by the prerequisite-analysis tests in `tests/unit/prerequisite.test.ts` and the E2E scenario in `tests/e2e/demoScenario.test.ts`.

## Extensibility

Adding a skill, a relationship, or re-wiring the graph entirely is a data change in `src/db/seed.ts` (or, in production, a row insert against `db/schema.sql`'s tables) — it requires no changes to `SkillGraphService`, the mastery estimators, gap detection, or the recommendation engine. This was verified directly: the prerequisite-analysis tests construct graph edges purely through the seeded data and assert on the engine's behavior, not on any hardcoded skill name inside the detection logic itself (the *test* code references skill names because it needs to make assertions in English — the engine code under test does not).

## Known limitation

The graph is a modest, hand-curated seed (21 skills, 12 relationships, 10 challenges) sized to make every phase of the adaptive loop genuinely exercisable and testable in this reference build, not a full DSA curriculum. Scaling the content catalog is a data-authoring task, not an architecture change.
