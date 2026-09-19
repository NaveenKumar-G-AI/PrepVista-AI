# Isolated coding validation: implementation and qualification

Status: implemented locally, disabled by default, not qualified or deployed on a
real runner host. Local Windows tooling has no Docker installation. Never enable
this service merely because the WASM fixtures or mocked gateway tests pass.

## Authority and data flow

An authenticated pilot student requests validation of an existing immutable,
owner-scoped artifact. The request accepts only the original owner and an
idempotency key. PrepVista selects a versioned server suite, fingerprints the code
and suite, reserves a separate bounded pilot allowance and commits a queued job.
Interview allowances and billing are unchanged. Reservations count against daily
abuse/capacity limits even when a response becomes unavailable; no monetary charge
or new paid entitlement is implemented by this feature.

`python -m scripts.process_coding_validation --once` dispatches one queued job.
Without an enabled, configured runner it opens no database. With configuration it
uses the existing pool with migrations disabled, claims a single-use 45-second
lease and calls one fixed HTTPS gateway origin. No redirects or environment proxy
settings are accepted. The request includes code, entry point, authored tests,
opaque job/lease IDs and hashes; no student identity, resume, transcript, provider
credential, database credential or application token is sent.

The separate gateway checks its service credential, image digest, request shape,
code hash and concurrency limit before creating a container. It binds loopback
only and needs authenticated HTTPS ingress on the dedicated host. No new gateway
is attached to PrepVista's web container, frontend deployment or database host.

The gateway uses a fixed Docker socket and argument arrays with no shell. Each
job requires a locally loaded digest-pinned image and the `runsc` runtime, denies
network access, drops all capabilities, sets no-new-privileges, runs as UID/GID
65532, mounts no host paths, disables container logging and uses a read-only root.
Limits are 128 MiB memory without additional swap, 0.5 CPU and 32 PIDs. After
creation, Docker inspection must confirm these controls before code is supplied.
The container receives only a bounded JSON document on stdin.

The image runs a QuickJS/WASM interpreter with no guest host bindings, fresh
contexts per test, 24 MiB VM memory, bounded stack, 350 ms per-test interrupts and
64 KB returned JSON. A captured serializer and host-side comparison keep student
code from replacing the comparison logic. The gateway bounds output, execution
and cleanup; an independent `/usr/bin/timeout` in the image kills the entire job
after 15 seconds even if the gateway dies. Cleanup removes only that generated
container. Failed cleanup returns unavailable; monitor for stopped, labelled
orphan containers on the dedicated host.

These controls use the documented [Docker run restrictions](https://docs.docker.com/reference/cli/docker/container/run/),
[gVisor Docker runtime](https://gvisor.dev/docs/user_guide/quick_start/docker/), and
[QuickJS runtime limits](https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten/classes/QuickJSRuntime.md).
They require host qualification; a runtime name or configuration string does not
prove that the deployed host actually meets the boundary.

The gateway returns only declared case IDs and bounded outcome categories. The
dispatcher checks every expected case, count, image, hash, job and lease before
settlement. Duplicate/late results cannot replace committed results. Failed,
expired, malformed or mismatched responses become `UNAVAILABLE`, with no student
performance conclusion. Jobs are not automatically replayed after a possible
execution; students can deliberately request another check within their allowance.

Successful settlement and a `coding_validation` outbox event commit atomically.
The adapter preserves artifact correlation, qualification reference and suite
provenance. `practice-evidence-v2` adds isolated-server sources to the shared
readiness list, preserves unresolved browser failures and counts the same code
once across repeated checks. Server failures propose a repair of that artifact.
V1 projection code and stored snapshots remain available for historical replay.
The overall policy remains foundation-only and `MORE_EVIDENCE_NEEDED`: covered
server behavior does not establish authorship, independence or role readiness.

Initial suites cover JavaScript task version 1 for
`debug-duplicate-feature-vectors` and `search-insert-position`. Other tasks and
languages return unsupported, never a failing grade. Changing a suite requires a
new suite identifier/hash and qualification; queued jobs whose configuration or
suite changed become unavailable rather than running a substituted assessment.

Students can request checks from a saved artifact and inspect bounded progress.
`/readiness/validations` provides owner-only, paginated history and JSON downloads
without coding feature flags. Account/source erasure cascades through jobs and
invalidates derived evidence/snapshots; deletion tombstones block resurrection.

## Local verification

From `services/coding-runner`, use Node 24 and run:

```text
npm ci --ignore-scripts
npm test
npm audit --omit=dev --audit-level=high
```

These tests exercise actual QuickJS with authored fixtures and a real loopback
HTTP gateway whose container launcher is mocked. They verify wrong answers,
missing host bindings, loops, memory/output abuse, serializer tampering, context
isolation, gateway authentication/concurrency and required container settings.
They do not execute Docker or demonstrate gVisor isolation.

Backend tests exercise immutable receipts, cross-account authorization, budget
concurrency, expiry, malformed results, rollback access, outbox/replay and deletion
using actual additive migration `040_coding_validation.sql` in isolated PostgreSQL.
The target migration ledger must still be checked before any real application
startup: application startup applies migrations even with feature flags off.

## Dedicated-host qualification and rollout

1. Select a dedicated Linux execution host with no application/database workloads,
   no application secrets and a reviewed Docker/gVisor installation. Review who
   can access the Docker socket and the gateway service credential. Do not mount
   the socket into a submission container.
2. Review a Node 24 Debian bookworm base containing `/usr/bin/timeout`. Supply its
   immutable digest as `NODE_BASE` when building `services/coding-runner/Dockerfile`.
   Build from the lockfile and record base/source/dependency/image digests. Inspect
   the resulting image for unexpected files, secrets, environment and volumes.
   Load the approved result on the runner host before any request; jobs never pull
   an image themselves.
3. Set `RUNNER_IMAGE` to the approved full digest reference on that host and run
   `node qualify.mjs` from `services/coding-runner`. This invokes real restricted
   containers and records bounded smoke outcomes. Its output is not release
   authorization or assessment qualification.
4. Verify ingress authentication/TLS, network and filesystem isolation, resource
   exhaustion, forced gateway/daemon failures, orphan cleanup, cancellation,
   concurrent load and secret separation on the actual host. Record failures and
   repairs. Review the declared test suite's validity independently from runtime
   isolation. An operator qualification reference identifies this reviewed record.
5. Start the gateway using Node 24 with `RUNNER_SERVICE_TOKEN`, `RUNNER_IMAGE` and
   bounded `RUNNER_CONCURRENCY`. Keep the service token in the host secret manager.
   The gateway listens on 127.0.0.1:8081; configure the host's HTTPS ingress and
   restrict it to the intended dispatcher. Monitor queue age, unavailable jobs,
   host resource use and orphan cleanup without recording code/test payloads.
6. Configure PrepVista's `CODING_RUNNER_URL` (HTTPS origin only), private
   `CODING_RUNNER_TOKEN`, matching `CODING_RUNNER_IMAGE`, recorded
   `CODING_RUNNER_QUALIFICATION_ID` and separate daily/global/concurrency limits.
   Preserve the exact pilot profile allowlist. Enable
   `CODING_TRUSTED_VALIDATION_ENABLED` only after these checks, alongside required
   workspace/sync/evidence capabilities, and deploy the independent dispatcher.
7. Run the authenticated saved-code → job → result → outbox → snapshot → repair
   journey in staging with two accounts, deleted sources, expired leases and
   unchanged interview allowances. Rehearse disabling validation/worker visibility
   while retaining saved checks and exports. Then follow the main pilot gates.

No exact host, base/image digest, service credential or qualification record has
been supplied for this workspace. These values remain empty; no live execution
service, production migration or validation feature flag has been activated.
