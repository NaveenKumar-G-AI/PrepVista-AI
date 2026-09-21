// ============================================================
// ACTION SCORING (spec §26–§29, §40–§42)
//
// Turns each skill's primary diagnosis into one or more candidate
// actions, scores them, and returns everything ranked. The formula
// (spec §41) is:
//
//   score = (expectedBenefit × diagnosticConfidence × goalRelevance
//             × readinessImpact) ÷ timeCostMinutes
//
// Dividing by time cost is what naturally implements "minimum
// effective intervention" (§15–§16): a 3-minute action with decent
// benefit will consistently outscore a 30-minute action with
// slightly higher benefit, with no separate rule needed for it.
//
// Escalation (§21–§22) and action diversity (§42) are applied
// before scoring, by changing *which* action type is even offered
// as a candidate — not as a penalty bolted on afterward.
// ============================================================

import { ACTION_CATALOG, ESCALATION_LADDER, PREFERRED_ACTIONS } from './actionCatalog';
import {
  ActionType,
  BottleneckCandidate,
  ConfidenceLevel,
  DiagnosisHypothesis,
  InterventionRecord,
  ScoredAction,
  SkillDiagnosisReport,
  SkillId,
  Student,
  StudentGoal,
} from './types';

const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = {
  HIGH: 1.0,
  MEDIUM: 0.7,
  LOW: 0.4,
  UNKNOWN: 0.2,
};

const GOAL_BOOSTED_ACTIONS: Partial<Record<StudentGoal, ActionType[]>> = {
  SPEED_IMPROVEMENT: ['TIMED_PRACTICE', 'MOCK_TEST', 'QUESTION_SELECTION_TRAINING'],
  ACCURACY_IMPROVEMENT: ['CONTRASTIVE_PRACTICE', 'REASONING_DRILL', 'MICRO_QUIZ'],
  CONCEPT_FOUNDATION: ['LEARN', 'RELEARN', 'RESTORE_PREREQUISITE'],
  PLACEMENT_READINESS: ['MOCK_TEST', 'RESTORE_PREREQUISITE', 'TIMED_PRACTICE'],
  MAINTAIN_MASTERY: ['RECALL', 'REACTIVATE', 'REVIEW'],
  APTITUDE_MASTERY: ['PRACTICE', 'TRANSFER', 'REASONING_DRILL'],
  SPECIFIC_ASSESSMENT: ['MOCK_TEST', 'TIMED_PRACTICE'],
};

export interface ActionScoringInput {
  student: Student;
  diagnosisReports: SkillDiagnosisReport[];
  bottlenecks: BottleneckCandidate[];
  readinessCriticalSkillIds: Set<SkillId>;
  pastInterventionsBySkill: Map<SkillId, InterventionRecord[]>;
  /** Most-recent-first action types the student has been given recently, across all skills — for the diversity nudge. */
  recentActionTypes: ActionType[];
}

export function rankActions(input: ActionScoringInput): ScoredAction[] {
  const daysToAssessment = daysUntil(input.student.targetAssessmentDate);
  const candidates: ScoredAction[] = [];

  for (const report of input.diagnosisReports) {
    const primary = report.hypotheses[0];
    if (!primary) continue; // nothing wrong here — no action to generate

    const preferred = PREFERRED_ACTIONS[primary.category] ?? [];
    const pastForSkill = input.pastInterventionsBySkill.get(report.skillId) ?? [];

    for (const { type, benefit } of preferred) {
      candidates.push(
        buildCandidate({
          student: input.student,
          primary,
          rawType: type,
          rawBenefit: benefit,
          pastForSkill,
          bottlenecks: input.bottlenecks,
          readinessCriticalSkillIds: input.readinessCriticalSkillIds,
          daysToAssessment,
          recentActionTypes: input.recentActionTypes,
        })
      );
    }
  }

  return dedupeByTargetAndType(candidates).sort((a, b) => b.score - a.score);
}

/** When two different diagnoses independently recommend the exact same action on the exact same skill, keep only the stronger case rather than showing a redundant duplicate. */
function dedupeByTargetAndType(candidates: ScoredAction[]): ScoredAction[] {
  const bestByKey = new Map<string, ScoredAction>();
  for (const candidate of candidates) {
    const key = `${candidate.targetSkillId}::${candidate.action.type}`;
    const existing = bestByKey.get(key);
    if (!existing || candidate.score > existing.score) bestByKey.set(key, candidate);
  }
  return [...bestByKey.values()];
}

interface BuildCandidateArgs {
  student: Student;
  primary: DiagnosisHypothesis;
  rawType: ActionType;
  rawBenefit: number;
  pastForSkill: InterventionRecord[];
  bottlenecks: BottleneckCandidate[];
  readinessCriticalSkillIds: Set<SkillId>;
  daysToAssessment: number | null;
  recentActionTypes: ActionType[];
}

function buildCandidate(args: BuildCandidateArgs): ScoredAction {
  const { student, primary, pastForSkill, bottlenecks, readinessCriticalSkillIds, daysToAssessment, recentActionTypes } = args;

  const resolvedType = escalateIfNeeded(args.rawType, pastForSkill);
  const isPrereqRepair = primary.category === 'PREREQUISITE_GAP' && resolvedType === 'RESTORE_PREREQUISITE';
  const targetSkillId = isPrereqRepair ? pickBottleneckTarget(primary, bottlenecks) : primary.skillId;
  const bottleneck = bottlenecks.find((b) => b.skillId === targetSkillId);

  // Repairing a skill that unblocks several other weak skills is worth
  // more than repairing one that unblocks none (spec §7, §12).
  const benefitMultiplier = isPrereqRepair && bottleneck ? Math.min(1, 0.7 + 0.1 * bottleneck.downstreamWeakCount) : 1;
  const expectedBenefit = clamp01(args.rawBenefit * benefitMultiplier);

  const diagnosticConfidence = CONFIDENCE_WEIGHT[primary.confidence];
  const gr = goalRelevance(resolvedType, student.goal);
  const ri = readinessImpact(readinessCriticalSkillIds.has(targetSkillId), daysToAssessment);

  // Mild nudge against defaulting to the same action type over and over
  // (spec §42) — not a hard block, just a tiebreaker-strength penalty.
  const recentlyOverused = recentActionTypes.length >= 2 && recentActionTypes.slice(0, 2).every((t) => t === resolvedType);
  const diversityFactor = recentlyOverused ? 0.9 : 1;

  const def = ACTION_CATALOG[resolvedType];
  const timeCostMinutes = Math.max(def.baseDurationMinutes, 1); // floor so WAIT-type 0-minute actions don't divide by zero

  const score = (expectedBenefit * diagnosticConfidence * gr * ri * diversityFactor) / timeCostMinutes;

  return {
    action: def,
    originSkillId: primary.skillId,
    targetSkillId,
    isPrerequisiteRepair: isPrereqRepair,
    score,
    scoreBreakdown: {
      expectedBenefit,
      diagnosticConfidence,
      goalRelevance: gr,
      readinessImpact: ri,
      timeCostMinutes: def.baseDurationMinutes,
    },
    reason: buildReason(primary, resolvedType, isPrereqRepair, bottleneck),
    diagnosisCategory: primary.category,
  };
}

/**
 * If every rung up to and including this action's escalation level has
 * already failed for this skill, jump to the next untried rung instead
 * of recommending something we already have evidence doesn't work
 * (spec §21–§22).
 */
function escalateIfNeeded(candidateType: ActionType, pastInterventions: InterventionRecord[]): ActionType {
  const candidateLevel = ACTION_CATALOG[candidateType].escalationLevel;
  if (candidateLevel === 0) return candidateType; // not part of the remediation ladder

  const failedLevels = pastInterventions
    .filter((iv) => iv.outcome === 'NO_CHANGE' || iv.outcome === 'WORSENED')
    .map((iv) => ACTION_CATALOG[iv.actionType]?.escalationLevel ?? 0)
    .filter((level) => level > 0);
  const highestFailedLevel = failedLevels.length > 0 ? Math.max(...failedLevels) : 0;

  if (candidateLevel > highestFailedLevel) return candidateType; // hasn't failed at this level yet

  const nextRung = ESCALATION_LADDER.find((t) => ACTION_CATALOG[t].escalationLevel === highestFailedLevel + 1);
  return nextRung ?? ESCALATION_LADDER[ESCALATION_LADDER.length - 1];
}

/** Among a PREREQUISITE_GAP hypothesis's weak prerequisites, target the one with the highest bottleneck score. */
function pickBottleneckTarget(hypothesis: DiagnosisHypothesis, bottlenecks: BottleneckCandidate[]): SkillId {
  const prereqCandidates = hypothesis.affectedSkillIds.filter((id) => id !== hypothesis.skillId);
  if (prereqCandidates.length === 0) return hypothesis.skillId;
  const ranked = prereqCandidates
    .map((id) => bottlenecks.find((b) => b.skillId === id))
    .filter((b): b is BottleneckCandidate => !!b)
    .sort((a, b) => b.bottleneckScore - a.bottleneckScore);
  return ranked[0]?.skillId ?? prereqCandidates[0];
}

function goalRelevance(actionType: ActionType, goal: StudentGoal): number {
  const boosted = GOAL_BOOSTED_ACTIONS[goal] ?? [];
  return boosted.includes(actionType) ? 1.0 : 0.65;
}

function readinessImpact(isReadinessCritical: boolean, daysToAssessment: number | null): number {
  const urgency =
    daysToAssessment === null ? 0.5 : daysToAssessment <= 7 ? 1.0 : daysToAssessment <= 21 ? 0.8 : daysToAssessment <= 45 ? 0.65 : 0.5;
  return isReadinessCritical ? urgency : urgency * 0.8;
}

function buildReason(
  hypothesis: DiagnosisHypothesis,
  actionType: ActionType,
  isPrereqRepair: boolean,
  bottleneck?: BottleneckCandidate
): string {
  if (isPrereqRepair && bottleneck && bottleneck.downstreamWeakCount > 0) {
    return `${hypothesis.category} on "${hypothesis.skillId}" traces back to "${bottleneck.skillId}", which also sits under ${bottleneck.downstreamWeakCount} other currently weak skill(s).`;
  }
  return `${hypothesis.category} on "${hypothesis.skillId}" (confidence: ${hypothesis.confidence}) → ${actionType}.`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
