# Feature 41 — Career Strategy UI (frontend)

React + TypeScript components implementing the P0 UI surface of the
Feature 41 spec. Meant to be copied into ACEAPT's existing frontend and
wired to its real API base URL and auth — this is a component library, not
a standalone app (there's no bundler config here on purpose).

## Files

- `src/types.ts` — mirrors the backend's `CommandCenterView` contract.
- `src/tokens.ts` — the design tokens (color/radius/font). Swap for your
  real design system if you have one; nothing else depends on these being
  used verbatim.
- `src/api/careerStrategyApi.ts` — thin fetch wrapper for the backend routes.
- `src/components/CareerCommandCenter.tsx` — the primary dashboard
  (spec #45-46). This is the component you actually mount; it composes
  everything else.
- `src/components/NextBestMoveCard.tsx` — the centerpiece card, including
  the "Why this?" panel and the "Not now" reason-picker.
- `src/components/BottleneckCard.tsx`, `StrategyHealthCard.tsx`,
  `MomentumCard.tsx`, `StrategyTimeline.tsx`, `ConstraintBanner.tsx`,
  `StatePlaceholders.tsx` (Empty/LowData), `StrategyChangeConfirmationModal.tsx`.

## Using it

```tsx
import { CareerCommandCenter } from './components/CareerCommandCenter';
import { createCareerStrategyApi } from './api/careerStrategyApi';

const api = createCareerStrategyApi('https://your-api-host', () => ({
  // replace with however your app actually authenticates today
  'x-student-id': currentStudentId,
}));

<CareerCommandCenter studentId={currentStudentId} api={api} />
```

## What's stubbed

`CareerCommandCenter`'s `handleStart` and `handleNotNow` have comments
marking where they need to call your real action-creation route once one
exists on the backend (the spec's route list covers command-center reads,
strategy-change confirmation, decisions, action status updates by id, and
recommendation feedback — but creating a `StrategyAction` record from a
`NextBestMove` the student just accepted wasn't an explicit route in the
P0 list, so it's left as a clearly marked integration point rather than
guessed at).

## Type-checking

```bash
npm install
npm run typecheck
```
