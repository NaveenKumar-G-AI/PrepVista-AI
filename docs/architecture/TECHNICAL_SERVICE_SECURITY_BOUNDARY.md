# Technical Service Security Boundary

Status: Phase 1A contract

The service is an internal deterministic calculator, not an application backend.

## Allowed

- Versioned JSON requests from PrepVista over an authenticated private service channel.
- Bounded source text or normalized IR for static analysis only.
- Deterministic correctness results produced by a separately trusted execution provider.
- Structured outputs with engine/policy version, timing, and trace ID.

## Forbidden

- Supabase/JWT authentication, public routes, cookies, sessions, user/org repositories, PostgreSQL/SQLite, billing, plans, entitlements, PDF/report generation, AI calls, outbound network, shell/process APIs, Docker control, filesystem persistence, and execution of submitted code.
- Trusting client-supplied `profile_id` or `organization_id`; PrepVista resolves identity and passes a short-lived scoped service assertion.
- Logging source, transcripts, resumes, hidden tests, credentials, or full requests.

## Controls

Maximum request 256 KiB, source 128 KiB, 5-second deadline, 64 KiB response, concurrency/rate bounds, schema allowlist, unknown-field rejection, content hashing, structured redacted logs, trace propagation, mTLS or signed short-lived service token, deny-by-default egress, read-only container, non-root user, dropped Linux capabilities, resource limits, and deploy-time SBOM/signature scanning. Failures are fail-closed and never fall back to unsafe local execution.

`CodeForge-AI/tests/phase1a.technical-boundary.test.ts` pins reviewed files and rejects prohibited imports/operations. Phase 1B must replace this snapshot-oriented guard with a guard over the newly owned technical package.

