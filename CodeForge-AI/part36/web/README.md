# Dashboard components (illustrative)

`components/CohortIntelligencePanels.tsx` implements four of the
reusable components from spec section 57 — `CoverageIndicator`,
`SkillDistribution`, `TrainingPriorityPanel`, and
`CohortExecutiveOverview` — plus a default-exported showcase wiring
them together with demo data shaped exactly like the real API
responses (see `docs/API.md`).

**This is a starting point, not the full frontend.** It's dependency-light
(just `react`, self-styled with inline styles, no build config
assumptions) so you can drop it into whatever app shell you're
building. What section 57-58 additionally ask for and this doesn't
include: `RoleDistribution`, `SkillHeatmap`, `GrowthTrend`,
`CohortComparison`, `DepartmentBreakdown`, routing, data fetching,
loading/error states, and an accessibility pass beyond what's
free from using semantic markup and real color contrast.

## Using it

```bash
npm install react
# copy components/CohortIntelligencePanels.tsx into your app
```

```tsx
import { CohortExecutiveOverview, SkillDistribution, TrainingPriorityPanel } from './CohortIntelligencePanels';

// fetch from GET /api/v1/cohorts/:id/overview, /skills, /training-priorities
// and pass the JSON straight in — the prop shapes match the API responses.
<CohortExecutiveOverview data={overview} />
<SkillDistribution skills={overview_skills} />
<TrainingPriorityPanel priorities={training_priorities} />
```

## Fonts

The components reference Fraunces / IBM Plex Sans / IBM Plex Mono with
safe system-font fallbacks, so they render fine without any setup. For
the intended type pairing, add this to your app's `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link
  href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
  rel="stylesheet"
>
```

## Design note

The evidence-coverage meter is the deliberate signature element: a
stat with sufficient evidence renders as a solid, numbered bar; a stat
without it renders as a dashed, number-free outline — everywhere in
this file, not just on one hero indicator. That's the backend's
`canMakeStrengthClaim()` rule (`src/core/coverage.ts`) made visible,
so a low-confidence number is never one glance away from looking like
a confident one.
