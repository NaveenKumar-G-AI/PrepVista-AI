import type { PoolClient } from "pg";
import type { MasteryStateEnum, EvidenceType, ContextType, NoveltyLevel, ExposureState } from "../types/index.js";
import { createEvidence } from "../repositories/masteryEvidenceRepository.js";
import { listEvidenceForSkill } from "../repositories/masteryEvidenceRepository.js";
import { getMasteryState, upsertMasteryState } from "../repositories/masteryStateRepository.js";
import { recordExposure } from "../repositories/questionExposureRepository.js";
import { upsertReviewEntry } from "../repositories/reviewScheduleRepository.js";
import { addHistoryEvent } from "../repositories/masteryHistoryRepository.js";
import { findSkillById } from "../repositories/skillRepository.js";
import { decideMasteryState, buildVerifiedSnapshot, type MasteryDecision } from "./masteryDecisionService.js";
import { buildTransitionHistoryEffect, buildTransitionSignals } from "./transitionEffectsService.js";
import { computeReviewPriority } from "./reviewSchedulerService.js";
import { emitSignal } from "./integration/signalBus.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";
import { genId } from "../lib/ids.js";

const REVIEW_ELIGIBLE_STATES: MasteryStateEnum[] = ["PROVISIONALLY_MASTERED", "VERIFIED_MASTERED", "STABLE_MASTERED", "AT_RISK", "REGRESSED"];

export interface SubmitQuestionEvidenceInput {
  studentId: string;
  skillId: string;
  questionId: string;
  wasCorrect: boolean;
  score: number;
  evidenceType: EvidenceType;
  difficulty: number;
  timed: boolean;
  timeTakenSeconds?: number | null;
  expectedTimeSeconds?: number | null;
  contextType: ContextType;
  noveltyLevel: NoveltyLevel;
  source: string;
  verificationAttemptId?: string | null;
}

export interface RecomputeResult {
  decision: MasteryDecision;
  stateChanged: boolean;
  previousState: MasteryStateEnum;
}

/**
 * Records one answered question as evidence (exposure first, so the
 * resulting row is honestly tagged REPEATED/MEMORIZATION_RISK when it
 * applies) and recomputes mastery state from the full evidence history.
 * This is the single path every evidence source goes through - Feature 8's
 * own verification sessions AND the /mastery/ingest/evidence endpoint that
 * lets Feature 5/6 feed practice/assessment results in - so the decision
 * engine, history, and signal emission never diverge by source.
 */
export async function submitQuestionEvidence(client: PoolClient, input: SubmitQuestionEvidenceInput): Promise<RecomputeResult> {
  const exposure = await recordExposure(client, {
    id: genId(),
    studentId: input.studentId,
    questionId: input.questionId,
    wasCorrect: input.wasCorrect,
  });

  await createEvidence(client, {
    id: genId(),
    studentId: input.studentId,
    skillId: input.skillId,
    questionId: input.questionId,
    evidenceType: input.evidenceType,
    score: input.score,
    difficulty: input.difficulty,
    timed: input.timed,
    timeTakenSeconds: input.timeTakenSeconds ?? null,
    expectedTimeSeconds: input.expectedTimeSeconds ?? null,
    contextType: input.contextType,
    noveltyLevel: input.noveltyLevel,
    questionExposureState: exposure.state as ExposureState,
    source: input.source,
    verificationAttemptId: input.verificationAttemptId ?? null,
  });

  return recomputeAndPersistMasteryState(client, input.studentId, input.skillId);
}

/**
 * Re-derives mastery state from the complete evidence history and persists
 * every downstream consequence: the mastery_state row itself, a verified
 * snapshot (only stamped the moment VERIFIED/STABLE is newly reached - see
 * masteryDecisionService's regression overlay for why that snapshot
 * matters), a history event on genuine transitions, the review schedule
 * entry, and any structured signals to Feature 3/4/7. Called after every
 * new piece of evidence, and safe to call redundantly (idempotent given the
 * same evidence).
 */
export async function recomputeAndPersistMasteryState(client: PoolClient, studentId: string, skillId: string): Promise<RecomputeResult> {
  const config = getMasteryModelConfig();
  const existingState = await getMasteryState(client, studentId, skillId);
  const evidence = await listEvidenceForSkill(client, studentId, skillId);
  const skill = await findSkillById(client, skillId);

  const previousState: MasteryStateEnum = existingState?.state ?? "UNKNOWN";
  const decision = decideMasteryState({
    previousState,
    previousVerifiedSnapshot: existingState?.verifiedSnapshot ?? null,
    evidence,
  });

  const newlyVerifiedOrStable =
    (decision.state === "VERIFIED_MASTERED" || decision.state === "STABLE_MASTERED") &&
    !(previousState === "VERIFIED_MASTERED" || previousState === "STABLE_MASTERED");

  const snapshot = newlyVerifiedOrStable ? buildVerifiedSnapshot(decision.dimensions, config.dimensionWeights) : null;

  let nextReviewAt: string | null = null;
  if (REVIEW_ELIGIBLE_STATES.includes(decision.state)) {
    const priority = computeReviewPriority(
      {
        id: existingState?.id ?? genId(),
        studentId,
        skillId,
        state: decision.state,
        confidence: decision.confidence,
        conceptScore: decision.dimensions.conceptScore,
        executionScore: decision.dimensions.executionScore,
        transferScore: decision.dimensions.transferScore,
        retentionScore: decision.dimensions.retentionScore,
        timedScore: decision.dimensions.timedScore,
        consistencyScore: decision.dimensions.consistencyScore,
        verifiedSnapshot: snapshot ?? existingState?.verifiedSnapshot ?? null,
        lastVerifiedAt: newlyVerifiedOrStable ? new Date().toISOString() : existingState?.lastVerifiedAt ?? null,
        nextReviewAt: existingState?.nextReviewAt ?? null,
        masteryModelVersion: config.version,
        updatedAt: new Date().toISOString(),
      },
      skill?.importance ?? 1.0
    );
    nextReviewAt = priority.dueAt.toISOString();

    await upsertReviewEntry(client, {
      id: genId(),
      studentId,
      skillId,
      priorityScore: priority.priorityScore,
      reason: priority.reason,
      dueAt: priority.dueAt.toISOString(),
      estimatedMinutes: priority.estimatedMinutes,
      status: priority.isDue ? "PENDING" : "PENDING",
    });
  }

  await upsertMasteryState(client, {
    id: existingState?.id ?? genId(),
    studentId,
    skillId,
    state: decision.state,
    confidence: decision.confidence,
    conceptScore: decision.dimensions.conceptScore,
    executionScore: decision.dimensions.executionScore,
    transferScore: decision.dimensions.transferScore,
    retentionScore: decision.dimensions.retentionScore,
    timedScore: decision.dimensions.timedScore,
    consistencyScore: decision.dimensions.consistencyScore,
    verifiedSnapshot: snapshot,
    lastVerifiedAt: newlyVerifiedOrStable ? new Date().toISOString() : null,
    nextReviewAt,
    masteryModelVersion: decision.masteryModelVersion,
  });

  const historyEffect = buildTransitionHistoryEffect(previousState, decision);
  if (historyEffect) {
    await addHistoryEvent(client, {
      id: genId(),
      studentId,
      skillId,
      eventType: historyEffect.historyEventType,
      description: historyEffect.historyDescription,
      metadata: { dimensions: decision.dimensions, rationale: decision.rationale },
    });
  }

  const signals = buildTransitionSignals(previousState, decision, { studentId, skillId });
  for (const { targetFeature, signal } of signals) {
    await emitSignal(client, targetFeature, signal);
  }

  return { decision, stateChanged: previousState !== decision.state, previousState };
}
