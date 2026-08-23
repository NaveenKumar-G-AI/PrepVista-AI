/**
 * PrepVista AI — Part 15
 * RoadmapService — Section 43/44. Buckets ranked recommendations into a
 * week-by-week plan and proposes them as actions through an
 * ActionSystemAdapter — the integration seam for the real Part 14 task
 * system. Part 15 only PROPOSES; it never confirms or executes anything
 * itself (Section 83 — "Part 15 does not bypass Part 14").
 */

import type { CallerContext, StrategicRecommendation } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { RecommendationEngine } from "./RecommendationEngine.js";
import { emitEvent } from "../../events/event-bus.js";
import { auditLog } from "../../audit/audit-log.js";
import { assertTpoAccess } from "../../rbac/access-control.js";

export interface RoadmapWeek {
  weekLabel: string;
  recommendations: StrategicRecommendation[];
}

export interface StrategicRoadmap {
  generatedAt: string;
  weeks: RoadmapWeek[];
  backlog: StrategicRecommendation[];
}

/**
 * Integration seam for Part 14. Replace DemoActionSystemAdapter with an
 * adapter that calls your real task-creation API. `proposeAction` must only
 * create a PENDING proposal — actual confirmation/execution belongs to
 * Part 14, not here.
 */
export interface ActionSystemAdapter {
  proposeAction(recommendation: StrategicRecommendation, caller: CallerContext): Promise<{ actionId: string }>;
}

export class DemoActionSystemAdapter implements ActionSystemAdapter {
  private counter = 0;
  private proposals: { actionId: string; recommendationId: string; status: "PENDING_TPO_CONFIRMATION" }[] = [];

  async proposeAction(recommendation: StrategicRecommendation, caller: CallerContext): Promise<{ actionId: string }> {
    const actionId = `action-${++this.counter}`;
    this.proposals.push({ actionId, recommendationId: recommendation.id, status: "PENDING_TPO_CONFIRMATION" });
    emitEvent("STRATEGIC_ACTION_CREATED", { actionId, recommendationId: recommendation.id, proposedBy: caller.userId });
    auditLog.record(caller, "PROPOSE_STRATEGIC_ACTION", "recommendation", recommendation.id, { actionId, issue: recommendation.issue });
    return { actionId };
  }

  getProposals() {
    return this.proposals;
  }
}

export class RoadmapService {
  private readonly recommendationEngine: RecommendationEngine;

  constructor(private readonly repo: PlacementDataRepository, private readonly actionAdapter: ActionSystemAdapter = new DemoActionSystemAdapter()) {
    this.recommendationEngine = new RecommendationEngine(repo);
  }

  async buildRoadmap(asOf: string, now: Date = new Date()): Promise<StrategicRoadmap> {
    const recommendations = await this.recommendationEngine.getRecommendations(asOf, 8);
    const weekLabels = ["Week 1", "Week 2", "Week 3", "Week 4"];
    const weeks: RoadmapWeek[] = weekLabels.map((weekLabel, i) => ({ weekLabel, recommendations: recommendations[i] ? [recommendations[i]!] : [] }));
    const backlog = recommendations.slice(weekLabels.length);
    return { generatedAt: now.toISOString(), weeks, backlog };
  }

  /** TPO turns a recommendation into a proposed action — Part 14 handles confirmation/execution from here. */
  async acceptRecommendation(recommendation: StrategicRecommendation, caller: CallerContext): Promise<{ actionId: string }> {
    assertTpoAccess(caller);
    return this.actionAdapter.proposeAction(recommendation, caller);
  }
}
