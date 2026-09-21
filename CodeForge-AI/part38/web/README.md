# Feature 38 — Report UI

React/TypeScript components implementing the student Technical Mastery
Report screen (brief §66-70). These are source files meant to be copied
into CodeForge's real frontend, not a standalone app. `package.json` /
`tsconfig.json` here are **type-checking only** (`npm install && npx tsc
--noEmit` — verified clean, zero errors, against React 18) so the shapes
are provably correct; they don't set up a bundler or dev server, since the
intent is for these files to run inside the host app's existing build.

## What's here

- `src/types/report.ts` — mirrors `server/src/domain/dto.ts`. In the real
  monorepo this should be one shared package imported by both sides.
- `src/lib/reportApi.ts` — typed fetch client for the routes in
  `server/src/http/routes-reports.ts`.
- `src/report-theme.css` — the placeholder design tokens every component
  reads via `var(--report-*)`. **This is the one file to replace** with
  CodeForge's real design system; no component needs to change if the
  variable names stay the same.
- `src/components/report/*` — one component per report section, matching
  the content architecture in brief §7. Each renders nothing (not a
  zero-state placeholder — nothing) when its section has no data, per
  §21 ("only display a category if actual evidence exists").
- `src/pages/TechnicalMasteryReportPage.tsx` — composes them in the order
  brief §67 asks for: identity/state/role before deep technical detail.
  Requests a report, polls while it's generating, and renders once
  `status === COMPLETED`.

## Wiring it up

```tsx
import { TechnicalMasteryReportPage } from "./pages/TechnicalMasteryReportPage";
import "./report-theme.css";

<TechnicalMasteryReportPage
  studentId={studentId}
  api={{
    baseUrl: "https://api.codeforge.example",
    authHeader: () => `Bearer ${getRealSessionToken()}`, // swap for the app's real auth
  }}
/>;
```

## Known gaps in this reference build

- No skeleton/shimmer loading state — just a centered status line. A real
  build should match CodeForge's existing loading pattern.
- No cohort/bulk views (brief §51, §61-62 have a real backend; this folder
  only covers the single-student report screen, per §6 "do not
  over-engineer unused variants").
- Not run through an actual bundler/browser in this sandbox — verified with
  `tsc --noEmit` (types, JSX, props all check out) but not build- or
  visually-verified. Test it in the host app's real build before shipping.
