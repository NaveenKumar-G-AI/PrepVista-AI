# Coding integration: first implementation slice

**Historical record.** Later implementation supersedes the capability limits below.
See the [current implementation and release record](UNIFIED_INTEGRATION_IMPLEMENTATION_STATUS.md)
for sync, imports, mentoring, artifact handoff, evidence and readiness status.

Updated 2026-09-12. Implements the beginning of the
[safe integration plan](PREPVISTA_CODEFORGE_SAFE_INTEGRATION_PLAN_V2.md), not the
complete unified product. No production deployment, database migration, paid
grant, guest import or readiness promotion has been performed.

## Implemented behavior

- `/coding` offers the current CodeForge catalog's 19 challenges inside the
  existing PrepVista frontend. `/coding/practice/{id}` provides a JavaScript
  editor, actual isolated practice checks, hints, explanation notes and download.
- The existing account header exposes Coding only after an authenticated
  `/coding/access` response enables the current canonical profile. Disabled,
  anonymous, unavailable and mismatched-identity responses do not mount editors.
- The backend requires both `CODING_WORKSPACE_ENABLED=true` and an exact match
  in `CODING_PILOT_PROFILE_IDS`. Both default to no access. Empty and `*` lists
  do not grant everyone access. Admin status and a paid plan do not bypass this.
- The access response is private/no-store and fixes result authority to
  `CLIENT_REPORTED`, persistence to `BROWSER_TAB`, and all paid AI, sync and
  readiness capabilities to false. No coding mutation/assessment endpoint exists.
- Drafts and explanations recover within the same tab using a new profile-scoped
  sessionStorage namespace. Signing out clears this namespace. Changing accounts
  remounts the editor and cannot recover the previous account's draft. Download
  provides a local JSON backup; it is not a supported server import format yet.
- Code changes leave old results visibly stale; export omits results for a
  different draft. A hint marks the export assisted. Absence of a recorded hint
  remains unknown assistance, not proof of independent work.
- Practice links to existing interview practice. The explanation stays local;
  it is not yet an authorized artifact-context handoff into the interviewer.

## Boundaries preserved

The port reuses 12 explicitly selected content/domain/runner source files from
`CodeForge-AI/codeforge-unified/src`, with namespaced imports. The
[source manifest](CODING_SLICE_SOURCE_MANIFEST.json) records originals and hashes.
The original CodeForge application remains available and unchanged by the port.
Commercial rights review is still open (R57); a copy manifest is not legal clearance.

The page shell, auth provider, Next.js 16.3.3 and React 19.2.3 remain PrepVista's.
No second React runtime, login system, Gemini route or global CodeForge CSS was
copied. Python/Java/C++ execution is not advertised in this slice. Other original
CodeForge workspaces remain in the standalone product pending their own port.

The practice worker is compiled from source during `predev` and `prebuild` into
`public/coding-assets/runner-v1.js`. This generated file is ignored by Git; a
deployment must run the normal build before start. It is a public practice asset,
not an authentication or exam-secrecy boundary. Its response permits WASM and
denies network connections; the interview page's microphone and CSP remain intact.
Changing the runner message protocol requires a new asset version and compatible
client change. The worker asset revalidates rather than using an immutable cache.

Preserved limits: 20,000 source characters, 30 checks, a fresh QuickJS runtime per
check, 24 MiB runtime memory, 512 KiB stack, 400 ms interpreter deadline per check,
bounded output and an independent 15-second worker termination deadline. The VM
receives no application secrets or host API bridges. Students can cancel runs;
navigation or account change terminates the editor's worker. These controls do not
make client-reported outcomes trusted assessment evidence.

The worker's policy is separate from the document policy, following
[MDN worker CSP guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy).
WASM permissions follow the
[script-src documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).
Runtime limit/disposal usage follows the
[QuickJS runtime API](https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten/classes/QuickJSRuntime.md).

## Local pilot configuration

Keep the default-off settings for ordinary environments. To exercise an internal
pilot after reviewing this slice, configure the existing backend with:

```dotenv
CODING_WORKSPACE_ENABLED=true
CODING_PILOT_PROFILE_IDS=<existing-canonical-prepvista-profile-uuid>
```

Restart the backend after configuration changes. Sign in through PrepVista and
open `/coding`. There is no frontend/public enable flag or URL override. Access
rechecks on focus and at most once a minute per mounted access hook. Existing
interview routes, quotas, provider calls, reports and stored scores are unchanged.

Do not enable this for a broad student population yet: drafts are tab-local, not
durable cross-device records. Keep the original standalone guest workspace and
data until the explicit import phase is implemented and reconciled.

## Verification record

Local verification uses Node 24.14.0 and the existing Python virtual environment.
The backend tests replace auth and settings with test fixtures; no production
Supabase, provider, quota ledger or database is contacted. Browser tests run
against the production build with mocked auth/API responses and a real QuickJS
worker. They are integration checks for this practice slice, not RLS or live auth
certification. The existing interview browser cases mock speech/provider behavior.

Final local results:

| Check | Result |
| --- | --- |
| Backend pytest, workspace-local temporary directory | 454 passed, including 9 coding access cases |
| Frontend unit tests | 14 passed |
| Production build with `NEXT_PUBLIC_API_URL=https://api.prepvista.invalid` | Passed; coding routes and generated worker included |
| TypeScript and ESLint | Passed |
| Production-browser journeys | 14 passed: 6 coding cases plus 8 existing interview/product cases |
| Reference solutions in the real browser worker | All 19 passed their practice checks |
| Runner boundary | Host APIs absent, loop interrupted, cancel preserved draft |
| Account lifecycle | Anonymous/non-pilot blocked in UI; account switch isolated drafts; sign-out cleared recovery |
| Security headers | Worker-specific WASM policy; interview microphone permission preserved |
| Dependency audit after targeted updates | Zero reported vulnerabilities |
| Source manifest | All 12 original hashes and namespaced ports verified |

The final browser run completed successfully outside the restricted process
sandbox, which had stalled during test-server cleanup. ESLint excludes generated
Playwright trace/report directories; application and test source remain linted.

The first backend baseline hit a Windows temporary-directory permission error in
two fixtures. Re-running with a new workspace-local `--basetemp` passed. One browser
assertion initially matched two alert elements; the selector was narrowed to the
cancellation message. Neither finding required a change to interview behavior.

Dependencies: QuickJS browser variant/core pinned to 0.32.0; esbuild pinned to
0.28.2 after the older CodeForge build-tool version triggered an audit finding.
Targeted compatible transitive updates addressed existing humanfs, browser-mapping
and Browserslist findings. The successful install/update audit reported zero
vulnerabilities. Next.js and React versions were not changed.

CI now runs frontend unit tests and browser integration checks after the production
build. Local runs use installed Chrome; CI installs Playwright Chromium. The
existing standalone CodeForge verification job is preserved.

## Remaining work and release gates

This slice contributes to phases 0–2. It does not close every G0/G1/G2 risk: source
rights, deployed migration ledger and production identity validation remain open.
The [64-risk register](PREPVISTA_CODEFORGE_INTEGRATION_RISKS_V2.md) remains the release
checklist; local tests are evidence for scoped controls, not blanket risk closure.

Next implementation sequence:

1. Reconcile actual database ledger, personal/organization scope and applicable
   entitlements. Define durable draft, attempt and artifact contracts with
   optimistic revisions and object-level access controls; allocate fresh migration
   numbers only after this review.
2. Add server persistence and recovery, then explicit guest-import preview/commit
   with manifests, idempotency and reconciliation. Test real PostgreSQL/RLS and two
   users/two tenants before enabling writes.
3. Add bounded AI mentoring through the existing provider/usage authority, with
   atomic reservations and no changes to interview allowances.
4. Add transactional outbox/evidence adapters and immutable artifact handoff to
   the interviewer. Keep local outcomes client-reported.
5. Qualify evidence and role policies; shadow the single readiness list and mission
   coordinator; only then pilot student-facing readiness and organization views.
6. Port the remaining reviewed CodeForge screens and retire duplicate routes only
   after feature parity and recovery gates pass.

Rollback for this slice: turn the backend flag off and restart. The coding UI stops
mounting after access refresh; no server coding records or changed credits need
reversal. Tab drafts remain available for recovery if access is restored, except
after explicit sign-out. Do not generalize this rollback to future server-sync
releases: those must retain read/export access to accepted durable writes.
