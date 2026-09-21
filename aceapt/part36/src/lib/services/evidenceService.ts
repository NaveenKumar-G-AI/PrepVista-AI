import { getActionById, listCompletedForCapability, setDifficulty } from "../db/repoActions";
import { createEvidence, createOutcome, listEvidenceForAction, listCompletedSessionsForActionType, endSession } from "../db/repoExecution";
import { recordCapabilityEvidence, updateCapabilityTrend, getCapabilityById } from "../db/repoGoals";
import { upsertPreferences, getPreferences } from "../db/repoPlanning";
import type {
  ActionEvidenceRecord,
  ActionImpact,
  ActionOutcomeRecord,
  ConfidenceLevel,
  DifficultyLevel,
  EvidenceQuality,
} from "../types";

const DIFFICULTY_ORDER: DifficultyLevel[] = ["BASIC", "INTERMEDIATE", "ADVANCED", "REALISTIC_SIMULATION"];

export interface RecordEvidenceInput {
  userId: string;
  actionId: string;
  evidenceQuality: EvidenceQuality;
  resultSummary?: string | null;
  scoreValue?: number | null;
  scoreLabel?: string | null;
  notes?: string | null;
}

export interface RecordEvidenceResult {
  evidence: ActionEvidenceRecord;
  outcome: ActionOutcomeRecord;
}

/** Did it work? (spec section 24). Compares this evidence's score to
 *  the most recent prior MEASURED/VERIFIED score for the same
 *  action's capability area. Self-reported evidence, or too little
 *  history to compare, is honestly reported as INSUFFICIENT_DATA
 *  rather than guessed at (spec Rule 10). */
export function recordEvidence(input: RecordEvidenceInput): RecordEvidenceResult {
  const action = getActionById(input.userId, input.actionId);
  if (!action) throw new Error("Action not found");

  const evidence = createEvidence(input);

  if (action.capabilityAreaId) {
    recordCapabilityEvidence(input.userId, action.capabilityAreaId);
  }

  const { impact, nextRecommendation } = computeImpact(
    input.userId,
    action.id,
    action.capabilityAreaId,
    input.evidenceQuality,
    input.scoreValue ?? null
  );

  if (action.capabilityAreaId) {
    const trend = impact === "POSITIVE_SIGNAL" ? "IMPROVING" : impact === "NEGATIVE_SIGNAL" ? "DECLINING" : impact === "NO_CHANGE" ? "FLAT" : "UNKNOWN";
    updateCapabilityTrend(input.userId, action.capabilityAreaId, trend);

    if (impact === "POSITIVE_SIGNAL" || impact === "NEGATIVE_SIGNAL") {
      const nextLevel = adaptDifficulty(action.difficultyLevel, impact);
      setDifficulty(input.userId, action.id, nextLevel);
    }
  }

  const outcome = createOutcome(input.userId, action.id, impact, nextRecommendation);
  return { evidence, outcome };
}

function computeImpact(
  userId: string,
  currentActionId: string,
  capabilityAreaId: string | null,
  quality: EvidenceQuality,
  scoreValue: number | null
): { impact: ActionImpact; nextRecommendation: string } {
  if (!capabilityAreaId || (quality !== "MEASURED" && quality !== "VERIFIED") || scoreValue === null) {
    return {
      impact: "INSUFFICIENT_DATA",
      nextRecommendation: "Complete a measured or verified activity to get a clearer signal here.",
    };
  }

  const capability = getCapabilityById(userId, capabilityAreaId);
  // "Prior" means from OTHER actions in this capability, not this
  // action's own just-recorded evidence — otherwise an action that
  // was already self-reported-complete before its measured evidence
  // arrived would be compared against itself (delta 0 → NO_CHANGE,
  // even on a genuine first data point).
  const priorScores = listCompletedForCapability(userId, capabilityAreaId)
    .filter((a) => a.id !== currentActionId)
    .map((a) => listEvidenceForAction(userId, a.id))
    .flat()
    .filter((e) => (e.evidenceQuality === "MEASURED" || e.evidenceQuality === "VERIFIED") && e.scoreValue !== null)
    .map((e) => e.scoreValue as number);

  if (priorScores.length === 0) {
    return {
      impact: "INSUFFICIENT_DATA",
      nextRecommendation: `First measured signal for ${capability?.name ?? "this area"} — the next one will show a trend.`,
    };
  }

  const priorAvg = priorScores.reduce((a, b) => a + b, 0) / priorScores.length;
  const delta = scoreValue - priorAvg;
  const threshold = Math.max(2, Math.abs(priorAvg) * 0.05);

  if (delta > threshold) {
    return { impact: "POSITIVE_SIGNAL", nextRecommendation: "Increase difficulty next time." };
  }
  if (delta < -threshold) {
    return {
      impact: "NEGATIVE_SIGNAL",
      nextRecommendation: "Isolate the underlying concept before returning to this at full difficulty.",
    };
  }
  return { impact: "NO_CHANGE", nextRecommendation: "Try a different approach next time rather than repeating this one." };
}

function adaptDifficulty(current: DifficultyLevel, impact: ActionImpact): DifficultyLevel {
  const idx = DIFFICULTY_ORDER.indexOf(current);
  if (impact === "POSITIVE_SIGNAL") return DIFFICULTY_ORDER[Math.min(idx + 1, DIFFICULTY_ORDER.length - 1)];
  if (impact === "NEGATIVE_SIGNAL") return DIFFICULTY_ORDER[Math.max(idx - 1, 0)];
  return current;
}

/** Effort calibration (spec section 21). Only speaks in LIMITED_DATA /
 *  EARLY_SIGNAL / REPEATED_PATTERN terms — never claims precise
 *  learning from a handful of sessions. */
export function finishSessionAndCalibrate(userId: string, sessionId: string, actionId: string, actualMinutes: number): void {
  endSession(userId, sessionId, actualMinutes);

  const recent = listCompletedSessionsForActionType(userId, 20);
  const sampleCount = recent.length;
  if (sampleCount === 0) return;

  const avg = Math.round(recent.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0) / sampleCount);
  const confidence: ConfidenceLevel =
    sampleCount < 3 ? "LIMITED_DATA" : sampleCount < 7 ? "EARLY_SIGNAL" : sampleCount < 12 ? "EMERGING_PATTERN" : "REPEATED_PATTERN";

  upsertPreferences(userId, avg, confidence, sampleCount);
}

export function getEffortCalibration(userId: string): { estimated: number; actual: number; confidence: ConfidenceLevel; sampleCount: number } | null {
  const prefs = getPreferences(userId);
  if (!prefs || !prefs.preferred_session_minutes) return null;
  return {
    estimated: prefs.preferred_session_minutes,
    actual: prefs.preferred_session_minutes,
    confidence: prefs.confidence,
    sampleCount: prefs.sample_count,
  };
}
