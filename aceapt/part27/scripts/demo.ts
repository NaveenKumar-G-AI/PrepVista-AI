/**
 * Runs the exact loop described in spec section 66:
 *   open student -> readiness/target/profile/trajectory -> AT RISK -> WHY? ->
 *   FIX MY READINESS -> student completes it -> new evidence -> reforecast
 *
 * Every number below comes from the real engines running over the seeded
 * fixture evidence in src/integration/devFixtures.ts — nothing here is a
 * hardcoded string standing in for the pipeline (section 64).
 *
 * Run with: npm run seed:demo
 */
import { cohortMembership, deps, gateway } from "../src/api/deps.js";
import { DEMO_COHORT_ID, DEMO_STUDENT_ID, seedDemoFixtures } from "../src/integration/devFixtures.js";
import { fixMyReadiness, runForecastPipeline, type ForecastPipelineResult } from "../src/services/forecastOrchestrator.js";
import { getCohortForecast } from "../src/services/cohortForecastService.js";
import { forecastRangeToBand, runPresetScenarios } from "../src/engines/scenarioEngine.js";
import { humanizeReadinessState } from "../src/engines/readinessStateMachine.js";
import { formatPercent, formatRange } from "../src/utils/format.js";

function section(title: string): void {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function printPipeline(p: ForecastPipelineResult): void {
  console.log(
    `Readiness: ${formatPercent(p.currentOverall)}   Target: ${p.target ? formatPercent(p.target.overallTarget) : "not set"}   Status: ${humanizeReadinessState(p.status)}`,
  );
  if (p.forecast) {
    console.log(
      `Projected range: ${formatRange(p.forecast.projectedRange)}   Confidence: ${p.forecast.confidence.level}   Days remaining: ${p.forecast.daysRemaining ?? "n/a"}`,
    );
  }

  console.log("\nCapability profile:");
  for (const dim of Object.values(p.capability.dimensions)) {
    if (!dim) continue;
    console.log(`  ${dim.key.padEnd(12)} ${String(dim.value).padStart(3)}%   ${dim.label}`);
  }

  console.log(`\nOverall trajectory: ${p.overallTrend.trend} (momentum: ${p.momentum})`);
  console.log(`  ${p.overallTrend.explanation}`);

  if (p.risks.length > 0) {
    console.log("\nTop risks:");
    for (const r of p.risks.slice(0, 3)) console.log(`  - [${r.type}] ${r.explanation}`);
  }
  if (p.practiceAssessmentGap) console.log(`\nPractice vs. assessment: ${p.practiceAssessmentGap.explanation}`);
  if (p.familiarityGap) console.log(`Familiarity vs. novel: ${p.familiarityGap.explanation}`);
  if (p.failureBoundary) console.log(`Failure boundary: ${p.failureBoundary.explanation}`);
}

/** Stands in for "the student completed the generated plan and new evidence
 * came in." In production this arrives via real ASSESSMENT_COMPLETED events
 * from the assessment/attempt-tracking systems — never written directly like
 * this outside of a demo/test context. */
function simulateInterventionCompleted(pipeline: ForecastPipelineResult): void {
  const focus = pipeline.mainFactor;
  if (focus) {
    const current = pipeline.capability.dimensions[focus]?.value ?? 60;
    gateway.addObservation(DEMO_STUDENT_ID, focus, { date: new Date().toISOString(), value: Math.min(100, current + 6) });
  }
  gateway.addObservation(DEMO_STUDENT_ID, "overall", {
    date: new Date().toISOString(),
    value: Math.min(100, pipeline.currentOverall + 3),
  });
  console.log(`Simulated: the student completed the plan; ${focus ?? "overall readiness"} improved as a result.`);
}

async function main(): Promise<void> {
  seedDemoFixtures(gateway, cohortMembership);

  section("STEP 1-4 — Open a realistic student");
  let pipeline = await runForecastPipeline(DEMO_STUDENT_ID, deps);
  printPipeline(pipeline);

  section("STEP 5 — WHY?");
  console.log(pipeline.whyNarrative);
  console.log(`\nReadiness roadmap: ${pipeline.roadmap.join(" -> ")}`);

  section('STEP 6 — "FIX MY READINESS" (hands the top gap to Feature 26)');
  const { plan } = await fixMyReadiness(DEMO_STUDENT_ID, deps);
  console.log(`Focus dimension: ${plan.focusDimension}`);
  for (const step of plan.steps) console.log(`  - ${step.title} (${step.minutes} min)`);
  console.log(`  Total: ${plan.totalMinutes} min`);

  section("STEP 7-8 — Student completes it; new evidence enters the system");
  simulateInterventionCompleted(pipeline);

  section("STEP 9-10 — Forecast recalculates");
  const before = pipeline;
  pipeline = await runForecastPipeline(DEMO_STUDENT_ID, deps);
  printPipeline(pipeline);
  console.log(`\nReadiness moved: ${formatPercent(before.currentOverall)} -> ${formatPercent(pipeline.currentOverall)}`);
  console.log(
    pipeline.transition.changed
      ? `Status transition: ${pipeline.transition.explanation}`
      : `Status unchanged: still "${humanizeReadinessState(pipeline.status)}" — one round of practice rarely flips the status outright, and it shouldn't (that would be fake precision, not a real signal).`,
  );

  section('BONUS — "What if?" scenarios');
  if (pipeline.forecast && pipeline.target) {
    const weeksRemaining = pipeline.forecast.daysRemaining != null ? Math.max(pipeline.forecast.daysRemaining, 0) / 7 : 3;
    const mid = (pipeline.forecast.projectedRange.low + pipeline.forecast.projectedRange.high) / 2;
    const scenarios = runPresetScenarios(
      {
        current: pipeline.currentOverall,
        observedSlopePerWeek: pipeline.overallTrend.slopePerWeek ?? 0,
        weeksRemaining,
        baseConfidence: pipeline.forecast.confidence.level,
        baseBand: forecastRangeToBand(pipeline.forecast.projectedRange, mid),
      },
      pipeline.mainFactor,
    );
    for (const s of scenarios) {
      console.log(`  ${s.label.padEnd(28)} -> ${formatRange(s.projectedRange)}  (confidence: ${s.confidence})`);
    }
    console.log(`  (${scenarios[0]?.disclaimer})`);
  }

  section("BONUS — Institutional / TPO cohort view");
  const cohort = await getCohortForecast(DEMO_COHORT_ID, cohortMembership.get(DEMO_COHORT_ID) ?? [], deps);
  console.log(`Cohort: ${cohort.cohortId} (${cohort.studentCount} students)`);
  console.log("Readiness buckets:");
  for (const b of cohort.readinessBuckets) console.log(`  ${humanizeReadinessState(b.status).padEnd(18)} ${b.count} (${b.percentage}%)`);
  console.log("Top risks:");
  for (const r of cohort.topRisks) console.log(`  ${r.label.padEnd(28)} ${r.studentCount} students (${r.percentage}%)`);

  console.log("\nDone — this is the closed loop from spec section 34, computed end to end.\n");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
