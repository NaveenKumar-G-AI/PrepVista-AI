# ACEAPT Feature 45 — Aptitude Skill Graph (web components)

Student skill-map UI + admin console, built against the `service/` API.
React + TypeScript + Tailwind, no exotic UI kit dependency beyond
`lucide-react` for icons — chosen so these components drop into most
existing React apps (Next.js, CRA, Vite) with minimal friction.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173 — expects service/ running on :4045
npm run build    # type-checks (tsc -b) then produces a production bundle
```

Set `VITE_API_BASE_URL` if the backend isn't at the default
`http://localhost:4045/api`.

## Components

| Component | Spec section | What it does |
|---|---|---|
| `SkillMapOverview` | 50 | Level-1 view: domain lines, current focus, strong foundations, needs attention |
| `SkillCategoryDrilldown` | 51 | Progressive disclosure: domain → categories → skills, with filters |
| `SkillNodeCard` | 52 | The reusable "station" card (capability ring, state, evidence, trend) |
| `SkillDetailPanel` | 53 | Full node detail: capability/trend/evidence, prerequisites/related/dependents, root-cause "why it matters" |
| `RelationshipExplainer` | 54, 57 | Text-first "why are these connected" sentence — the accessible fallback IS the primary content, not a caption |
| `SkillGraphFilters` | 55 | All / weak / strong / goal-relevant / recently practiced / needs evidence |
| `MobileSkillPathView` | 56 | Linear expandable path (skill → prerequisites → related → dependents) for small screens, instead of a wide graph layout |
| `AdminSkillGraphConsole` | 58–59 | Validation report, publish gate (disabled while critical issues exist), version history |

`App.tsx` is a runnable demo harness wiring all of the above together
against `student_demo_1` (seeded by `service/npm run db:seed`) and an admin
token — swap in your real routing/auth once dropped into ACEAPT's app.

## Design system

The visual language treats the graph as a curriculum **transit map**: each
domain (Quant/Logical/Verbal) is a line with its own color, each skill is a
station, capability is how "filled" a station's ring is, and a relationship's
confidence controls how solid the line connecting two stations reads. Colors
and type intentionally avoid the generic AI-dashboard defaults:

- **Type:** Space Grotesk (display/headings/numbers) + IBM Plex Sans (body)
  + IBM Plex Mono (stable skill codes like `QUANT.PROBABILITY` — using a
  distinct monospace face for codes is a deliberate nod to spec section 14's
  "these are machine identifiers, never display names").
- **Color:** an off-white/cool-grey paper base (not the cream+serif
  cliché), ink-navy text, three muted "line" colors (steady blue for Quant,
  plum for Logical, forest green for Verbal), one reserved amber accent
  used only for the "current focus" callout.
- **Accessibility:** every relationship has a plain-language sentence
  (`RelationshipExplainer`) regardless of visual rendering (section 57);
  `prefers-reduced-motion` disables the capability-fill animation; all
  interactive elements are real `<button>`s with `aria-pressed`/`aria-expanded`
  where relevant.

See `tailwind.config.ts` for the full token set.

## Known limitations

- `SkillDetailPanel` shows everything the API actually returns
  (capability/trend/evidence/prerequisites/related/dependents/root-cause). It
  does **not** show a raw mistake list or recent-attempt history — there's no
  backend endpoint for that in this build (Feature 45 consumes mistake/mastery
  evidence, it doesn't expose a full audit trail of it), so the panel doesn't
  pretend to.
- "Mobile" here means responsive-web (Tailwind breakpoints) plus the
  dedicated `MobileSkillPathView` linear layout — there's no separate native
  mobile implementation to detect or match, since no existing ACEAPT mobile
  codebase was available.
