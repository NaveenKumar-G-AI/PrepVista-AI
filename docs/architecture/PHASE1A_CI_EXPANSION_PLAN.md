# Phase 1A CI Expansion Plan

Status: review-only; `.github/workflows/ci.yml` is unchanged

Add a separate non-production `technical-design-validation` job only after Phase 1B approval:

1. Checkout without LFS-generated/vendor artifacts and verify the authored source allowlist.
2. Use exact Node 20 and npm versions; reject Node 21+.
3. Run `npm ci`, lockfile drift check, typecheck, build, lint, full tests, golden parity, and technical boundary tests.
4. Run production-only dependency audit, license/SBOM generation, secret scan, and artifact signature/hash output.
5. Run PrepVista Python tests and frontend lint/typecheck/build unchanged as independent required jobs.
6. Run draft migration static checks against an ephemeral PostgreSQL/Supabase-compatible database only; never point CI at production.
7. Publish diagnostic artifacts without source/resume/transcript/test payloads.

Required merge gates: all checks exit zero, no lock drift, no high/critical vulnerability, moderate findings explicitly time-bounded and approved, no unknown dependency licenses, fixture count cannot decrease, tenant/RLS tests pass, and no CodeForge excluded path becomes tracked.

Current Node 20 failures make this planned job red by design. Do not weaken rules or add continue-on-error to make it green.

