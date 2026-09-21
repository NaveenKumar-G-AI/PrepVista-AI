import { AdaptationTrigger, CapabilityKey, LearningGoal, PathGraph, PathNodeState, Skill, StudentState } from "../types";
import { deriveTargetState } from "../engines/targetStateEngine";
import { computeGaps } from "../engines/gapEngine";
import { detectBottlenecks, derivePrimaryBottleneck } from "../engines/bottleneckEngine";
import { computePriorities } from "../engines/priorityEngine";
import { buildPath, classifyEvidenceStrength, completionStateFor, recordDecision, recordVersion, getDecisionLog } from "../engines/pathEngine";
import { eventBus } from "../events";

const RETAINED_STATES: PathNodeState[] = [PathNodeState.MASTERED, PathNodeState.TRANSFER_VERIFIED, PathNodeState.RETAINED, PathNodeState.READY];

export class PathfinderService {
  private paths = new Map<string, PathGraph>(); // keyed by studentId

  /** Section 8-18: goal -> target -> gap -> bottleneck -> priority -> path (v1). */
  planInitialPath(goal: LearningGoal, state: StudentState, skills: Skill[]) {
    const requirements = deriveTargetState(goal);
    const gaps = computeGaps(state, requirements);
    const bottlenecks = detectBottlenecks({ skills, state });
    const primaryBottleneck = derivePrimaryBottleneck(gaps, bottlenecks);
    const priorities = computePriorities(gaps, bottlenecks, goal);

    const graph = buildPath(goal.studentId, goal.goalId, priorities, state, 1);
    recordVersion(graph, "Initial path generated from goal and current evidence.");
    this.paths.set(goal.studentId, graph);

    eventBus.publish({ type: "PATH_CREATED", pathId: graph.pathId, version: graph.version, timestamp: new Date().toISOString() });

    return { graph, gaps, bottlenecks, primaryBottleneck, priorities };
  }

  getCurrentPath(studentId: string): PathGraph | undefined {
    return this.paths.get(studentId);
  }

  /** Section 38: "student completes action." Single place a node's state changes on completion. */
  completeNode(studentId: string, nodeId: string): void {
    const graph = this.paths.get(studentId);
    const node = graph?.nodes.find((n) => n.nodeId === nodeId);
    if (!graph || !node) throw new Error(`No path/node found for student=${studentId} node=${nodeId}`);

    node.state = completionStateFor(node.actionType);
    node.updatedAt = new Date().toISOString();
    graph.currentNodeId = graph.nodes.find((n) => n.state === PathNodeState.NOT_STARTED)?.nodeId ?? null;

    eventBus.publish({ type: "PATH_NODE_COMPLETED", nodeId, timestamp: new Date().toISOString() });
  }

  /**
   * Sections 23-26: the adaptation loop. New evidence arrives; evidence
   * strength (Section 24) decides whether to keep the path, adjust the
   * current node, or fully replan — and either way, the decision is logged.
   */
  ingestEvidence(
    goal: LearningGoal,
    previousState: StudentState,
    newState: StudentState,
    skills: Skill[],
    trigger: AdaptationTrigger
  ) {
    const existing = this.paths.get(goal.studentId);
    if (!existing) throw new Error("No existing path — call planInitialPath first.");

    const changedMetric = this.biggestCapabilityChange(previousState, newState);
    const stability = classifyEvidenceStrength(
      Math.abs(changedMetric.delta),
      newState.capabilities[changedMetric.key]?.confidence ?? 0.5,
      newState.capabilities[changedMetric.key]?.evidenceCount ?? 1
    );

    if (stability === "KEEP_PATH") {
      return {
        graph: existing,
        replanned: false,
        decisionReason: "Evidence is too limited to justify a change — keeping the current path stable (Section 24).",
        primaryBottleneck: undefined,
      };
    }

    const requirements = deriveTargetState(goal);
    const gaps = computeGaps(newState, requirements);
    const bottlenecks = detectBottlenecks({ skills, state: newState });
    const primaryBottleneck = derivePrimaryBottleneck(gaps, bottlenecks);
    const priorities = computePriorities(gaps, bottlenecks, goal);

    const newVersion = existing.version + 1;
    const newGraph = buildPath(goal.studentId, goal.goalId, priorities, newState, newVersion);

    // Carry forward completed work so a replan never erases progress (Section 25/34).
    const completedByLabel = new Map(
      existing.nodes.filter((n) => RETAINED_STATES.includes(n.state)).map((n) => [n.label, n.state] as const)
    );
    newGraph.nodes.forEach((n) => {
      const carried = completedByLabel.get(n.label);
      if (carried) n.state = carried;
    });
    newGraph.currentNodeId = newGraph.nodes.find((n) => n.state === PathNodeState.NOT_STARTED)?.nodeId ?? null;

    const direction = changedMetric.delta > 0 ? "improved" : "declined";
    const reasonForChange = `${changedMetric.key} ${direction} from ${changedMetric.from} to ${changedMetric.to}; ${
      changedMetric.delta > 0
        ? "re-prioritized toward the next largest gap"
        : "inserted repair work before continuing"
    }.`;

    recordVersion(newGraph, reasonForChange);
    this.paths.set(goal.studentId, newGraph);

    recordDecision({
      studentId: goal.studentId,
      previousPathVersion: existing.version,
      newPathVersion: newGraph.version,
      trigger,
      evidence: `${changedMetric.key}: ${changedMetric.from} -> ${changedMetric.to}`,
      confidence: newState.capabilities[changedMetric.key]?.confidence ?? 0.5,
      reason: reasonForChange,
      expectedOutcome: primaryBottleneck.reason,
    });

    eventBus.publish({
      type: "PATH_REPLANNED",
      pathId: newGraph.pathId,
      fromVersion: existing.version,
      toVersion: newGraph.version,
      timestamp: new Date().toISOString(),
    });

    return { graph: newGraph, replanned: true, decisionReason: reasonForChange, primaryBottleneck };
  }

  getDecisionLog(studentId: string) {
    return getDecisionLog(studentId);
  }

  private biggestCapabilityChange(prev: StudentState, next: StudentState) {
    let best = { key: "mastery" as CapabilityKey, from: 0, to: 0, delta: 0 };
    (Object.keys(next.capabilities) as CapabilityKey[]).forEach((key) => {
      const from = prev.capabilities[key]?.value ?? 0;
      const to = next.capabilities[key]?.value ?? 0;
      const delta = to - from;
      if (Math.abs(delta) > Math.abs(best.delta)) best = { key, from, to, delta };
    });
    return best;
  }
}
