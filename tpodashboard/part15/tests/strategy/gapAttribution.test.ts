import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoPlacementDataRepository } from "../../repository/demo/DemoPlacementDataRepository.js";
import { GapAnalysisService, BENCHMARK_EVENTUAL_JOIN_RATE } from "../../services/strategy/GapAnalysisService.js";
import { buildRemainingPoolBuckets, DATA_CUTOFF } from "../../repository/demo/seed.js";

test("every stage-contribution label is 'Observed contribution area', never phrased as causal", async () => {
  const repo = new DemoPlacementDataRepository();
  const explanation = await new GapAnalysisService(repo).explainGap(DATA_CUTOFF);
  assert.ok(explanation);
  for (const c of explanation!.stageContributions) {
    assert.equal(c.label, "Observed contribution area");
  }
});

test("stage contributions cover four distinct, non-overlapping stages — no stage appears twice", async () => {
  const repo = new DemoPlacementDataRepository();
  const explanation = await new GapAnalysisService(repo).explainGap(DATA_CUTOFF);
  assert.ok(explanation);
  const stages = explanation!.stageContributions.map((c) => c.stage);
  assert.equal(new Set(stages).size, stages.length, "no stage should be double-counted by appearing more than once");
  assert.equal(stages.length, 4);
});

test("stage contributions independently recompute to the same numbers the seed data implies (no hidden fudging)", async () => {
  const repo = new DemoPlacementDataRepository();
  const explanation = await new GapAnalysisService(repo).explainGap(DATA_CUTOFF);
  assert.ok(explanation);

  const buckets = buildRemainingPoolBuckets();
  const expectedByBucketStatus = new Map(buckets.map((b) => [b.status, b.count * (BENCHMARK_EVENTUAL_JOIN_RATE[b.status] - b.historicalEventualJoinRate)]));

  const STAGE_TO_BUCKET: Record<string, string> = {
    APPLICATION_CONVERSION: "NO_ACTIVE_APPLICATION",
    INTERVIEW_CONVERSION: "APPLIED_AWAITING_INTERVIEW",
    OFFER_ACCEPTANCE: "IN_INTERVIEW_STAGE",
    JOINING_CONVERSION: "OFFER_ACCEPTED_AWAITING_JOIN",
  };

  for (const c of explanation!.stageContributions) {
    const expected = expectedByBucketStatus.get(STAGE_TO_BUCKET[c.stage] as any)!;
    assert.ok(Math.abs(c.observedContributionStudents - expected) < 0.15, `${c.stage}: expected ~${expected}, got ${c.observedContributionStudents}`);
  }
});

test("because buckets are mutually exclusive, contributions sum exactly to (benchmark-projected minus historical-projected) additional placements — the only remaining residual is against the TARGET gap, and it is surfaced, not hidden", async () => {
  const repo = new DemoPlacementDataRepository();
  const explanation = await new GapAnalysisService(repo).explainGap(DATA_CUTOFF);
  assert.ok(explanation);

  const sumOfContributions = explanation!.stageContributions.reduce((s, c) => s + c.observedContributionStudents, 0);
  const buckets = buildRemainingPoolBuckets();
  const historicalProjected = buckets.reduce((s, b) => s + b.count * b.historicalEventualJoinRate, 0);
  const benchmarkProjected = buckets.reduce((s, b) => s + b.count * BENCHMARK_EVENTUAL_JOIN_RATE[b.status], 0);
  assert.ok(Math.abs(sumOfContributions - (benchmarkProjected - historicalProjected)) < 0.5);

  // The residual field must equal requiredAdditionalPlacements minus (historicalProjected + sumOfContributions),
  // i.e. it is DEFINED as "gap still remaining after every stage hits benchmark" — never silently zeroed.
  const expectedResidual = explanation!.gapSummary.requiredAdditionalPlacements - (historicalProjected + sumOfContributions);
  assert.ok(Math.abs(explanation!.unattributedResidualStudents - expectedResidual) < 0.6);
  assert.equal(typeof explanation!.note, "string");
  assert.ok(explanation!.note.length > 0);
});
