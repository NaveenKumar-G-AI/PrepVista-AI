import type { CapabilityDimensionKey, RiskFactorType } from "./types.js";

export const CAPABILITY_DIMENSIONS: CapabilityDimensionKey[] = [
  "mastery",
  "retention",
  "transfer",
  "accuracy",
  "speed",
  "consistency",
];

export const DIMENSION_DISPLAY_NAMES: Record<CapabilityDimensionKey, string> = {
  mastery: "Mastery",
  retention: "Retention",
  transfer: "Transfer",
  accuracy: "Accuracy",
  speed: "Speed",
  consistency: "Consistency",
};

export const RISK_TYPE_LABELS: Record<RiskFactorType, string> = {
  TRANSFER_GAP: "Transfer gap",
  RETENTION_DECAY: "Retention decay",
  SPEED_LIMITATION: "Speed limitation",
  LOW_CONSISTENCY: "Low consistency",
  PERSISTENT_MISCONCEPTION: "Persistent misconception",
  ASSESSMENT_PERFORMANCE_GAP: "Practice vs. assessment gap",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  SLOW_TRAJECTORY: "Slow trajectory",
  STAGNATION: "Stagnation",
  DIFFICULTY_INSTABILITY: "Difficulty instability",
  NOVELTY_WEAKNESS: "Novelty weakness",
  TIME_PRESSURE_WEAKNESS: "Time-pressure weakness",
};
