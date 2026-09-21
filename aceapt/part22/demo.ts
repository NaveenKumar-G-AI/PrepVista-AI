import { AdaptationTrigger, GoalStatus, GoalType, LearningGoal, MetricReading, Skill, StudentState } from "./types";
import { PathfinderService } from "./services/pathfinderService";

function reading(value: number, confidence = 0.85, evidenceCount = 5): MetricReading {
  return { value, source: "mock-evidence", timestamp: new Date().toISOString(), confidence, evidenceCount };
}

// A small aptitude skill graph mirroring the spec's own example (Section 13):
// Percentage -> Ratio -> Profit & Loss -> Data Interpretation.
const skills: Skill[] = [
  { skillId: "percentage", name: "Percentage", prerequisiteSkillIds: [] },
  { skillId: "ratio", name: "Ratio", prerequisiteSkillIds: ["percentage"] },
  { skillId: "profit_loss", name: "Profit & Loss", prerequisiteSkillIds: ["ratio"] },
  { skillId: "data_interpretation", name: "Data Interpretation", prerequisiteSkillIds: ["profit_loss"] },
  { skillId: "probability", name: "Probability", prerequisiteSkillIds: [] },
];

const goal: LearningGoal = {
  goalId: "goal-1",
  studentId: "student-1",
  goalType: GoalType.PLACEMENT_READINESS,
  title: "Become Placement Ready in 30 Days",
  deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  status: GoalStatus.ACTIVE,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Matches the "IDEAL DEMO" numbers from Section 56.
const initialState: StudentState = {
  studentId: "student-1",
  asOf: new Date().toISOString(),
  capabilities: {
    mastery: reading(82),
    retention: reading(79),
    transfer: reading(58),
    reasoning: reading(70),
    accuracy: reading(75),
    speed: reading(61),
    questionSelection: reading(60),
    simulationPerformance: reading(70),
    consistency: reading(70),
    readiness: reading(60),
  },
  skills: {
    percentage: { skillId: "percentage", mastery: reading(88), transfer: reading(80), timedAccuracy: reading(85), retention: reading(85) },
    ratio: { skillId: "ratio", mastery: reading(80), transfer: reading(70), timedAccuracy: reading(72), retention: reading(78) },
    profit_loss: { skillId: "profit_loss", mastery: reading(84), transfer: reading(58), timedAccuracy: reading(61), retention: reading(80) },
    data_interpretation: { skillId: "data_interpretation", mastery: reading(65), transfer: reading(50), timedAccuracy: reading(48), retention: reading(60) },
    probability: { skillId: "probability", mastery: reading(85), transfer: reading(82), timedAccuracy: reading(80), retention: reading(83) },
  },
};

const service = new PathfinderService();

console.log("=== ACEAPT Pathfinder — vertical slice demo (Section 56) ===\n");
console.log(`Goal: ${goal.title}\n`);

const initial = service.planInitialPath(goal, initialState, skills);
console.log("CURRENT STATE");
console.log(`  Mastery   ${initialState.capabilities.mastery.value}%`);
console.log(`  Retention ${initialState.capabilities.retention.value}%`);
console.log(`  Transfer  ${initialState.capabilities.transfer.value}%`);
console.log(`  Timed     ${initialState.capabilities.speed.value}%`);

console.log(`\nBIGGEST BOTTLENECK\n  ${initial.primaryBottleneck.label}`);
console.log(`  Why: ${initial.primaryBottleneck.reason}`);

console.log(`\nYOUR PATH (v${initial.graph.version})`);
initial.graph.nodes.forEach((n, i) => console.log(`  ${i + 1}. ${n.label}`));

// --- Student completes step 1. New evidence arrives for whichever skill the
// engine actually identified as the top priority (no hardcoded skill id). ---
const topSkillId = initial.priorities[0]?.skillId ?? "profit_loss";
console.log(`(Top-priority skill identified by the engine: ${topSkillId})`);
service.completeNode(goal.studentId, initial.graph.nodes[0].nodeId); // student completed this node

const updatedState: StudentState = JSON.parse(JSON.stringify(initialState));
updatedState.capabilities.transfer = reading(72, 0.8, 3);
updatedState.skills[topSkillId].transfer = reading(72, 0.8, 3);

console.log("\n--- Student completes step 1. New evidence: Transfer 58 -> 72 (Timed stays ~61) ---\n");

const result = service.ingestEvidence(goal, initialState, updatedState, skills, AdaptationTrigger.NEW_HIGH_CONFIDENCE_EVIDENCE);

console.log(`Replanned: ${result.replanned}`);
console.log(`Reason: ${result.decisionReason}`);

if (result.primaryBottleneck) {
  console.log(`\nNEW PRIORITY\n  ${result.primaryBottleneck.label}`);
}

console.log(`\nUPDATED PATH (v${result.graph.version})`);
result.graph.nodes.forEach((n, i) => console.log(`  ${i + 1}. [${n.state}] ${n.label}`));

console.log("\nDECISION LOG");
service.getDecisionLog(goal.studentId).forEach((d) => {
  console.log(`  - trigger=${d.trigger}`);
  console.log(`    evidence=${d.evidence}`);
  console.log(`    reason=${d.reason}`);
  console.log(`    confidence=${d.confidence}`);
});

console.log("\n=== The roadmap is not static — it reacted to evidence. ===");
