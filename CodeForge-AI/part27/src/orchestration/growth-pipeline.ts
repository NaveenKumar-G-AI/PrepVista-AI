import type { RawEvidenceInput } from '../types/evidence.js';
import type { SkillState, SkillStateLabel } from '../types/skill-state.js';
import type { GrowthEvent } from '../types/growth-event.js';
import type { GrowthMilestone } from '../types/milestone.js';
import type { GrowthRepository } from '../repository/growth-repository.js';
import { growthRules, GROWTH_MODEL_VERSION, SKILL_MODEL_VERSION_FALLBACK } from '../config/growth-rules.js';
import { validateRawEvidence } from '../evidence/validate.js';
import { normalizeEvidence } from '../evidence/normalize.js';
import { aggregateEvidence } from '../skill-state/aggregate.js';
import { computeConfidence } from '../skill-state/confidence.js';
import { deriveBaseState, validateTransition } from '../skill-state/state-machine.js';
import { computeTrajectory } from '../trajectory/trajectory-engine.js';
import { detectRegression, detectRecovery, computeTransferState, computeRetentionState, detectBottleneck } from '../analysis/index.js';
import { deriveSkillGrowthEvents, createBottleneckEvent, createMilestoneReachedEvent } from '../events/growth-event-engine.js';
import { evaluateMilestones } from '../milestones/milestone-engine.js';
import { generateId } from '../observability/ids.js';
import { logger, metrics } from '../observability/logger.js';

/**
 * The Core Product Loop (section 2), executable. Evidence -> Normalization
 * -> Skill State -> Trajectory -> Regression/Recovery -> Transfer/Retention
 * -> Events -> Milestones -> Snapshot, all in one place, all backed by the
 * repository interface so it runs identically against
 * InMemoryGrowthRepository (tests, demo) and SupabaseGrowthRepository
 * (production). See src/__tests__/golden-scenario.integration.test.ts for
 * the full section-85 fixture run through this exact function.
 *
 * Idempotent by construction: only skills that received at least one
 * newly-inserted (non-duplicate) evidence record this call get
 * recomputed — re-processing an already-seen batch produces zero new
 * events, zero new milestones, and zero rewritten snapshots (section 57).
 */

export interface PipelineOptions {
  nowIso?: string;
  generateId?: () => string;
  /** Adapter into CodeForge's real skill taxonomy — see MilestoneEligibilityContext. */
  debuggingSkillIds?: Set<string>;
  roleId?: string;
  skillModelVersion?: string;
}

export interface PipelineResult {
  studentId: string;
  runId: string;
  processedEvidenceIds: string[];
  skippedDuplicateCount: number;
  rejectedInvalidCount: number;
  validationErrors: { input: unknown; errors: string[] }[];
  updatedSkills: SkillState[];
  emittedEvents: GrowthEvent[];
  emittedMilestones: GrowthMilestone[];
  snapshotWritten: boolean;
}

/**
 * Reconciles the three independent signals into one candidate state:
 *
 *  1. A DECISIVE recovery (isFullyRecovered — a real, high-ratio positive
 *     streak) wins outright and hands off to the evidence-driven ladder
 *     position. This has to be checked before regression, or a lagging
 *     windowed regression signal (still dragging on older negative
 *     evidence inside its comparison window) can fight a recovery that
 *     has already genuinely happened — the two detectors are independent
 *     and can otherwise disagree right at the handoff point.
 *  2. Otherwise, an active regression signal takes the candidate to
 *     AT_RISK/REGRESSING.
 *  3. Otherwise, a just-starting (not yet decisive) recovery takes the
 *     candidate to RECOVERING — visible in the state, but not yet
 *     confirmed as an event (see growth-event-engine.ts).
 *  4. Otherwise, the plain evidence-driven ladder position applies.
 */
function computeFinalState(
  baseState: SkillStateLabel,
  prevState: SkillStateLabel,
  regressionIsRegressing: boolean,
  regressionSeverity: 'MINOR' | 'MODERATE' | 'SIGNIFICANT' | 'CRITICAL' | null,
  recoveryIsRecovering: boolean,
  recoveryIsFullyRecovered: boolean,
): SkillStateLabel {
  let candidate: SkillStateLabel;
  if (recoveryIsFullyRecovered) {
    candidate = baseState;
  } else if (regressionIsRegressing) {
    candidate = regressionSeverity === 'SIGNIFICANT' || regressionSeverity === 'CRITICAL' ? 'REGRESSING' : 'AT_RISK';
  } else if (recoveryIsRecovering) {
    candidate = 'RECOVERING';
  } else {
    candidate = baseState;
  }
  return validateTransition(prevState, candidate).resolvedState;
}

export async function processEvidenceBatch(studentId: string, rawInputs: RawEvidenceInput[], repo: GrowthRepository, options: PipelineOptions = {}): Promise<PipelineResult> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const genId = options.generateId ?? generateId;
  const runId = genId();
  const pipelineStarted = Date.now();

  const processedEvidenceIds: string[] = [];
  const validationErrors: { input: unknown; errors: string[] }[] = [];
  let skippedDuplicateCount = 0;
  let rejectedInvalidCount = 0;
  const touchedSkillIds = new Set<string>();

  for (const raw of rawInputs) {
    const validation = validateRawEvidence(raw, nowIso);
    if (!validation.valid || !validation.data) {
      rejectedInvalidCount += 1;
      validationErrors.push({ input: raw, errors: validation.errors });
      metrics.incr('evidence.rejected_invalid');
      continue;
    }

    const evidence = normalizeEvidence(validation.data, genId);
    const { inserted } = await repo.appendEvidence(evidence);
    if (!inserted) {
      skippedDuplicateCount += 1;
      metrics.incr('evidence.duplicate_skipped');
      continue;
    }

    processedEvidenceIds.push(evidence.evidenceId);
    touchedSkillIds.add(evidence.skillId);
    metrics.incr('evidence.ingested');
  }

  const updatedSkills: SkillState[] = [];
  const emittedEvents: GrowthEvent[] = [];

  for (const skillId of touchedSkillIds) {
    const evidence = await repo.getEvidenceForSkill(studentId, skillId);
    const previous = await repo.getLatestSkillState(studentId, skillId);

    const aggregate = aggregateEvidence(evidence, nowIso);
    const confidence = computeConfidence(evidence, nowIso);
    const baseState = deriveBaseState(aggregate.score, evidence.length, confidence.level);

    const prevState: SkillStateLabel = previous?.state ?? 'UNKNOWN';
    const priorStableScore = previous?.performanceScore ?? null;

    // Regression is only meaningful relative to an existing baseline — a
    // skill's very first-ever evidence batch has nothing to regress FROM,
    // so it goes through the plain ladder (deriveBaseState) instead of
    // this detector, however many negative records happen to be in it.
    const regression = previous ? detectRegression(evidence, nowIso, priorStableScore) : { isRegressing: false, severity: null, consecutiveNegative: 0, scoreDrop: null };
    const recovery = detectRecovery(evidence, prevState);
    const finalState = computeFinalState(baseState, prevState, regression.isRegressing, regression.severity, recovery.isRecovering, recovery.isFullyRecovered);

    const trajectoryResult = computeTrajectory(evidence, nowIso, prevState);
    const transfer = computeTransferState(evidence);
    const retention = computeRetentionState(evidence, nowIso, finalState);

    const sortedByTime = [...evidence].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const firstDemonstrated = sortedByTime.at(0)?.timestamp ?? null;
    const lastDemonstrated = sortedByTime.at(-1)?.timestamp ?? null;
    const strongPositive = [...sortedByTime].reverse().find((e) => e.outcome === 'positive' && (e.evidenceType === 'DETERMINISTIC' || e.evidenceType === 'DIRECT'));

    const newState: SkillState = {
      studentId,
      skillId,
      state: finalState,
      performanceScore: aggregate.score,
      confidence,
      trajectory: trajectoryResult.trajectory,
      retention,
      transfer,
      regressionSeverity: finalState === 'AT_RISK' || finalState === 'REGRESSING' ? regression.severity : null,
      firstDemonstrated,
      lastDemonstrated,
      lastStrongEvidence: strongPositive?.timestamp ?? null,
      evidenceRefs: evidence.map((e) => e.evidenceId),
      evidenceCount: evidence.length,
      growthModelVersion: GROWTH_MODEL_VERSION,
      rulesVersion: growthRules.version,
      computedAt: nowIso,
    };

    await repo.appendSkillStateSnapshot(newState);
    updatedSkills.push(newState);

    const events = deriveSkillGrowthEvents(previous, newState, nowIso, genId);
    for (const event of events) {
      await repo.appendGrowthEvent(event);
      emittedEvents.push(event);
    }

    if (regression.isRegressing) metrics.incr('regression.detected');
    if (recovery.isFullyRecovered) metrics.incr('recovery.detected');
  }

  // Student-level bottleneck check runs on every batch that touched at
  // least one skill, over the FULL current skill set — not just the
  // skills that changed this round, since a bottleneck is a relative,
  // cross-skill judgement (section 21).
  const emittedMilestones: GrowthMilestone[] = [];
  if (touchedSkillIds.size > 0) {
    const allLatestStates = await repo.getAllLatestSkillStates(studentId);
    const bottleneck = detectBottleneck(allLatestStates);
    const existingEvents = await repo.getGrowthEvents(studentId);
    const priorBottleneckEvent = [...existingEvents, ...emittedEvents].filter((e) => e.eventType === 'BOTTLENECK_IDENTIFIED').at(-1);

    if (bottleneck && bottleneck.skillId !== priorBottleneckEvent?.skillId) {
      const bottleneckState = allLatestStates.find((s) => s.skillId === bottleneck.skillId);
      if (bottleneckState) {
        const event = createBottleneckEvent(studentId, bottleneck.skillId, bottleneckState.evidenceRefs, bottleneckState.confidence.level, nowIso, genId);
        await repo.appendGrowthEvent(event);
        emittedEvents.push(event);
        metrics.incr('bottleneck.identified');
      }
    }

    const allEvents = [...existingEvents, ...emittedEvents];
    const alreadyAwarded = await repo.getAwardedMilestoneKeys(studentId);
    const newMilestones = evaluateMilestones(
      { studentId, skillStates: allLatestStates, events: allEvents, debuggingSkillIds: options.debuggingSkillIds, roleId: options.roleId },
      alreadyAwarded,
      nowIso,
      genId,
    );

    for (const milestone of newMilestones) {
      await repo.appendMilestone(milestone);
      emittedMilestones.push(milestone);
      const milestoneEvent = createMilestoneReachedEvent(milestone, genId);
      await repo.appendGrowthEvent(milestoneEvent);
      emittedEvents.push(milestoneEvent);
      metrics.incr('milestone.awarded');
    }
  }

  let snapshotWritten = false;
  if (updatedSkills.length > 0 || emittedMilestones.length > 0) {
    const allLatestStates = await repo.getAllLatestSkillStates(studentId);
    await repo.appendGrowthSnapshot({
      snapshotId: genId(),
      studentId,
      timestamp: nowIso,
      skillModelVersion: options.skillModelVersion ?? SKILL_MODEL_VERSION_FALLBACK,
      evidenceModelVersion: GROWTH_MODEL_VERSION,
      growthModelVersion: GROWTH_MODEL_VERSION,
      skills: allLatestStates,
      roleContext: options.roleId,
      sourceEvent: runId,
    });
    snapshotWritten = true;
    metrics.incr('snapshot.written');
  }

  metrics.recordDuration('pipeline.duration_ms', Date.now() - pipelineStarted);
  logger.info('growth pipeline run complete', {
    correlationId: runId,
    studentId,
    processed: processedEvidenceIds.length,
    duplicates: skippedDuplicateCount,
    rejected: rejectedInvalidCount,
    skillsUpdated: updatedSkills.length,
    events: emittedEvents.length,
    milestones: emittedMilestones.length,
  });

  return {
    studentId,
    runId,
    processedEvidenceIds,
    skippedDuplicateCount,
    rejectedInvalidCount,
    validationErrors,
    updatedSkills,
    emittedEvents,
    emittedMilestones,
    snapshotWritten,
  };
}
