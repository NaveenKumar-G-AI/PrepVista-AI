# ACEAPT OS — Feature 21: Diagnosis + Next-Best-Action Engine

A working implementation of the Feature 21 build prompt: evidence → diagnosis →
root-cause priority → next-best-action → (once wired to real data) verification
→ updated student model.

This is a **v1 engine scaffold**, not a finished production service. It runs
end to end today against a realistic mock dataset with zero configuration.
Wiring it to your real Features 13–20 means implementing one interface
(`UpstreamEvidenceProvider`) — nothing else in the engine needs to change.

## Quickstart

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run demo        # runs the full pipeline against 3 mock students, prints results
```

No API key or network access is required for any of the above. The demo is
the fastest way to see real output — it's worth reading before the code.

## Visual demo

`demo-ui/AceaptNextBestAction.jsx` is a self-contained React component
showing what "today's best action" could look like on a home screen —
root-cause trace, diagnosis map, recovery path, escalation, and verified
history — built from the *actual* output the engine produced for Priya,
Arjun, and Meera when `npm run demo` was run against this codebase. It's
also shared alongside this project as a standalone interactive preview.

## What this does NOT do

Built only from the spec you provided — nothing extra bolted on:

- It does **not** reimplement Features 13–20. It defines the interface Feature
  21 needs from them (`src/upstreamAdapters.ts`) and ships a mock so the
  engine is runnable on its own. Your real Features 13–20 plug in behind that
  same interface.
- It does **not** call any external AI model by default. Diagnosis and action
  selection are transparent, debuggable heuristics over evidence — not a
  black-box model. `explanationGenerator.ts` has one *optional* LLM hook for
  rewording the final explanation in a warmer voice; see "API keys" below.
- No database. The mock adapter is in-memory. Your production adapter is
  where persistence lives.
- No UI. There's a companion visual artifact showing the "today's best
  action" screen concept, but the engine itself is UI-agnostic.

## Spec section → file map

| Spec section(s) | Concept | Implementation |
|---|---|---|
| §3, §4, §8, §36 | 18-category diagnosis taxonomy, evidence-first | `types.ts` (`DiagnosisCategory`), `diagnosisClassifiers.ts` |
| §5, §37, §38, §39 | Confidence levels, decay, false-positive/negative protection | `diagnosisEngine.ts` (INSUFFICIENT_EVIDENCE / INCONSISTENT_PERFORMANCE gates) |
| §6, §7, §12 | Root-cause graph, bottleneck priority | `rootCauseGraph.ts` |
| §9 | Temporal diagnosis (new vs. recurring) | `RetentionEvidence.daysSinceLastMastery` feeding `retrievalWeakness` / `retentionDecay` in `diagnosisClassifiers.ts` |
| §10, §11 | Error pattern detection & clustering | `errorClustering.ts` |
| §13, §14, §22 | Action catalog, action selection, escalation ladder | `actionCatalog.ts` |
| §15, §16 | Minimum effective intervention, action cost | `actionScoring.ts` (value ÷ time-cost formula — see comment at top of file) |
| §17, §24, §25 | Student state, fatigue-awareness, adaptive session length | `studentState.ts` |
| §18, §30, §31 | Daily best action, explanation, student control framing | `explanationGenerator.ts`, `orchestrator.ts` (`primaryExplanation`) |
| §19 | Multi-action recovery path | `orchestrator.ts` (`buildRecoveryPath`) |
| §20, §43, §44 | Before/after verification, intervention memory, no overclaiming causality | `interventionMemory.ts`, `explanationGenerator.ts` (`explainVerifiedIntervention`) |
| §21, §22 | Failed-intervention detection, escalation | `actionScoring.ts` (`escalateIfNeeded`) |
| §26–§29 | Urgency, deadlines, goals, personalization | `actionScoring.ts` (`goalRelevance`, `readinessImpact`) |
| §32, §33 | Diagnosis timeline, overall graph shape | `NextBestActionResult.timelineEntry` in `types.ts` |
| §34, §35 | Cross-feature reasoning, conflicting signals | `pressurePerformanceDegradation` classifier explicitly checks retention + reasoning before concluding "pressure, not knowledge" |
| §40–§42 | Action ranking, next-best-action score, diversity | `actionScoring.ts` |

Sections not listed above (personal learning strategy in §45 onward) were cut
off in the prompt you provided and weren't built — see "Extending this"
below for how the existing structure extends to cover more.

## Integrating your real Features 13–20

Everything upstream of Feature 21 is accessed through one interface in
`src/upstreamAdapters.ts`:

```ts
export interface UpstreamEvidenceProvider
  extends Feature13Readiness, Feature14MasteryTransfer, Feature15LearningJourney,
    Feature16InterventionRecovery, Feature17QuestionIntelligence,
    Feature18ReasoningIntelligence, Feature19Retention, Feature20SimulationPressure {
  getStudent(studentId): Student;
  getSkillGraph(): Skill[];
}
```

`MockUpstreamBundle` is one throwaway implementation of it, used only by
`src/demo.ts` and `src/mockData.ts`. To go live:

1. Write a real class implementing `UpstreamEvidenceProvider` — likely by
   calling your existing Feature 13–20 modules or their internal APIs
   directly from each method.
2. Pass an instance of it into `runDiagnosisAndNextBestAction(provider,
   studentId, skillIdsInScope)` from `src/orchestrator.ts` instead of
   `MockUpstreamBundle`.
3. Delete `mockData.ts` and `MockUpstreamBundle` once you no longer need
   them for local testing.

Nothing in `diagnosisEngine.ts`, `diagnosisClassifiers.ts`,
`rootCauseGraph.ts`, `actionScoring.ts`, or `orchestrator.ts` needs to
change — they only depend on the interface, never on the mock.

`skillIdsInScope` (which skills to actively diagnose today) is left to the
caller — in production this would typically be "skills touched in the last
N days," from Feature 15.

## API keys and config

Copy `.env.example` to `.env`. Every value in it is blank on purpose — this
was built without assuming your infrastructure, so fill in what's real for
you:

- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` — both optional. Only used by
  `enhanceWithLLM()` in `explanationGenerator.ts`, which rewrites the
  template-based explanation in a warmer voice while a system prompt
  constrains it to preserve every hedge word, number, and fact. If either is
  unset, the engine silently uses the plain template — nothing breaks, and
  nothing calls out to the network. A model string is intentionally not
  hardcoded as a default; put in whatever current model you intend to use.
- `DATABASE_URL`, `ACEAPT_INTERNAL_API_BASE_URL`, `ACEAPT_INTERNAL_API_KEY` —
  not read by any code here. They're placeholders for whatever your real
  `UpstreamEvidenceProvider` implementation ends up needing.

## Extending this

- **Tune the thresholds.** Every numeric cutoff in `diagnosisClassifiers.ts`
  and `actionCatalog.ts` (e.g. `WEAK_MASTERY_THRESHOLD`, benefit scores) is a
  named constant with a comment. They're principled starting points, not
  fitted to real outcome data yet — once `InterventionRecord` history
  accumulates in Feature 16, that's the data to tune them against (spec §41
  says this explicitly: don't trust the starting formula blindly).
- **Add a diagnosis category.** Add the literal to `DiagnosisCategory` in
  `types.ts`, write a classifier function matching the existing shape in
  `diagnosisClassifiers.ts`, register it in the `CLASSIFIERS` array, and add
  an entry to `PREFERRED_ACTIONS` in `actionCatalog.ts`.
- **Add an action type.** Add the literal to `ActionType`, add an entry to
  `ACTION_CATALOG`, and reference it from `PREFERRED_ACTIONS` and/or
  `ESCALATION_LADDER`.
- **Change the scoring formula.** It's isolated to `buildCandidate()` in
  `actionScoring.ts`. The four factors (expected benefit, diagnostic
  confidence, goal relevance, readiness impact) and the division by time
  cost are each independent — adjust or replace any one without touching the
  others.

## A note on the escalation ladder mapping

Spec §22's escalation example uses labels ("Hint", "Guided practice", "Deep
remediation", "Prerequisite investigation") that don't exactly match §13's
action catalog. `actionCatalog.ts` reconciles them with an explicit mapping,
called out there rather than silently guessed — worth a skim if the
escalation behavior doesn't match your mental model of it.
