import {
  ActionType,
  PathDecision,
  PathEdge,
  PathGraph,
  PathNode,
  PathNodeState,
  PathVersion,
  PriorityItem,
  StabilityTier,
  StudentState,
} from "../types";

let nodeCounter = 0;
let decisionCounter = 0;
function nextId(prefix: string): string {
  if (prefix === "decision") {
    decisionCounter += 1;
    return `${prefix}-${decisionCounter}`;
  }
  nodeCounter += 1;
  return `${prefix}-${nodeCounter}`;
}

// ---------------------------------------------------------------------------
// Gates (Sections 19-22) — completing content is not the same as advancing.
// ---------------------------------------------------------------------------

export function transferGateRequired(mastery: number | null, transfer: number | null): boolean {
  return mastery !== null && transfer !== null && mastery >= 80 && transfer < 70;
}

export function retentionGateRequired(mastery: number | null, retention: number | null): boolean {
  return mastery !== null && retention !== null && mastery >= 80 && retention < 65;
}

export function timedGateRequired(untimed: number | null, timed: number | null): boolean {
  return untimed !== null && timed !== null && untimed >= 80 && timed < 70;
}

// ---------------------------------------------------------------------------
// Node construction
// ---------------------------------------------------------------------------

function makeNode(
  actionType: ActionType,
  skillId: string,
  label: string,
  reason: string,
  minutes: number,
  prerequisites: string[] = []
): PathNode {
  const now = new Date().toISOString();
  return {
    nodeId: nextId("node"),
    skillId,
    actionType,
    label,
    state: PathNodeState.NOT_STARTED,
    prerequisites,
    successCriteria: `Demonstrate ${label.toLowerCase()} at target threshold`,
    estimatedDurationMinutes: minutes,
    evidenceRequirements: [`${actionType}_COMPLETION`],
    reason,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Builds an ordered path from the current top priority. This is
 * deliberately a small, explainable template set (Section 55: build one
 * vertical slice, not every future capability) rather than a general
 * curriculum planner — see README for what a full planner would add.
 */
export function buildPath(
  studentId: string,
  goalId: string,
  priorities: PriorityItem[],
  state: StudentState,
  version: number
): PathGraph {
  const top = priorities[0];
  const nodes: PathNode[] = [];

  if (top?.skillId) {
    const skillState = state.skills[top.skillId];
    const mastery = skillState?.mastery.value ?? null;
    const transfer = skillState?.transfer.value ?? null;
    const timed = skillState?.timedAccuracy.value ?? null;

    if (mastery !== null && mastery < 75) {
      nodes.push(
        makeNode(
          ActionType.PRACTICE,
          top.skillId,
          `${top.label} — Focused Practice`,
          `Mastery itself is still below target (${mastery}%), so foundational practice comes before transfer or timed drills would help.`,
          10
        )
      );
    }

    if (transferGateRequired(mastery, transfer)) {
      nodes.push(
        makeNode(
          ActionType.TRANSFER_DRILL,
          top.skillId,
          `${top.label} — Transfer Repair`,
          `Your ${top.label.toLowerCase()} accuracy is strong in familiar practice but drops in novel-context questions. Transfer needs direct repair before harder drills will stick.`,
          10,
          nodes.length ? [nodes[nodes.length - 1].nodeId] : []
        )
      );
    }

    if (timedGateRequired(transfer ?? mastery, timed)) {
      nodes.push(
        makeNode(
          ActionType.TIMED_DRILL,
          top.skillId,
          `${top.label} — Timed Application`,
          "Untimed performance is ahead of timed performance, so the gap is speed and execution under pressure, not concept understanding.",
          8,
          nodes.length ? [nodes[nodes.length - 1].nodeId] : []
        )
      );
    }

    nodes.push(
      makeNode(
        ActionType.MIXED_PRACTICE,
        top.skillId,
        `${top.label} — Mixed Questions`,
        "Interleaving this skill with others checks that the gains above generalize instead of only showing up in isolated drills.",
        8,
        nodes.length ? [nodes[nodes.length - 1].nodeId] : []
      )
    );

    nodes.push(
      makeNode(
        ActionType.SIMULATION,
        top.skillId,
        `${top.label} — Simulation`,
        "A short simulated set under real conditions is the closest proxy for assessment-day performance.",
        15,
        [nodes[nodes.length - 1].nodeId]
      )
    );

    nodes.push(
      makeNode(
        ActionType.VERIFICATION,
        top.skillId,
        `${top.label} — Readiness Verification`,
        "Confirms the gains above are stable before moving on to the next priority.",
        5,
        [nodes[nodes.length - 1].nodeId]
      )
    );
  }

  const edges: PathEdge[] = nodes.flatMap((n) => n.prerequisites.map((p) => ({ fromNodeId: p, toNodeId: n.nodeId })));

  return {
    pathId: `path-${studentId}-${goalId}`,
    studentId,
    goalId,
    version,
    nodes,
    edges,
    currentNodeId: nodes[0]?.nodeId ?? null,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Completion (Section 18) — what "done" means depends on what kind of
// action it was; a completed PRACTICE node and a completed TRANSFER_DRILL
// node shouldn't collapse into the same generic DONE state.
// ---------------------------------------------------------------------------

const ACTION_COMPLETION_STATE: Record<ActionType, PathNodeState> = {
  [ActionType.RECALL]: PathNodeState.RETAINED,
  [ActionType.LEARN]: PathNodeState.MASTERED,
  [ActionType.PRACTICE]: PathNodeState.MASTERED,
  [ActionType.TRANSFER_DRILL]: PathNodeState.TRANSFER_VERIFIED,
  [ActionType.TIMED_DRILL]: PathNodeState.READY,
  [ActionType.QUESTION_SELECTION]: PathNodeState.READY,
  [ActionType.MIXED_PRACTICE]: PathNodeState.READY,
  [ActionType.SIMULATION]: PathNodeState.READY,
  [ActionType.REACTIVATION]: PathNodeState.RETAINED,
  [ActionType.VERIFICATION]: PathNodeState.READY,
  [ActionType.MAINTENANCE_CHECK]: PathNodeState.MAINTENANCE,
};

export function completionStateFor(actionType: ActionType): PathNodeState {
  return ACTION_COMPLETION_STATE[actionType] ?? PathNodeState.MASTERED;
}

// ---------------------------------------------------------------------------
// Stability (Section 24) — don't replan because of one wrong answer.
// ---------------------------------------------------------------------------

export function classifyEvidenceStrength(deltaMagnitude: number, confidence: number, evidenceCount: number): StabilityTier {
  const strength = deltaMagnitude * confidence * Math.min(1, evidenceCount / 3);
  if (strength < 4) return "KEEP_PATH";
  if (strength < 10) return "ADJUST_NODE";
  return "REPLAN";
}

// ---------------------------------------------------------------------------
// Versioning + decision log (Sections 25-26)
// In a real deployment these two maps are replaced by persistence
// (config.database.connectionString) — kept in-memory here on purpose so
// the demo script can run without any external dependency.
// ---------------------------------------------------------------------------

const versionHistory = new Map<string, PathVersion[]>();
const decisionLog: PathDecision[] = [];

export function recordVersion(graph: PathGraph, reasonForChange: string): void {
  const list = versionHistory.get(graph.pathId) ?? [];
  list.push({ version: graph.version, pathId: graph.pathId, snapshot: graph, reasonForChange, createdAt: new Date().toISOString() });
  versionHistory.set(graph.pathId, list);
}

export function getVersionHistory(pathId: string): PathVersion[] {
  return versionHistory.get(pathId) ?? [];
}

export function recordDecision(decision: Omit<PathDecision, "decisionId" | "timestamp">): PathDecision {
  const full: PathDecision = { ...decision, decisionId: nextId("decision"), timestamp: new Date().toISOString() };
  decisionLog.push(full);
  return full;
}

export function getDecisionLog(studentId: string): PathDecision[] {
  return decisionLog.filter((d) => d.studentId === studentId);
}

// ---------------------------------------------------------------------------
// Compression / expansion (Sections 32-33)
// ---------------------------------------------------------------------------

export function shouldCompress(state: StudentState): boolean {
  const c = state.capabilities;
  return (c.mastery.value ?? 0) >= 92 && (c.transfer.value ?? 0) >= 88 && (c.retention.value ?? 0) >= 85;
}

export function shouldExpand(repeatedFailureCount: number): boolean {
  return repeatedFailureCount >= 2;
}

// ---------------------------------------------------------------------------
// Regression handling (Section 34) — weaken, don't reset.
// ---------------------------------------------------------------------------

export function applyRegression(node: PathNode): PathNode {
  return { ...node, state: PathNodeState.WEAKENING, updatedAt: new Date().toISOString() };
}
