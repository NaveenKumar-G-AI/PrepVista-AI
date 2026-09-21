// ACEAPT Feature 31 — Readiness Simulator
// Core data model. These shapes are the contract between the engine layer
// and the persistence layer (see lib/db/store.ts + lib/db/repository.ts).
//
// This file is the thing to diff against the *real* ACEAPT schema once one
// exists — the MVP persistence layer is JSON-file-backed (see README, "Data
// model & production swap-in"), but every entity below is written the way it
// would be modeled as real tables/collections, so migrating later is a
// storage-layer swap, not a redesign.

export type ID = string;
export type ISODate = string;

// ---------------------------------------------------------------------------
// Student / Target / Capability — reused, minimal versions of entities that
// would already exist elsewhere in ACEAPT. Kept intentionally thin: Feature
// 31 only needs enough of each to run the simulation loop end to end.
// ---------------------------------------------------------------------------

export interface Student {
  id: ID;
  name: string;
  currentTargetId: ID;
  createdAt: ISODate;
}

export interface TargetCapabilityRequirement {
  capabilityId: ID;
  minProficiency: number; // 0-100
  weight: number; // relative importance inside the readiness formula
}

export interface Target {
  id: ID;
  name: string;
  description: string;
  requiredCapabilities: TargetCapabilityRequirement[];
  readinessThreshold: number; // simulated-readiness % considered "Simulation Ready"
}

export interface Capability {
  id: ID;
  name: string;
  description: string;
}

export interface CapabilityState {
  studentId: ID;
  capabilityId: ID;
  proficiency: number; // 0-100
  lastUpdatedAt: ISODate;
  sourceAttemptIds: ID[];
}

// ---------------------------------------------------------------------------
// Simulation content — the catalog + item bank. Static/content-defined
// (see lib/content), not student state, so it is not persisted as mutable
// records — a real deployment would source this from ACEAPT's existing
// assessment/content infrastructure instead of a code module (spec §38).
// ---------------------------------------------------------------------------

export type SimulationType = 'assessment' | 'technical' | 'interview' | 'case' | 'communication' | 'multi_stage';
export type SimulationLevel = 1 | 2 | 3 | 4; // 1 practice … 4 final readiness

export interface StageTemplate {
  id: ID;
  title: string;
  purpose: string;
  capabilityIds: ID[];
  transfer: boolean;
  itemCount: number;
  timeBudgetSeconds: number;
  itemPoolTags: string[];
}

export interface Simulation {
  id: ID;
  targetId: ID;
  title: string;
  type: SimulationType;
  level: SimulationLevel;
  description: string;
  rules: string[];
  stageTemplates: StageTemplate[];
}

export type ItemKind = 'multiple_choice' | 'decision' | 'free_response';

interface ItemBase {
  id: ID;
  kind: ItemKind;
  capabilityId: ID;
  transfer: boolean;
  prompt: string;
  tags: string[];
}

export interface MCQOption {
  id: string;
  text: string;
}

export interface MCQItem extends ItemBase {
  kind: 'multiple_choice';
  options: MCQOption[];
  correctOptionId: string;
  explanation: string;
}

export type DecisionQuality = 'strong' | 'adequate' | 'weak';

export interface DecisionOption {
  id: string;
  text: string;
  quality: DecisionQuality;
  rationale: string;
}

export interface DecisionItem extends ItemBase {
  kind: 'decision';
  options: DecisionOption[];
}

export interface FreeResponseItem extends ItemBase {
  kind: 'free_response';
  guidance: string;
  minWords?: number;
}

export type Item = MCQItem | DecisionItem | FreeResponseItem;

// Sanitized shape sent to the client during a run — never includes answer keys.
export interface SanitizedItem {
  id: ID;
  kind: ItemKind;
  capabilityId: ID;
  transfer: boolean;
  prompt: string;
  options?: { id: string; text: string }[];
  guidance?: string;
  minWords?: number;
}

// ---------------------------------------------------------------------------
// Blueprint — generated per attempt (spec §6, §37: fresh selection each time
// to resist memorization), then frozen into the attempt as an immutable
// start state (spec §54).
// ---------------------------------------------------------------------------

export interface BlueprintStage {
  id: ID;
  templateId: ID;
  title: string;
  purpose: string;
  capabilityIds: ID[];
  transfer: boolean;
  timeBudgetSeconds: number;
  items: { itemId: ID; kind: ItemKind; transfer: boolean }[];
}

export interface SimulationBlueprint {
  id: ID;
  simulationId: ID;
  targetId: ID;
  level: SimulationLevel;
  type: SimulationType;
  stages: BlueprintStage[];
  totalDurationSeconds: number;
  evidenceRequirements: string[];
  generatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// Attempt / Events / Responses
// ---------------------------------------------------------------------------

export type AttemptStatus = 'in_progress' | 'completed' | 'expired';

export interface ItemResponse {
  itemId: ID;
  stageId: ID;
  kind: ItemKind;
  submittedAt: ISODate;
  timeSpentSeconds: number;
  selectedOptionId?: string;
  freeText?: string;
}

export interface SimulationAttempt {
  id: ID;
  studentId: ID;
  simulationId: ID;
  targetId: ID;
  blueprint: SimulationBlueprint;
  status: AttemptStatus;
  startedAt: ISODate;
  completedAt?: ISODate;
  currentStageIndex: number;
  currentItemIndex: number;
  currentItemStartedAt: ISODate;
  responses: ItemResponse[];
  usedAsEvidence: boolean;
  createdAt: ISODate;
}

export type SimulationEventType =
  | 'simulation_viewed'
  | 'simulation_started'
  | 'stage_started'
  | 'item_started'
  | 'item_completed'
  | 'decision_made'
  | 'stage_completed'
  | 'simulation_completed'
  | 'simulation_expired'
  | 'failure_point_detected'
  | 'readiness_changed'
  | 'path_updated';

export interface SimulationEvent {
  id: ID;
  attemptId: ID | null;
  studentId: ID;
  type: SimulationEventType;
  payload: Record<string, unknown>;
  at: ISODate;
}

// ---------------------------------------------------------------------------
// Evaluation / Result / Evidence
// ---------------------------------------------------------------------------

export interface DimensionScores {
  capability: number;
  application: number;
  transfer: number;
  speed: number;
  consistency: number;
  completion: number;
  decisionQuality: number | null;
}

export type StageVerdict = 'strong' | 'weak' | 'critical' | 'not_reached';

export interface StageEvaluation {
  stageId: ID;
  title: string;
  capabilityIds: ID[];
  accuracy: number;
  verdict: StageVerdict;
  itemsAttempted: number;
  itemsTotal: number;
  avgTimeSeconds: number;
}

export interface Bottleneck {
  stageId: ID;
  stageTitle: string;
  capabilityId: ID;
  label: string;
  accuracy: number;
  verdict: StageVerdict;
}

export interface StrongestArea {
  capabilityId: ID;
  label: string;
  score: number;
}

export type ReadinessState = 'early' | 'developing' | 'near_ready' | 'simulation_ready' | 'verified_ready';
export type EvidenceConfidence = 'insufficient' | 'low' | 'medium' | 'high';

export interface NextBestAction {
  title: string;
  reason: string;
  capabilityId: ID | null;
}

export interface SimulationResult {
  id: ID;
  attemptId: ID;
  studentId: ID;
  targetId: ID;
  simulationTitle: string;
  dimensions: DimensionScores;
  stageEvaluations: StageEvaluation[];
  primaryBottleneck: Bottleneck | null;
  strongestArea: StrongestArea | null;
  biggestRisk: string;
  simulatedReadiness: number;
  targetReadinessThreshold: number;
  gap: number;
  evidenceConfidence: EvidenceConfidence;
  readinessState: ReadinessState;
  proofRecommended: boolean;
  reliableAttemptsCounted: number;
  explanations: string[];
  interpretation: string;
  nextBestAction: NextBestAction;
  aiDebrief: string | null;
  usedAsEvidence: boolean;
  usedAsEvidenceReason: string | null;
  createdAt: ISODate;
}

export interface SimulationEvidence {
  id: ID;
  attemptId: ID;
  studentId: ID;
  targetId: ID;
  capabilityId: ID;
  accuracy: number;
  speed: number;
  transfer: number;
  consistency: number;
  completion: number;
  decisionQuality: number | null;
  weight: number;
  createdAt: ISODate;
}

// ---------------------------------------------------------------------------
// PATH (lightweight local stand-in for Feature 30 — see lib/engines/path-engine.ts)
// ---------------------------------------------------------------------------

export interface PathHistoryEntry {
  at: ISODate;
  bottleneckLabel: string;
  reason: string;
}

export interface PathState {
  studentId: ID;
  targetId: ID;
  currentBottleneck: { capabilityId: ID | null; label: string; reason: string };
  nextBestAction: NextBestAction;
  history: PathHistoryEntry[];
  updatedAt: ISODate;
}

export interface ReadinessSnapshot {
  studentId: ID;
  targetId: ID;
  simulatedReadiness: number | null;
  targetReadinessThreshold: number;
  gap: number | null;
  evidenceConfidence: EvidenceConfidence;
  readinessState: ReadinessState;
  proofRecommended: boolean;
  totalAttempts: number;
  reliableAttempts: number;
  lastAttemptAt: ISODate | null;
}
