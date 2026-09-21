# Integration stubs

Feature 57's spec assumes a live ACEAPT codebase to inspect and reuse
(secs. 7-9): existing Formula Intelligence (56), Skill graph (45), Question
Family / Difficulty (55) / Novelty (49) services, and Mistake Intelligence.
None of that exists in this build environment, and the brief for this build
was to build only what was specified rather than invent those other
features.

Every file in this folder is a narrow interface plus a harmless stub
implementation that returns `null`/`UNKNOWN` instead of throwing. Feature 57
runs completely standalone against these stubs. To wire in a real feature:

1. Implement the interface (e.g. `FormulaClient`) against the real service.
2. Pass your implementation into the relevant service's constructor instead
   of the `Stub...Client` (see `src/api/index.ts`, where all services are
   constructed).

No business logic should ever live in this folder - it's a seam, not a
feature.
