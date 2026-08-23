/**
 * PrepVista AI — Part 15
 * Runs the Section 90 "Final Demo Experience" walkthrough end-to-end against
 * the demo repository, printing real computed output (nothing here is
 * hand-typed) — Management dashboard -> TPO scenario question -> opportunity
 * intelligence -> company outreach -> accept a recommendation into an action
 * -> student view, plus a live proof of the student/institutional boundary.
 */

import { bootstrap } from "../index.js";
import { DATA_CUTOFF } from "../repository/demo/seed.js";
import { AuthorizationError } from "../rbac/access-control.js";
import { createForecastingTools } from "../modules/forecasting/ai-tools.js";
import { createStrategyTools } from "../modules/strategy/ai-tools.js";
import type { CallerContext } from "../types/placement-strategy.types.js";

function section(title: string) {
  console.log(`\n${"─".repeat(70)}\n${title}\n${"─".repeat(70)}`);
}

async function main() {
  const { repo, services, aiTools, actionAdapter } = bootstrap();
  const asOf = DATA_CUTOFF;
  const management: CallerContext = { role: "MANAGEMENT", userId: "mgmt-1", institutionId: repo.getInstitutionId() };
  const tpo: CallerContext = { role: "TPO", userId: "tpo-1", institutionId: repo.getInstitutionId() };

  section("MANAGEMENT OPENS: Placement Strategy");
  const forecast = await services.forecast.getPlacementForecast(asOf);
  const targetGap = await services.target.getTargetGapSummary(asOf);
  console.log(`CURRENT       ${targetGap!.current}%`);
  console.log(`TARGET        ${targetGap!.target}%`);
  console.log(`FORECAST      ${forecast.range!.low}–${forecast.range!.high}%  (point estimate ${forecast.pointEstimate}%)`);
  console.log(`CONFIDENCE    ${forecast.confidence}`);
  console.log(`GAP           ${targetGap!.gapPoints} points  (${targetGap!.requiredAdditionalPlacements} additional verified placements needed)`);
  console.log(`DATA THROUGH  ${forecast.dataThrough}  [${forecast.freshness}]`);
  console.log(`MODEL         ${forecast.modelVersion}  (baseline=${forecast.method === "BLENDED" ? "historical uplift + pipeline-weighted, blended" : forecast.method})`);

  section("Largest observed gaps");
  const gapExplanation = await services.gapAnalysis.explainGap(asOf);
  const rankedContributions = [...gapExplanation!.stageContributions].sort(
    (a, b) => Math.abs(b.observedContributionStudents) - Math.abs(a.observedContributionStudents)
  );
  for (const c of rankedContributions) {
    console.log(
      `  ${c.stage.padEnd(22)} observed ${(c.observedRate * 100).toFixed(0)}%  vs benchmark ${(c.benchmarkRate * 100).toFixed(0)}%  → ~${c.observedContributionStudents} students  [${c.label}]`
    );
  }
  console.log(`  Note: ${gapExplanation!.note}`);

  section('MANAGEMENT ASKS (via the same AI tool Part 12 would call): "Which departments require leadership attention?"');
  const departmentForecastTool = createForecastingTools(repo, services.forecastPerformance).find((t) => t.name === "get_department_forecast")!;
  const departments = await repo.getDepartments();
  for (const dept of departments) {
    const f = await departmentForecastTool.handler({ departmentId: dept.id, asOf }, management);
    if (!f.dataAvailable) {
      console.log(`  ${dept.name.padEnd(42)} — ${f.reason}`);
    } else {
      console.log(`  ${dept.name.padEnd(42)} forecast ${f.range!.low}–${f.range!.high}%  confidence ${f.confidence}`);
    }
  }

  section('TPO ASKS: "What if application conversion increases by 5% and joining conversion by 3 points?"');
  const scenario = await services.scenario.runScenario(asOf, {
    label: "Application +5, Joining +3",
    applicationConversionDelta: 5,
    joiningConversionDelta: 3,
  });
  console.log(`  Scenario estimate: ${scenario.projectedRange.low}–${scenario.projectedRange.high}%  (baseline was ${scenario.baselinePointEstimate}%)`);
  console.log(`  ${scenario.caveat}`);

  section('TPO ASKS: "What is the highest-impact opportunity right now?"');
  const coverage = await services.opportunityCoverage.getCoverage(asOf);
  console.log(`  ${coverage.readyStudents} placement-ready students currently.`);
  console.log(`  ${coverage.matchedToActiveOpportunity} matched to an active opportunity.`);
  console.log(`  ${coverage.unmatched} have NO currently matching active opportunity.`);
  const allRecs = await services.recommendations.getRecommendations(asOf, 8);
  console.log(`  All ${allRecs.length} ranked recommendations this run generated:`);
  for (const r of allRecs) console.log(`    [priority ${r.priorityScore}] ${r.issue} — ${r.affectedStudents} students affected`);
  const recs = allRecs.slice(0, 3);

  section('TPO ASKS: "Which companies should we approach?"');
  const outreach = await services.outreachPriority.getOutreachPriorities(asOf);
  for (const o of outreach.slice(0, 5)) {
    console.log(`  ${o.priority.padEnd(6)} ${o.companyName.padEnd(24)} score ${o.score}  — ${o.evidence[0]}`);
  }
  console.log(`  ${outreach[0]?.disclaimer ?? ""}`);

  section("TPO selects an action — Part 14 handles confirmation and execution from here");
  const topRec = recs[0]!;
  const proposed = await services.roadmap.acceptRecommendation(topRec, tpo);
  console.log(`  Proposed action ${proposed.actionId} for recommendation: "${topRec.issue}"`);
  console.log(`  Proposals pending Part 14 confirmation: ${actionAdapter.getProposals().length}`);

  section("STUDENT VIEW — personal outlook only, no institutional strategy");
  const students = await repo.getStudents(asOf);
  const sampleStudent = students.find((s) => s.status !== "PLACED")!;
  const studentCaller: CallerContext = { role: "STUDENT", userId: "student-1", institutionId: repo.getInstitutionId(), studentId: sampleStudent.id };
  const strategyTools = createStrategyTools(repo);
  const personalOutlookTool = strategyTools.find((t) => t.name === "get_personal_outlook")!;
  const outlook = await personalOutlookTool.handler({ studentId: sampleStudent.id, asOf }, studentCaller);
  console.log(`  ${JSON.stringify(outlook, null, 2).split("\n").join("\n  ")}`);

  section("STUDENT tries to ask an institutional question — blocked, as required");
  try {
    const placementForecastTool = createForecastingTools(repo, services.forecastPerformance).find((t) => t.name === "get_placement_forecast")!;
    await placementForecastTool.handler({ asOf }, studentCaller);
    console.log("  ERROR: this line should never print — student access was not blocked.");
  } catch (err) {
    console.log(`  Blocked as expected (${err instanceof AuthorizationError ? "AuthorizationError" : "unexpected error type"}): ${(err as Error).message}`);
  }

  section("Registered AI tool surface (Part 12 integration point)");
  console.log(`  ${aiTools.length} tools registered: ${aiTools.map((t) => t.name).join(", ")}`);

  console.log("\nNo fake forecast. No fake scenario. No recruiter login. No unsupported certainty.\nDemo complete.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
