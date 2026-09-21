// ============================================================
// STUDENT STATE + FATIGUE (spec §17, §24)
//
// Deliberately coarse — this drives UI tone and session-length
// decisions, not diagnosis. Fatigue is read only from observable
// product signals (abandonment, rapid guessing); this module never
// infers or names a medical or psychological condition (spec §24).
// ============================================================

import { EvidenceItem, FatigueSignal, SkillDiagnosisReport, SimulationEvidence, SkillId, StudentState } from './types';

const FATIGUE_ABANDONMENT_THRESHOLD = 0.25;
const FATIGUE_GUESS_RATE_THRESHOLD = 0.35;
const FATIGUE_SESSION_CAP_MINUTES = 8;

export function estimateFatigue(evidenceBySkill: Map<SkillId, EvidenceItem[]>): FatigueSignal {
  const allSimulation = [...evidenceBySkill.values()].flat().filter((e): e is SimulationEvidence => e.type === 'SIMULATION');
  if (allSimulation.length === 0) {
    return { isFatigued: false, reasons: [], suggestedSessionCapMinutes: null };
  }

  const worstAbandonment = Math.max(...allSimulation.map((s) => s.sessionAbandonmentRate));
  const worstGuessRate = Math.max(...allSimulation.map((s) => s.rapidGuessRate));

  const reasons: string[] = [];
  if (worstAbandonment >= FATIGUE_ABANDONMENT_THRESHOLD) {
    reasons.push(`Session abandonment is elevated (${(worstAbandonment * 100).toFixed(0)}%).`);
  }
  if (worstGuessRate >= FATIGUE_GUESS_RATE_THRESHOLD) {
    reasons.push(`Rapid-guessing rate is elevated (${(worstGuessRate * 100).toFixed(0)}%).`);
  }

  return {
    isFatigued: reasons.length > 0,
    reasons,
    suggestedSessionCapMinutes: reasons.length > 0 ? FATIGUE_SESSION_CAP_MINUTES : null,
  };
}

const CONCEPT_LEVEL_CATEGORIES = new Set(['CONCEPT_GAP', 'PREREQUISITE_GAP', 'CONCEPT_MISUNDERSTANDING', 'PROCEDURAL_ERROR', 'REASONING_FAILURE']);
const EARLY_WARNING_CATEGORIES = new Set(['RETENTION_DECAY', 'RETRIEVAL_WEAKNESS']);

export function estimateStudentState(
  reports: SkillDiagnosisReport[],
  daysToAssessment: number | null,
  hasPendingIntervention: boolean,
  goalIsMaintenance: boolean
): StudentState {
  const primaryCategories = reports.flatMap((r) => (r.hypotheses[0] ? [r.hypotheses[0].category] : []));
  const hasEarlyWarning = primaryCategories.some((c) => EARLY_WARNING_CATEGORIES.has(c));
  const hasConceptLevelGap = primaryCategories.some((c) => CONCEPT_LEVEL_CATEGORIES.has(c));
  const cleanShare = reports.length === 0 ? 0 : reports.filter((r) => r.hypotheses.length === 0).length / reports.length;
  const mostlyClean = cleanShare >= 0.6;

  if (daysToAssessment !== null && daysToAssessment <= 7 && (hasConceptLevelGap || hasEarlyWarning)) return 'AT_RISK';
  if (hasPendingIntervention) return 'RECOVERING';
  if (hasEarlyWarning) return 'WEAKENING';
  if (hasConceptLevelGap) return 'PRACTICING';
  if (mostlyClean && goalIsMaintenance) return 'RETAINING';
  if (mostlyClean && daysToAssessment !== null && daysToAssessment <= 21) return 'READY';
  if (mostlyClean) return 'MASTERING';
  return 'LEARNING';
}
