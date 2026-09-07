# PrepVista — Premium Landing Experience V6

An interactive placement-readiness landing experience built with React, TypeScript, Vite, Vinext, and Cloudflare Workers. The four live rounds—Aptitude, Technical, Communication, and Interview—run entirely in the browser as an honest product demonstration.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer

Check your versions:

```bash
node --version
npm --version
```

## Run locally

Open a terminal inside the extracted project folder, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

On Windows PowerShell, use the same commands:

```powershell
cd C:\Users\ADMIN\Downloads\PrepVista_V6
npm install
npm run dev
```

Do not use `npm vite`; Vite is a project dependency and is started through `npm run dev`.

## Production checks

```bash
npm run lint
npm run build
npm test
```

Preview the production build:

```bash
npm run start
```

## Main files

- `app/page.tsx` — page structure, live-round logic, and interactions
- `app/globals.css` — complete visual system, motion, and responsive layouts
- `app/layout.tsx` — document metadata and application shell
- `public/` — static visual assets

## Important configuration

The official Startupthon voting URL is read from `NEXT_PUBLIC_STARTUPTHON_VOTE_URL`. If it is not configured, the vote action shows a transparent placeholder message instead of sending visitors to an invented destination.

This is an interactive prototype. Short-round observations are explicitly scoped to the evidence produced during the current session and are not presented as a complete placement assessment or a placement guarantee.
