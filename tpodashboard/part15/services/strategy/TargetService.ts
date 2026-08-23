/**
 * PrepVista AI — Part 15
 * Target vs actual tracking (Section 12/13). Reads the active target and the
 * current verified-placement state and computes the point-in-time gap.
 */

import type { PlacementTarget, TargetGapSummary } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { emitEvent } from "../../events/event-bus.js";
import { round1 } from "../forecast/stats.js";

const TARGET_GAP_ALERT_THRESHOLD_POINTS = 3; // emits TARGET_GAP_DETECTED when gap exceeds this

export class TargetService {
  constructor(private readonly repo: PlacementDataRepository) {}

  async getActivePlacementTarget(seasonId: string): Promise<PlacementTarget | null> {
    return this.repo.getActiveTarget(seasonId, "PLACEMENT_PCT");
  }

  async getTargetGapSummary(asOf: string): Promise<TargetGapSummary | null> {
    const seasonId = await this.repo.getCurrentSeasonId();
    const [target, snapshot] = await Promise.all([this.getActivePlacementTarget(seasonId), this.repo.getCurrentSeasonSnapshot(asOf)]);
    if (!target) return null;

    const current = round1((snapshot.verifiedPlacements / snapshot.totalEligibleStudents) * 100);
    const gapPoints = round1(target.targetValue - current);
    const requiredAdditionalPlacements = Math.max(
      0,
      Math.ceil((target.targetValue / 100) * snapshot.totalEligibleStudents - snapshot.verifiedPlacements)
    );

    const summary: TargetGapSummary = {
      target: target.targetValue,
      current,
      gapPoints,
      requiredAdditionalPlacements,
      totalEligibleStudents: snapshot.totalEligibleStudents,
      asOf,
    };

    if (gapPoints > TARGET_GAP_ALERT_THRESHOLD_POINTS) {
      emitEvent("TARGET_GAP_DETECTED", { gapPoints, requiredAdditionalPlacements, asOf });
    }

    return summary;
  }
}
