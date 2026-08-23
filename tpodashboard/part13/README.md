# PrepVista AI — Part 13: Proactive Placement Intelligence

Reference implementation of the Continuous Placement Radar. Read
**`PART13_INTEGRATION.md`** first — it has the architecture diagram, the
wiring steps, and an honest section-by-section truth table of what's real
versus what's a documented extension point.

## Quick start (exploring this bundle standalone)

```bash
npm install -g typescript tsx   # if you don't already have them
tsc --noEmit -p tsconfig.json   # typecheck services/ modules/ jobs/ tests/
tsx --test tests/proactive/*.test.ts   # run the real test suite
```

## File tree

```
services/
  signals/        types.ts, registry.ts (26 signal types, 15 categories), repository.ts, audience.ts
  priority/       priorityEngine.ts        — deterministic, explainable scoring
  anomaly/        anomalyEngine.ts         — small-sample guard, baseline, z-score, trend
  dedup/          deduplicationEngine.ts   — the "never fan out" rule
  escalation/     escalationEngine.ts      — time-based severity ladder
  clustering/     signalClustering.ts      — groups correlated signals into one issue
  briefings/      briefingGenerator.ts     — daily / end-of-day / weekly / management

modules/proactive/
  detectorFramework.ts   — DataSourcePort, Detector, DetectorRegistry, commitCandidates()
  eventRouter.ts          — event -> only-relevant-detectors map
  detectors/
    pipeline.ts       — application, interview, offer, joining
    development.ts    — training, readiness
    institutional.ts  — recruiter relationship, data quality, management
    positive.ts        — the 3 "good news" detectors

api/proactive/           — Next.js App Router reference routes (TPO / Student / Management + actions)
jobs/scheduledJobs.ts     — escalation sweep, freshness sweep, briefing jobs, Part 9 seam
prisma/                   — reference schema
ui/                        — TPOAttentionCenter.tsx (flagship), StudentAttentionCenter.tsx, ManagementIntelligencePanel.tsx, theme.css
tests/proactive/          — 23 real tests, all passing
module.manifest.json      — section 82's manifest, populated from the actual code
```
