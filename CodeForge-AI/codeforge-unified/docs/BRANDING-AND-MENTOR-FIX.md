# PrepVista branding and mentor configuration fix

Implemented and checked locally on 11 September 2026 in `CodeForge-AI/codeforge-unified`. No Aceapt or PrepVista source files were changed.

## Branding

- PrepVista's original `frontend/public/prepvista.png` is bundled locally, unchanged. SHA-256: `22c6bb17ec860dde109f86bd9a8ac8039f937afe885b1092767bcbe6624daf36`.
- `src/app/prepvista-theme.css` copies the exact light/dark values from PrepVista's `frontend/src/app/globals.css`. CodeForge's shared surfaces, navigation, editor, buttons, mentor, feedback and form controls reference these tokens.
- PrepVista's Segoe UI / Helvetica Neue typography, wordmark and image appear in the desktop sidebar and mobile header. Metadata, favicon, mentor identity, footer and user-facing branding use PrepVista.
- Dark mode is the default. The header toggle persists `pv_theme` and synchronizes changes across tabs. Existing `codeforge.workspace.v1` data and `coding-backup-...json` files remain compatible.

## Mentor fix

The old provider validated the raw `GEMINI_MODEL` string with a pattern that rejected every slash and whitespace character. This raised "AI mentoring needs a configuration update" before calling Google for values such as `models/gemini-2.5-flash` or a model ID followed by a newline.

`src/ai/config.ts` now trims model values, removes surrounding matching quotes, accepts the `models/` resource prefix, and validates the remaining identifier before constructing the request URL. Empty model values use the existing default. Keys are normalized for surrounding whitespace/quotes; blank keys still produce the honest missing-configuration state. Invalid paths, URLs, query strings, fragments and environment assignments are rejected before any network call. Configured model choices are preserved.

Google documents the resource-name format in its [Models API reference](https://ai.google.dev/api/models). A correctly formatted identifier still requires a model available to the configured key and supporting `generateContent`. Live credentials were not present in this local application, so live provider access and hosted environment values were not verified. Deploy/restart the service with the updated code and its server-side `GEMINI_API_KEY` and `GEMINI_MODEL` settings. Do not enter secrets in the learner UI.

## Validation

- ESLint, TypeScript and the production build passed (34 generated pages).
- 56 unit tests passed, including 19 new configuration cases. They verify normalized provider URLs/headers, supported pasted formats, and rejection without network calls. Provider responses use explicit test doubles.
- All nine existing Playwright journeys passed, including real JavaScript execution, contained infinite loops, unavailable mentoring, persistence, backups, diagnostics, interviews and incident exercises.
- Additional browser inspection covered 11 routes at 1440, 800 and 390 pixels in both themes (66 combinations): exact computed brand/page/text/sidebar values, page titles, logo loading and no horizontal overflow or uncaught page errors.
- Mentor retry after an error rendered a successful test response and cleared the prior error. Theme selection synchronized between tabs and persisted after reload.
- Desktop/mobile workspace and coding screenshots were captured; dark workspace and light coding views were visually inspected. See `docs/screenshots/prepvista-*`.
- Original-file audit: 41 original folders, 2,060 matching file hashes, zero differences.

Publication uses the separate `CodeForge-AI/.publish-coding-20260911` checkout linked to `NaveenKumar-G-AI/CodeForge-AI`. Live deployment and hosted Gemini access remain unverified.
