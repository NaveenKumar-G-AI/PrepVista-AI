// ============================================================
// ORCHESTRATOR (spec: "THE BIG TRANSFORMATION", §33)
//
// The single entry point: evidence → diagnosis → priority
// calculation → best action → (later, once the student acts)
// measurement → diagnosis update. This file does not implement
// any diagnosis or scoring logic itself — it only wires together
// upstreamAdapters, diagnosisEngine, rootCauseGraph, actionScoring,
// studentState, and explanationGenerator in the right order.
// ============================================================

import { UpstreamEvidenceProvider } from './upstreamAdapters';
import { diagnoseSkill } from './diagnosisEngine';
import { computeBottlenecks, WeakSkillInput } from './rootCauseGraph';
import { rankActions } from './actionScoring';
import { estimateFatigue, estimateStudentState } from './studentState';
import { explainPrimaryAction, explainRootCauseInsight, enhanceWithLLM } from './explanationGenerator';
import { loadPastInterventionsBySkill, recentActionTypes } from './interventionMemory';
import { ACTION_CATALOG } from './actionCatalog';
import {
  BottleneckCandidate,
  EvidenceItem,
  NextBestActionResult,
  ScoredAction,
  Skill,
  SkillDiagnosisReport,
  SkillId,
  StudentId,
} from './types';

const WEAK_MASTERY_THRESHOLD = 0.6;

export function runDiagnosisAndNextBestAction(
  provider: UpstreamEvidenceProvider,
  studentId: StudentId,
  skillIdsInScope: SkillId[]
): NextBestActionResult {
  const student = provider.getStudent(studentId);
  const allSkills = provider.getSkillGraph();
  const skillNames = new Map(allSkills.map((s) => [s.id, s.name] as const));

  // ---- 1. Gather evidence for every in-scope skill, plus their
  // prerequisites (needed to evaluate PREREQUISITE_GAP correctly even
  // when a prerequisite itself isn't being actively diagnosed today). ----
  const relevantSkillIds = expandWithPrerequisites(skillIdsInScope, allSkills);
  const evidenceBySkill = new Map<SkillId, EvidenceItem[]>();
  const masteryBySkill = new Map<SkillId, number>();

  for (const skillId of relevantSkillIds) {
    const evidence: EvidenceItem[] = [
      ...provider.getAttempts(studentId, skillId),
      ...provider.getReasoningTraces(studentId, skillId),
    ];
    const mastery = provider.getMastery(studentId, skillId);
    if (mastery) {
      evidence.push(mastery);
      masteryBySkill.set(skillId, mastery.masteryLevel); // only ever set from real data — see upstreamAdapters.ts
    }
    const retention = provider.getRetentionSignal(studentId, skillId);
    if (retention) evidence.push(retention);
    const transfer = provider.getTransfer(studentId, skillId);
    if (transfer) evidence.push(transfer);
    const simulation = provider.getSimulationSignal(studentId, skillId);
    if (simulation) evidence.push(simulation);

    evidenceBySkill.set(skillId, evidence);
  }

  // ---- 2. Diagnose every actively-in-scope skill (not the prerequisite-only ones). ----
  const diagnosisReports: SkillDiagnosisReport[] = skillIdsInScope.map((skillId) =>
    diagnoseSkill(skillId, evidenceBySkill.get(skillId) ?? [], allSkills, masteryBySkill)
  );

  // ---- 3. Root-cause / bottleneck analysis over everything with real,
  // currently-weak evidence (spec §6, §7, §12). ----
  const weakSkills: WeakSkillInput[] = [...masteryBySkill.entries()]
    .filter(([, level]) => level < WEAK_MASTERY_THRESHOLD)
    .map(([skillId, masteryLevel]) => ({ skillId, masteryLevel }));
  const bottlenecks: BottleneckCandidate[] = computeBottlenecks(weakSkills, allSkills);

  // ---- 4. Readiness, history, fatigue, state. ----
  const readinessCriticalSkillIds = new Set(
    skillIdsInScope.filter((id) => provider.getReadinessSignal(studentId, id).isReadinessCritical)
  );
  const pastInterventionsBySkill = loadPastInterventionsBySkill(provider, studentId, skillIdsInScope);
  const recent = recentActionTypes(pastInterventionsBySkill);
  const fatigue = estimateFatigue(evidenceBySkill);
  const hasPendingIntervention = [...pastInterventionsBySkill.values()].flat().some((iv) => iv.outcome === 'PENDING');
  const daysToAssessment = daysUntil(student.targetAssessmentDate);
  const studentState = estimateStudentState(diagnosisReports, daysToAssessment, hasPendingIntervention, student.goal === 'MAINTAIN_MASTERY');

  // ---- 5. Rank next-best-actions. ----
  let rankedActions: ScoredAction[] = rankActions({
    student,
    diagnosisReports,
    bottlenecks,
    readinessCriticalSkillIds,
    pastInterventionsBySkill,
    recentActionTypes: recent,
  });

  // Fatigue nudges toward shorter actions today (spec §24–§25) — a soft
  // penalty folded back into the same score used for sorting, not a hard
  // cutoff. That keeps the list honestly ranked: fatigue can tip a close
  // call, but shouldn't bury a much higher-value finding under a trivial
  // one just because the trivial one is a few minutes shorter.
  if (fatigue.isFatigued && fatigue.suggestedSessionCapMinutes !== null) {
    const cap = fatigue.suggestedSessionCapMinutes;
    rankedActions = rankedActions
      .map((a) => (a.action.baseDurationMinutes > cap ? { ...a, score: a.score * 0.7 } : a))
      .sort((a, b) => b.score - a.score);
  }

  const primaryAction = rankedActions[0] ?? null;
  const primaryReport = primaryAction ? diagnosisReports.find((r) => r.skillId === primaryAction.originSkillId) : undefined;
  const primaryExplanation = primaryAction && primaryReport ? explainPrimaryAction(primaryAction, primaryReport) : 'Nothing urgent right now — evidence looks stable across the skills we checked.';

  const recoveryPath = buildRecoveryPath(primaryAction);

  return {
    student,
    generatedAt: new Date().toISOString(),
    studentState,
    fatigue,
    diagnosisReports,
    bottlenecks,
    rankedActions,
    primaryAction,
    primaryExplanation,
    recoveryPath,
    timelineEntry: {
      date: new Date().toISOString().slice(0, 10),
      summary: primaryAction
        ? `Recommended "${primaryAction.action.label}" for "${primaryAction.targetSkillId}" (${primaryAction.diagnosisCategory}).`
        : 'No action needed today.',
    },
  };
}

/** Same as above, plus an LLM-enhanced primaryExplanation when ANTHROPIC_API_KEY/ANTHROPIC_MODEL are configured. */
export async function runDiagnosisAndNextBestActionWithLLM(
  provider: UpstreamEvidenceProvider,
  studentId: StudentId,
  skillIdsInScope: SkillId[]
): Promise<NextBestActionResult> {
  const result = runDiagnosisAndNextBestAction(provider, studentId, skillIdsInScope);
  const enhanced = await enhanceWithLLM(result.primaryExplanation, result.student.name);
  return { ...result, primaryExplanation: enhanced };
}

/** Builds the "why this skill, not that one" narrative for the top bottleneck, if any (spec §1). */
export function explainTopBottleneck(result: NextBestActionResult, allSkills: Skill[]): string | null {
  const top = result.bottlenecks.find((b) => b.bottleneckScore > 0);
  if (!top) return null;
  const skillNames = new Map(allSkills.map((s) => [s.id, s.name] as const));
  return explainRootCauseInsight(top, skillNames);
}

function buildRecoveryPath(primary: ScoredAction | null): ScoredAction[] | null {
  if (!primary || !primary.isPrerequisiteRepair) return null;
  const verifyStep: ScoredAction = {
    action: ACTION_CATALOG.VERIFY,
    originSkillId: primary.originSkillId,
    targetSkillId: primary.originSkillId,
    isPrerequisiteRepair: false,
    score: primary.score * 0.9,
    scoreBreakdown: { ...primary.scoreBreakdown, timeCostMinutes: ACTION_CATALOG.VERIFY.baseDurationMinutes },
    reason: `Once "${primary.targetSkillId}" improves, re-check "${primary.originSkillId}" directly rather than assuming the fix transferred on its own.`,
    diagnosisCategory: primary.diagnosisCategory,
  };
  return [primary, verifyStep];
}

function expandWithPrerequisites(skillIds: SkillId[], allSkills: Skill[]): SkillId[] {
  const bySkillId = new Map(allSkills.map((s) => [s.id, s] as const));
  const seen = new Set(skillIds);
  let frontier = [...skillIds];
  while (frontier.length > 0) {
    const next: SkillId[] = [];
    for (const id of frontier) {
      const skill = bySkillId.get(id);
      if (!skill) continue;
      for (const prereqId of skill.prerequisiteIds) {
        if (!seen.has(prereqId)) {
          seen.add(prereqId);
          next.push(prereqId);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
