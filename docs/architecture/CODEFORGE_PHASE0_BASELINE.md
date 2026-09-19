# CodeForge Phase 0 provenance and diagnostic baseline

Status: analysis-only baseline, captured 2026-09-07. This document does not certify CodeForge for production use.

## Repository boundary and provenance

- PrepVista repository: `NaveenKumar-G-AI/PrepVista-AI`, branch `main`, baseline commit `eea354b613981e73cd4750bdd5ff0c7de55f93ae`.
- Imported location: `CodeForge-AI/` inside the PrepVista worktree.
- `CodeForge-AI/` contains no nested `.git` directory, commit ID, tag, or signed source manifest. Its author, upstream repository, exact version, and code license therefore remain **unverified**.
- No top-level CodeForge `LICENSE` file is present. Dependency licenses do not grant a license to the imported application code.
- Phase 0 quarantine rules in [`.gitignore`](../../.gitignore) exclude `node_modules/`, `dist/`, `parts-archive/`, every nested `db/`, coverage, caches, temporary output, logs, build metadata, and nested frontend build/dependency output. `git check-ignore -v` confirms representative files in each imported bulk directory are ignored.
- Do not use `git add -A` for this import. Review and stage authored files explicitly only after provenance and licensing are resolved.

## Inventory

| Set | Files | Bytes | Phase 0 disposition |
|---|---:|---:|---|
| `src/` | 340 | 2,129,705 | Candidate authored source; each boundary must be assessed |
| `tests/` before Phase 0 | 1 | 5,447 | Authored active tests |
| `frontend/` | 29 | 254,104 | Rejected as an application shell; retain only for reference |
| `public/` | 1 | 17,839 | Rejected standalone UI |
| `scripts/` | 2 | 30,979 | Diagnostic reference only; database scripts are not trusted migration foundations |
| `docs/` | 130 | 1,112,885 | Design claims only; implementation evidence takes precedence |
| `db/` | 111 | 874,345 | Quarantined database copies; do not import |
| `parts-archive/` | 285 | 1,398,552 | Quarantined historical parts; not canonical source |
| `dist/` | 1,288 | 4,014,747 | Quarantined generated output |
| `node_modules/` | 7,500 | 137,377,667 | Quarantined vendor dependencies |

The pre-Phase-0 `src/` + active `tests/` set contained 341 files. A deterministic manifest formed by sorting relative POSIX paths and pairing each with its SHA-256 has aggregate SHA-256:

`513848981e779a22f4d2153796054568026dd4f41a9c3d2da866475673f7a3ec`

Key file hashes:

| File | SHA-256 |
|---|---|
| `package.json` | `9fc2b2838fd0107a344d642c1889c4405d3ba49c48709fc3facd92059e21f277` |
| `package-lock.json` | `4dba0b994e0e9825d5ab636d2db46e41575576d4f7aa9e0290c9ec7080623a22` |
| `tsconfig.json` | `9bee3991981207c1f46972c73ac6dcc683d1d2a663edea26b840bb9a8fbf87fe` |
| `vitest.config.ts` | `d83cfd88a36296836f7120ca26361aad9a0402269e4d067f18a3e68b5fd345b5` |
| `README.md` | `ac7dc41b2892b2cf6b87162107616f214811578245a9be82799907a59b8ddc9e` |
| `CODEBASE_FEATURE_CATALOG.md` | `8bff688af9e14476650c6bc081f05c34e48cb55d47cfb8565908a105fc238abc` |

The aggregate hash is an inventory fingerprint, not proof of origin. Phase 1 must obtain an upstream URL/commit or a signed owner attestation and a license grant before production reuse.

## Reproducibility and commands

CodeForge declares Node `>=20 <21` in [`package.json`](../../CodeForge-AI/package.json), while this diagnostic machine supplied Node `v24.14.0` and npm `11.9.0`. Results must be repeated in clean Node 20 CI before becoming a release gate.

| Command | Result | Evidence |
|---|---|---|
| `npm test -- --reporter=dot` | PASS: 2 files, 7 tests | Smoke output warns that the in-memory repository registry is in use; see [`production.smoke.test.ts`](../../CodeForge-AI/src/production.smoke.test.ts) |
| `npm test -- --reporter=dot tests/phase0.golden-parity.test.ts` | PASS: 1 file, 8 fixtures | Pure deterministic functions only; see [`phase0.golden-parity.test.ts`](../../CodeForge-AI/tests/phase0.golden-parity.test.ts) |
| `npm run typecheck` | FAIL: 2 TS1361 errors | [`readiness.ts`](../../CodeForge-AI/src/api/routes/readiness.ts) imports `SignalSkillState` and `SignalTrend` with `import type` but uses them as runtime values |
| `npm run build` | FAIL: same 2 TS1361 errors | No reproducible clean build exists |
| `npm run lint` | FAIL: 1 error | Constant condition in [`guardrail.ts`](../../CodeForge-AI/src/engine/report/services/narrative/guardrail.ts) |
| `npm audit --omit=dev --json` | FAIL policy: 3 moderate vulnerabilities | Direct Express 4.22.2 is affected through `body-parser` and `qs`; fixes are reported available |

No Phase 0 production source was corrected. The only CodeForge addition is the isolated golden parity test.

## Dependency and license snapshot

Installed dependency metadata reports 423 packages: 195 production, 228 development, and 54 optional. All direct installed dependencies declare MIT except TypeScript, which declares Apache-2.0. This is only a direct-package metadata check; transitive notices and application-code licensing still require a proper Software Bill of Materials and legal review.

Direct production packages observed: `better-sqlite3 9.6.0`, `compression 1.8.1`, `cors 2.8.6`, `express 4.22.2`, `helmet 7.2.0`, `jose 5.10.0`, `jsonwebtoken 9.0.3`, `pdfkit 0.20.2`, `pg 8.23.0`, `pino 10.3.1`, `pino-http 11.0.0`, and `zod 3.25.76`, plus type-only packages currently placed in `dependencies`.

## Canonical-source decision

For parity analysis only, the canonical candidate is authored TypeScript under `CodeForge-AI/src/`, constrained further to the exact deterministic files listed in blueprint section B. `dist/`, `parts-archive/`, `db/`, the standalone frontend/public files, server composition, repository implementations, auth middleware, AI gateway, and execution providers are not canonical integration foundations.

## Unsafe or incomplete foundations

- [`server.ts`](../../CodeForge-AI/src/server.ts) constructs CodeForge repositories/engines, exposes `/api`, serves its own frontend, and listens publicly. It is not a PrepVista service boundary.
- [`repositories/index.ts`](../../CodeForge-AI/src/repositories/index.ts) explicitly creates an in-memory registry.
- [`engine/index.ts`](../../CodeForge-AI/src/engine/index.ts) wires in-memory cohort/interview repositories and empty intelligence ports.
- [`cohort-intelligence/index.ts`](../../CodeForge-AI/src/api/routes/cohort-intelligence/index.ts) trusts `x-org-id` and contains unimplemented responses.
- [`providers.ts`](../../CodeForge-AI/src/ai/providers.ts) can fall back to a mock provider. PrepVista's provider registry must remain authoritative.
- [`localProcessProvider.ts`](../../CodeForge-AI/src/execution/localProcessProvider.ts), [`executor.ts`](../../CodeForge-AI/src/engine/personalized-challenge-engine/execution/executor.ts), [`runner.ts`](../../CodeForge-AI/src/engine/hidden-test-engine/sandbox/runner.ts), and [`validation-pipeline.ts`](../../CodeForge-AI/src/engine/hidden-test-engine/ai/validation-pipeline.ts) invoke host processes. They are prohibited from PrepVista integration.

## PrepVista regression baseline

- Python compilation passed.
- The complete PrepVista test suite passed with `392 passed` when its temporary directory was placed inside the writable workspace. An earlier Windows temporary-directory permission error was environmental, not a product test failure.
- The existing frontend had already passed lint, TypeScript checking, and production build at the approved PrepVista baseline.
- PrepVista migration execution records SHA-256 checksums and detects historical drift in [`connection.py`](../../app/database/connection.py). Historical migrations must not be edited.

## Baseline conclusion

CodeForge is a useful algorithm source, not a deployable product component. Its origin/license, Node 20 reproducibility, build/type-check, lint, vulnerability status, and broad engine parity must all be resolved before production extraction.
