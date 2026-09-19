# Expanded Golden Parity Fixture Report

Status: **PASS — 54 deterministic fixtures and 2 boundary checks**  
Engine label: `codeforge-snapshot-1.0.0+phase1a`

The executable inventory is `CodeForge-AI/tests/phase1a.expanded-golden-parity.test.ts`. Every fixture records an ID, engine version, exact input, expected output, tolerance, and `DETERMINISTIC` classification. It imports only pure/non-executing engine modules.

Validation command: `npm test -- --run tests/phase1a.expanded-golden-parity.test.ts tests/phase1a.technical-boundary.test.ts`. Result: 2 files passed, 56 tests passed, 0 failed under the installed locked toolchain. The formal Node 20 baseline remains red for the full application as recorded separately.

Final full snapshot regression: 5 test files passed, 71 tests passed, 0 failed.

| Area | Fixture IDs | Requested coverage |
|---|---|---|
| Correctness | `correctness/*` (7) | Full/partial/all-failed/timeout, shared failure clusters, requirement coverage, regression conflict |
| Quality | `quality/*` (7) | Clean, long, deep nesting, duplication, naming, missing error handling, before/after |
| Understanding | `understanding/*` (8) | Explanation, prediction, invariant, complexity, counterfactual, debugging, transfer, partial evidence |
| Debugging | `debugging/*` (8) | Reproduce, hypothesis, experiment, root cause, minimal diff, regression verification, positive/negative overfitting |
| Mastery | `mastery/*` (8) | Recent independent, old, hints, repeated mistakes, prerequisite weakness, transfer, insufficient, contradiction |
| Gaps | `gap/*` (4) | Surface, root blocker, multiple prerequisites, no evidence |
| Adaptive | `adaptive/*` (6) | Difficulty, role, review, transfer, stale, prerequisite repair |
| Readiness | `readiness/*` (4) | Complete, partial, missing core, critical blocker; freezes current unsafe missing-to-zero behavior |
| Schema guards | `fixture/*` (2) | AI finding isolation and monotonic difficulty weighting |

## Observed risks frozen by the fixtures

- Unknown mastery still serializes as numeric zero in `computeMastery`, even though gap analysis labels missing signals `UNKNOWN`.
- CodeForge readiness separately turns missing evidence into blockers at mastery zero. That behavior is intentionally not accepted as the PrepVista V1 policy.
- Probe “difficulty” values are named rungs (`explanation`, `prediction`, `causal_reasoning`, `modification`, `transfer`), not conventional beginner/intermediate labels.
- The debugging threshold lookup produces 70 for a single hypothesis and a single completed experiment; this surprising behavior is frozen, not endorsed.
- The fixtures do not execute user code and are not proof that the execution subsystem is safe.
