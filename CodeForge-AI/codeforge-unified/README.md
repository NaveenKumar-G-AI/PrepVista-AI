# PrepVista Coding (CodeForge)

A standalone coding-learning workspace assembled from the original CodeForge prototypes, with PrepVista's original logo, wordmark, typography and light/dark color palette. Students enter directly, without name, email, signup, or login. Drafts, notes, bookmarks, and practice evidence stay in their browser. The header theme toggle remembers PrepVista's `pv_theme` setting; dark mode is the default.

## Requirements

Node.js 24 and npm. Use this folder as the project root. No parent application, database, original part folder, or external assets are required.

## Installation

```sh
npm ci
```

## Environment configuration

Copy `.env.example` to `.env.local`. Set `GEMINI_API_KEY` for live mentoring. `GEMINI_MODEL` defaults to `gemini-2.5-flash`; select another available Gemini model if needed. Optional `APP_ORIGIN` sets the canonical URL for a custom domain. Render automatically supplies `RENDER_EXTERNAL_URL`.

`GEMINI_MODEL` accepts a bare ID (for example `gemini-2.5-flash`) or Google's resource name (`models/gemini-2.5-flash`). Surrounding whitespace and matching quotes are normalized, and blank model settings use the default. Set only the model value in the hosting dashboard, not a URL, display name, or `GEMINI_MODEL=...` assignment. The selected model must be available to your API key and support `generateContent`; see [Google's model resource documentation](https://ai.google.dev/api/models). Save environment changes and restart/redeploy the service.

The former "AI mentoring needs a configuration update" error was raised locally before any provider request when the raw model setting contained a slash or whitespace. Normalization now supports the valid formats above without weakening endpoint validation. Truly invalid settings still fail safely. Provider credentials, quota and model availability must be verified on the deployed service; automated provider tests use test doubles.

Keys stay on the server. Never prefix a key with `NEXT_PUBLIC_`. Without a key, authored exercises, execution, diagnostics, static review, projects, and incident simulation work; AI help shows an honest unavailable state.

## Development

```sh
npm run dev
```

## Build and production runtime

```sh
npm run build
npm run start
```

Next.js generates `.next`. The prebuild step bundles the self-contained QuickJS WebAssembly worker to `public/runner.js`; no third-party CDN is needed. This is a Node web application, not a static export.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start -- --port 3220
# In another terminal, with Chrome installed:
npm run test:e2e
```

The browser tests expect the test server to have no Gemini key, so they can verify the missing-provider state without spending quota. Provider success, malformed responses, rate limits, invalid credentials and timeouts are covered with explicit test doubles in unit tests. `npm run verify:originals` optionally audits the original source folders in the development workspace; it is not an install/build/runtime dependency.

## Deployment on Render

Deploy the contents of **this folder only** as a Render **Web Service**. If retaining this folder under a larger repository, set Render's Root Directory to its repository-relative path. The included `render.yaml` assumes this project is at the deployment repository root.

- Runtime: Node 24 (specified in `.node-version`).
- Build command: `npm ci && npm run build`.
- Start command: `npm run start -- --hostname 0.0.0.0`.
- Output: `.next`, served by Next.js; no publish directory or SPA rewrite is required.
- Health check: `/api/health`.
- Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in Render's Environment panel.
- For a custom domain, set `APP_ORIGIN` to the exact HTTPS origin (no trailing slash).

API routes need the Node service. See [Render's Next.js guide](https://render.com/docs/deploy-nextjs-app) and [Gemini model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash). No deployment is performed by installing or building this project.

## Architecture

- `src/app`: unified Next.js routes and server API endpoints.
- `src/components`: accessible shared shell, persistent editor, coding workspace and mentor.
- `src/engines`: copied deterministic challenge, quality, incident, mastery and growth logic.
- `src/data` / `src/content`: copied educational content and authored scenarios.
- `src/lib`: validated browser storage and integration adapters.
- `src/ai`: Gemini schemas, prompts, provider access, and errors.
- `src/runner`: QuickJS VM inside a dedicated browser worker; memory, CPU, and overall time limits. No network, filesystem or process bindings are exposed to student code.
- `docs`: source inventory, copy manifest, preservation snapshot and consolidation decisions.

## Prototype boundaries

JavaScript execution is real and runs locally in a bounded WASM VM. Practice tests are visible to the browser and are not an examination security system. Passing them does not prove correctness or Big-O complexity. Python, Java and C++ have editing/mentoring where starters exist; their unsafe server executors were excluded. No user code executes in the Next.js process.

The project lab supports requirements, local artifacts, checklists and mentoring; it does not run or deploy an entire notification service. The incident lab is a deterministic, authored simulation with historical metrics and an action log, not live infrastructure. Open-ended diagnostics and interview answers receive coaching rather than fabricated grades. Static review is a best-effort AST heuristic, not a correctness certificate.

Anonymous API rate limits are per process and shared across visitors (12 mentor requests/minute). Public deployment at larger scale needs shared rate limits and provider quota controls. Browser data retains the latest 100 attempts and does not sync across devices. Export backups from Settings.
