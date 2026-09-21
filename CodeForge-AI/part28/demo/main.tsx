import React from "react";
import { createRoot } from "react-dom/client";
import { GrowthDashboard } from "../src/components/growth/GrowthDashboard.tsx";
import { buildGrowthSnapshot } from "../src/lib/growth/engine/snapshot.ts";
import { generateInsightsForDimension, milestoneToInsight } from "../src/lib/growth/engine/insights.ts";
import { detectMilestones } from "../src/lib/growth/engine/milestones.ts";
import { byDimension } from "../src/lib/growth/utils.ts";
import type { GrowthEvidence, GrowthDimension } from "../src/lib/growth/types.ts";

const NOW = new Date();
let counter = 0;
function daysAgo(d: number) {
  return new Date(NOW.getTime() - d * 86400000).toISOString();
}
function e(partial: Partial<GrowthEvidence> & { dimension: GrowthDimension; occurredAt: string }): GrowthEvidence {
  counter += 1;
  return {
    evidenceId: `demo_${counter}`,
    studentId: "demo_student",
    sourceType: "correctness",
    sourceId: `src_${counter}`,
    outcome: "SUCCESS",
    sourceConfidence: 0.9,
    assistanceLevel: "NONE",
    difficulty: "MEDIUM",
    isTransfer: false,
    isRetentionCheck: false,
    challengeFamily: `fam_${counter}`,
    roleContext: null,
    recordedAt: partial.occurredAt,
    evidenceVersion: "demo@1",
    context: {},
    ...partial,
  };
}

// Debugging: was weak, now clearly improving with diverse recent success.
const debugging: GrowthEvidence[] = [
  e({ dimension: "debugging", occurredAt: daysAgo(90), outcome: "FAILURE", challengeFamily: "off-by-one" }),
  e({ dimension: "debugging", occurredAt: daysAgo(80), outcome: "FAILURE", challengeFamily: "null-ref" }),
  e({ dimension: "debugging", occurredAt: daysAgo(12), outcome: "SUCCESS", challengeFamily: "race-condition", assistanceLevel: "LOW" }),
  e({ dimension: "debugging", occurredAt: daysAgo(7), outcome: "SUCCESS", challengeFamily: "memory-leak", assistanceLevel: "NONE" }),
  e({ dimension: "debugging", occurredAt: daysAgo(2), outcome: "SUCCESS", challengeFamily: "deadlock", assistanceLevel: "NONE" }),
];

// Correctness: strong and sustained.
const correctness: GrowthEvidence[] = ["a", "b", "c", "d", "e", "f"].map((f, i) =>
  e({ dimension: "correctness", occurredAt: daysAgo(60 - i * 3), outcome: "SUCCESS", challengeFamily: f }),
);

// Complexity: stagnating — plenty of recent activity, outcome not moving.
const complexity: GrowthEvidence[] = [
  e({ dimension: "complexity_understanding", occurredAt: daysAgo(70), outcome: "PARTIAL", challengeFamily: "cx-a" }),
  e({ dimension: "complexity_understanding", occurredAt: daysAgo(60), outcome: "SUCCESS", challengeFamily: "cx-b" }),
  e({ dimension: "complexity_understanding", occurredAt: daysAgo(20), outcome: "PARTIAL", challengeFamily: "cx-c" }),
  e({ dimension: "complexity_understanding", occurredAt: daysAgo(16), outcome: "SUCCESS", challengeFamily: "cx-d" }),
  e({ dimension: "complexity_understanding", occurredAt: daysAgo(11), outcome: "PARTIAL", challengeFamily: "cx-e" }),
  e({ dimension: "complexity_understanding", occurredAt: daysAgo(6), outcome: "SUCCESS", challengeFamily: "cx-f" }),
  e({ dimension: "complexity_understanding", occurredAt: daysAgo(2), outcome: "PARTIAL", challengeFamily: "cx-g" }),
];

// Transfer: exactly one success so far — EMERGING, not overclaimed.
const transfer: GrowthEvidence[] = [e({ dimension: "transfer", occurredAt: daysAgo(1), outcome: "SUCCESS", isTransfer: true, challengeFamily: "t1" })];

const allEvidence = [...debugging, ...correctness, ...complexity, ...transfer];

const snapshot = buildGrowthSnapshot({
  snapshotId: "demo_snapshot",
  studentId: "demo_student",
  allEvidence,
  window: { preset: "ALL_TIME", startsAt: null, endsAt: NOW.toISOString() },
  roleProfile: null,
  studentModelVersion: "demo@1",
  skillModelVersion: "demo@1",
  now: NOW,
  previousDimensionStates: { debugging: "AT_RISK" },
});

const grouped = byDimension(allEvidence);
const milestones = Array.from(grouped.entries()).flatMap(([dim, ev]) => detectMilestones("demo_student", dim as GrowthDimension, ev));
const dimensionInsights = snapshot.dimensions.flatMap((d) => generateInsightsForDimension("demo_student", d, NOW));
const milestoneInsights = milestones.map((m) => milestoneToInsight("demo_student", m, NOW));
const insights = [...dimensionInsights, ...milestoneInsights];

const evidenceByDimension = Object.fromEntries(
  Array.from(grouped.entries()).map(([dim, ev]) => [dim, ev.slice(-8).map((x) => ({ evidenceId: x.evidenceId, outcome: x.outcome }))]),
);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GrowthDashboard snapshot={snapshot} insights={insights} milestones={milestones} evidenceByDimension={evidenceByDimension} />
  </React.StrictMode>,
);
