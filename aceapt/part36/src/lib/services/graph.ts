import { getActiveMilestone, listCapabilities } from "../db/repoGoals";
import { listUpcomingOpportunities } from "../db/repoPlanning";
import type { CareerGoal } from "../types";

export interface GraphNode {
  id: string;
  label: string;
  layer: number;
  kind: "goal" | "milestone" | "capability" | "opportunity" | "outcome";
  isBottleneck?: boolean;
  isUnknown?: boolean;
}
export interface GraphEdge {
  from: string;
  to: string;
}
export interface CareerGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildCareerGraph(userId: string, goal: CareerGoal): CareerGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const goalNode: GraphNode = { id: `goal:${goal.id}`, label: goal.targetRole, layer: 0, kind: "goal" };
  nodes.push(goalNode);

  const milestone = getActiveMilestone(goal.id);
  const milestoneNode: GraphNode = milestone
    ? { id: `milestone:${milestone.id}`, label: milestone.title, layer: 1, kind: "milestone" }
    : { id: "milestone:unknown", label: "Milestone", layer: 1, kind: "milestone", isUnknown: true };
  nodes.push(milestoneNode);
  edges.push({ from: goalNode.id, to: milestoneNode.id });

  const capabilities = listCapabilities(userId, goal.id);
  const capNodes = capabilities.slice(0, 5).map((c) => {
    const node: GraphNode = { id: `cap:${c.id}`, label: c.name, layer: 2, kind: "capability", isBottleneck: c.isCurrentBottleneck };
    edges.push({ from: milestoneNode.id, to: node.id });
    return node;
  });
  if (capNodes.length === 0) {
    const placeholder: GraphNode = { id: "cap:unknown", label: "Capabilities", layer: 2, kind: "capability", isUnknown: true };
    capNodes.push(placeholder);
    edges.push({ from: milestoneNode.id, to: placeholder.id });
  }
  nodes.push(...capNodes);

  const opportunities = listUpcomingOpportunities(userId);
  const nextOpportunity = opportunities[0];
  const oppNode: GraphNode = nextOpportunity
    ? { id: `opp:${nextOpportunity.id}`, label: nextOpportunity.title, layer: 3, kind: "opportunity" }
    : { id: "opp:unknown", label: "Next opportunity", layer: 3, kind: "opportunity", isUnknown: true };
  nodes.push(oppNode);
  capNodes.forEach((c) => edges.push({ from: c.id, to: oppNode.id }));

  const outcomeNode: GraphNode = { id: "outcome", label: "Offer", layer: 4, kind: "outcome" };
  nodes.push(outcomeNode);
  edges.push({ from: oppNode.id, to: outcomeNode.id });

  return { nodes, edges };
}
