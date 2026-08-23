/**
 * PrepVista AI — Part 15
 *
 * ScenarioService — Section 37-40 (What-If Placement Simulator).
 *
 * SCENARIO SAFETY (Section 40) is enforced structurally, not just by
 * convention: `PlacementDataRepository` has no write methods at all — it is
 * a read-only interface. This service cannot mutate live data even by
 * accident, because there is nothing mutable to call. Every number below is
 * computed from a fresh read and returned; nothing is written back.
 *
 * Scenario deltas reuse the same bucket <-> funnel-stage mapping as
 * GapAnalysisService (intentionally duplicated rather than imported — these
 * two services own separate merge paths per Section 87 and shouldn't need to
 * change together).
 */

import type { EngagementStatus, ForecastRange, ScenarioComparison, ScenarioInput, ScenarioResult } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { ForecastService } from "../forecast/ForecastService.js";
import { clamp, round1 } from "../forecast/stats.js";
import { emitEvent } from "../../events/event-bus.js";

const STAGE_DELTA_TO_BUCKET: { key: keyof ScenarioInput; bucket: EngagementStatus }[] = [
  { key: "applicationConversionDelta", bucket: "NO_ACTIVE_APPLICATION" },
  { key: "interviewConversionDelta", bucket: "APPLIED_AWAITING_INTERVIEW" },
  { key: "offerAcceptanceDelta", bucket: "IN_INTERVIEW_STAGE" },
  { key: "joiningConversionDelta", bucket: "OFFER_ACCEPTED_AWAITING_JOIN" },
];

// Coarse, clearly-labeled assumption for translating "N additional drives" into
// projected placements — shown in every scenario's `assumptions`/`caveat` so
// it's never silently baked in.
const ASSUMED_AVG_SEATS_PER_NEW_DRIVE = 35;
const ASSUMED_MATCH_RATE_FOR_NEW_DRIVES = 0.55; // fraction of seats likely filled by currently-unmatched ready students

export class ScenarioService {
  private readonly forecastService: ForecastService;
  private archived = new Set<string>();
  private idCounter = 0;

  constructor(private readonly repo: PlacementDataRepository) {
    this.forecastService = new ForecastService(repo);
  }

  async runScenario(asOf: string, input: ScenarioInput, now: Date = new Date()): Promise<ScenarioResult> {
    const scenarioId = `scenario-${++this.idCounter}`;
    emitEvent("SCENARIO_CREATED", { scenarioId, label: input.label });

    const [snapshot, baseline] = await Promise.all([this.repo.getCurrentSeasonSnapshot(asOf), this.forecastService.getPlacementForecast(asOf, now)]);

    // Deep-clone the remaining pool so nothing here can accidentally share a
    // reference with (and thus mutate) whatever the repository returned.
    const simulatedBuckets = snapshot.remainingPool.map((b) => ({ ...b }));

    for (const { key, bucket } of STAGE_DELTA_TO_BUCKET) {
      const deltaPoints = input[key];
      if (typeof deltaPoints !== "number" || deltaPoints === 0) continue;
      const target = simulatedBuckets.find((b) => b.status === bucket);
      if (!target) continue;
      target.historicalEventualJoinRate = clamp(target.historicalEventualJoinRate + deltaPoints / 100, 0, 1);
    }

    let additionalFromScenario = simulatedBuckets.reduce((sum, b) => sum + b.count * b.historicalEventualJoinRate, 0);

    let driveNote = "";
    if (input.additionalDrives && input.additionalDrives > 0) {
      const driveSeats = input.additionalDrives * ASSUMED_AVG_SEATS_PER_NEW_DRIVE;
      const fromDrives = driveSeats * ASSUMED_MATCH_RATE_FOR_NEW_DRIVES;
      additionalFromScenario += fromDrives;
      driveNote = ` Assumes ~${ASSUMED_AVG_SEATS_PER_NEW_DRIVE} seats/drive and a ${round1(ASSUMED_MATCH_RATE_FOR_NEW_DRIVES * 100)}% fill rate from currently-unmatched ready students (~${round1(fromDrives)} additional placements from ${input.additionalDrives} drive(s)).`;
    }

    const projectedJoined = snapshot.verifiedPlacements + additionalFromScenario;
    const projectedPct = round1((projectedJoined / snapshot.totalEligibleStudents) * 100);

    // Scenario uncertainty is deliberately wider than the baseline forecast's —
    // it's a hypothetical, not an observed trajectory.
    const baselineRange = baseline.range ?? { low: projectedPct - 2, high: projectedPct + 2 };
    const baselineMargin = (baselineRange.high - baselineRange.low) / 2;
    const scenarioMargin = round1(baselineMargin * 1.4 + 0.5);
    const range: ForecastRange = { low: round1(projectedPct - scenarioMargin), high: round1(projectedPct + scenarioMargin) };

    const baselinePoint = baseline.pointEstimate ?? projectedPct;
    const result: ScenarioResult = {
      type: "scenario_estimate",
      label: input.label,
      assumptions: input,
      baselinePointEstimate: baselinePoint,
      projectedRange: range,
      deltaFromBaseline: { low: round1(range.low - baselinePoint), high: round1(range.high - baselinePoint) },
      confidence: baseline.confidence === "HIGH" ? "MEDIUM" : "LOW", // never more confident than the forecast it's built on
      generatedAt: now.toISOString(),
      caveat:
        `Scenario estimate, not a guarantee. Assumes the stated rate changes apply only to the current remaining pool and hold steady through season end; does not model second-order effects (e.g. one improvement changing behavior elsewhere in the funnel).${driveNote}`,
    };

    emitEvent("SCENARIO_RUN", { scenarioId, label: input.label, projectedRange: range });
    return result;
  }

  async compareScenarios(asOf: string, inputs: ScenarioInput[], now: Date = new Date()): Promise<ScenarioComparison> {
    const [snapshot, baseline] = await Promise.all([this.repo.getCurrentSeasonSnapshot(asOf), this.forecastService.getPlacementForecast(asOf, now)]);
    const current = {
      pointEstimate: baseline.pointEstimate ?? round1((snapshot.verifiedPlacements / snapshot.totalEligibleStudents) * 100),
      range: baseline.range ?? { low: 0, high: 100 },
    };
    const scenarios = await Promise.all(inputs.map((input) => this.runScenario(asOf, input, now)));
    return { current, scenarios };
  }

  archiveScenario(scenarioId: string): void {
    this.archived.add(scenarioId);
    emitEvent("SCENARIO_ARCHIVED", { scenarioId });
  }

  isArchived(scenarioId: string): boolean {
    return this.archived.has(scenarioId);
  }
}
