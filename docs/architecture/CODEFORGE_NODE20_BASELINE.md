# CodeForge Node 20 Baseline

Status: **FAIL**  
Run date: 2026-09-07  
Runtime: Node `v20.20.2`, npm `10.9.9`, TypeScript `5.9.3`, Vitest `4.1.11`  
Lockfile SHA-256: `4dba0b994e0e9825d5ab636d2db46e41575576d4f7aa9e0290c9ec7080623a22`

The baseline used an isolated Node 20 binary and a clean `npm ci`. No production PrepVista code or configuration was changed.

| Check | Expected | Actual | Root cause | Impact / repair gate |
|---|---|---|---|---|
| `npm ci` | Exact lock install succeeds | PASS; 373 packages added, 374 audited | Lock is internally installable | None; preserve lock until provenance decision |
| `npm run typecheck` | Exit 0 | FAIL, exit 2 | `src/api/routes/readiness.ts:42-43` uses `SignalSkillState` and `SignalTrend` as runtime values after `import type` (`TS1361`) | Snapshot cannot be a production build input. Repair only in an isolated branch after Phase 1B approval |
| `npm run build` | Exit 0 | FAIL, exit 2 | Same two `TS1361` errors | No deployable artifact exists |
| `npm run lint` | Exit 0 | FAIL, exit 1 | `src/engine/report/services/narrative/guardrail.ts:37` violates `no-constant-condition` | Quality gate is red; do not waive silently |
| `npm test` | Exit 0 | PASS; 3 files, 15 tests | Existing suite is small and smoke tests use in-memory repositories | Passing tests do not offset build/provenance failures |
| `npm audit` | No moderate-or-higher findings | FAIL, exit 1; 3 moderate | Direct `express@4.22.2` resolves vulnerable `body-parser/qs`; advisories `GHSA-x5fp-wj9c-mxmx`, `GHSA-4mjr-xmp4-gh2g` | CodeForge web/server dependency tree is not admissible. Technical engine sidecar must not inherit it |

## Baseline conclusion

Node 20 compatibility is not established because typecheck, build, lint, and audit gates fail. The correct repair plan is to avoid shipping the snapshot server and dependency graph, create a minimal isolated technical-engine package/service, pin Node 20 in CI, and require install/typecheck/build/lint/test/audit to pass before integration. No Phase 1A repair was applied.

