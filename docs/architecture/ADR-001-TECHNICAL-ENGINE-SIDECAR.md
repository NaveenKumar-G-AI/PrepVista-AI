# ADR-001: Technical Engine Sidecar Versus Python Port

Status: **CONDITIONAL — Phase 1B decision gate**  
Decision date: 2026-09-07

## Context

PrepVista production is FastAPI/Python. The candidate deterministic engine snapshot is TypeScript/Node 20, but its authored-code license is unproven and its full application fails typecheck, build, lint, and audit. A direct port now would make parity and licensing review inseparable and could silently change formulas.

## Decision

If permission is established, use a minimal Node 20 sidecar first to preserve independently verified deterministic behavior. If permission is not established, build a clean-room PrepVista-owned implementation from the approved contracts/fixtures; Python is preferred when fixture parity can be demonstrated without copied expression. In both cases, PrepVista remains the only public API/auth/tenancy/entitlement/evidence owner.

The sidecar, if chosen, is private and stateless. It accepts bounded analysis DTOs, returns deterministic result DTOs, has no database credentials, Supabase keys, user authentication, browser access, AI provider, PDF renderer, outbound internet, filesystem persistence, or user-code execution. It uses a new minimal lockfile and does not inherit the CodeForge server dependency tree.

## Decision gates

- Provenance/permission is resolved, or clean-room workflow is approved.
- Node 20 clean install, typecheck, build, lint, tests, and allowed audit threshold all pass.
- All golden fixtures pass in both reference and target implementation with declared tolerance.
- Static dependency guard and network/credential tests pass.
- Operational owner accepts one additional service, health/SLO, tracing, rollback, and deployment cost.

If any gate fails, the default is **no sidecar activation** and no production integration.

