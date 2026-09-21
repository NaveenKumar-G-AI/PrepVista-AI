// ============================================================
// ACTION CATALOG (spec §13, §14, §22)
// ============================================================

import { ActionDefinition, ActionType, DiagnosisCategory } from './types';

export const ACTION_CATALOG: Record<ActionType, ActionDefinition> = {
  LEARN: { type: 'LEARN', label: 'Learn the concept', baseDurationMinutes: 20, escalationLevel: 0, description: 'First introduction to a concept that has not been taught yet.' },
  RELEARN: { type: 'RELEARN', label: 'Micro-lesson', baseDurationMinutes: 12, escalationLevel: 3, description: 'A short, focused re-teaching aimed at a specific gap, not the whole topic.' },
  RECALL: { type: 'RECALL', label: 'Quick recall check', baseDurationMinutes: 3, escalationLevel: 1, description: 'A brief, low-stakes retrieval prompt to test whether the knowledge is still accessible.' },
  REACTIVATE: { type: 'REACTIVATE', label: 'Reactivation session', baseDurationMinutes: 5, escalationLevel: 2, description: 'A short session to refresh a decayed memory before it needs heavier relearning.' },
  PRACTICE: { type: 'PRACTICE', label: 'Guided practice', baseDurationMinutes: 15, escalationLevel: 4, description: 'Practice with step-level guidance, aimed at execution rather than concept understanding.' },
  TRANSFER: { type: 'TRANSFER', label: 'Novel-context questions', baseDurationMinutes: 10, escalationLevel: 0, description: 'Questions in an unfamiliar framing, to build — not just test — transfer.' },
  REASONING_DRILL: { type: 'REASONING_DRILL', label: 'Reasoning reconstruction', baseDurationMinutes: 12, escalationLevel: 4, description: 'Walks back through the reasoning chain to find exactly where it breaks down.' },
  MICRO_QUIZ: { type: 'MICRO_QUIZ', label: 'Micro quiz', baseDurationMinutes: 4, escalationLevel: 1, description: 'A handful of targeted questions used mainly to gather more evidence.' },
  CONTRASTIVE_PRACTICE: { type: 'CONTRASTIVE_PRACTICE', label: 'Contrastive practice', baseDurationMinutes: 10, escalationLevel: 4, description: 'Pairs look-alike questions side by side so the distinguishing feature becomes obvious.' },
  TIMED_PRACTICE: { type: 'TIMED_PRACTICE', label: 'Timed micro-drill', baseDurationMinutes: 15, escalationLevel: 0, description: 'Practice under a clock, aimed at the gap between untimed and timed performance.' },
  QUESTION_SELECTION_TRAINING: { type: 'QUESTION_SELECTION_TRAINING', label: 'Question-selection training', baseDurationMinutes: 15, escalationLevel: 0, description: 'Practice choosing which questions to attempt first under exam-like conditions.' },
  MOCK_TEST: { type: 'MOCK_TEST', label: 'Full mock test', baseDurationMinutes: 45, escalationLevel: 0, description: 'A complete timed simulation, for readiness checks close to an assessment.' },
  RECOVERY_SESSION: { type: 'RECOVERY_SESSION', label: 'Deep remediation', baseDurationMinutes: 30, escalationLevel: 5, description: 'A longer, structured session for gaps that have resisted lighter interventions.' },
  REVIEW: { type: 'REVIEW', label: 'Light review', baseDurationMinutes: 6, escalationLevel: 2, description: 'A short walkthrough with hints — one step up from a bare recall check.' },
  WAIT: { type: 'WAIT', label: 'No action needed', baseDurationMinutes: 0, escalationLevel: 0, description: 'Evidence does not support intervening right now.' },
  VERIFY: { type: 'VERIFY', label: 'Verification check', baseDurationMinutes: 3, escalationLevel: 0, description: 'Re-checks whether a previous intervention actually worked.' },
  RESTORE_PREREQUISITE: { type: 'RESTORE_PREREQUISITE', label: 'Repair prerequisite', baseDurationMinutes: 15, escalationLevel: 6, description: 'Targets the upstream skill directly, instead of practicing the symptom.' },
};

/**
 * Escalation ladder (spec §22), expressed using this catalog's action types.
 * The spec's own escalation example uses slightly different labels ("Hint",
 * "Guided practice", "Deep remediation", "Prerequisite investigation") than
 * its action list in §13 does. This is the mapping used to reconcile them —
 * flagged here rather than silently picked, since it's a judgement call:
 *   Level 1 Recall                      → RECALL
 *   Level 2 Hint                        → REVIEW
 *   Level 3 Micro lesson                → RELEARN
 *   Level 4 Guided practice             → PRACTICE / REASONING_DRILL / CONTRASTIVE_PRACTICE
 *   Level 5 Deep remediation            → RECOVERY_SESSION
 *   Level 6 Prerequisite investigation  → RESTORE_PREREQUISITE
 */
export const ESCALATION_LADDER: ActionType[] = ['RECALL', 'REVIEW', 'RELEARN', 'PRACTICE', 'RECOVERY_SESSION', 'RESTORE_PREREQUISITE'];

/**
 * Diagnosis category → action types most likely to help, ranked best-first
 * with an illustrative base "expected benefit" (0–1). This is a starting
 * point for actionScoring.ts's expected-benefit term (spec §40, §41) —
 * tune these against real before/after outcomes once they exist.
 */
export const PREFERRED_ACTIONS: Record<DiagnosisCategory, { type: ActionType; benefit: number }[]> = {
  CONCEPT_GAP: [{ type: 'LEARN', benefit: 0.95 }],
  CONCEPT_MISUNDERSTANDING: [{ type: 'RELEARN', benefit: 0.85 }],
  RETRIEVAL_WEAKNESS: [
    { type: 'RECALL', benefit: 0.9 },
    { type: 'REACTIVATE', benefit: 0.6 },
  ],
  RETENTION_DECAY: [
    { type: 'REACTIVATE', benefit: 0.85 },
    { type: 'RELEARN', benefit: 0.55 },
  ],
  PREREQUISITE_GAP: [{ type: 'RESTORE_PREREQUISITE', benefit: 0.95 }],
  TRANSFER_FAILURE: [
    { type: 'CONTRASTIVE_PRACTICE', benefit: 0.85 },
    { type: 'TRANSFER', benefit: 0.65 },
  ],
  REASONING_FAILURE: [{ type: 'REASONING_DRILL', benefit: 0.9 }],
  QUESTION_INTERPRETATION_FAILURE: [{ type: 'CONTRASTIVE_PRACTICE', benefit: 0.75 }],
  PROCEDURAL_ERROR: [{ type: 'PRACTICE', benefit: 0.8 }],
  CALCULATION_ERROR: [
    { type: 'MICRO_QUIZ', benefit: 0.4 },
    { type: 'REVIEW', benefit: 0.3 },
  ],
  CARELESS_ERROR: [{ type: 'WAIT', benefit: 0.2 }],
  TIME_EFFICIENCY_ISSUE: [{ type: 'TIMED_PRACTICE', benefit: 0.8 }],
  QUESTION_SELECTION_ISSUE: [{ type: 'QUESTION_SELECTION_TRAINING', benefit: 0.85 }],
  PRESSURE_PERFORMANCE_DEGRADATION: [
    { type: 'TIMED_PRACTICE', benefit: 0.9 },
    { type: 'MOCK_TEST', benefit: 0.5 },
  ],
  CONFIDENCE_CALIBRATION_ISSUE: [{ type: 'MICRO_QUIZ', benefit: 0.6 }],
  CONCEPT_INTERFERENCE: [{ type: 'CONTRASTIVE_PRACTICE', benefit: 0.9 }],
  INCONSISTENT_PERFORMANCE: [
    { type: 'MICRO_QUIZ', benefit: 0.5 },
    { type: 'VERIFY', benefit: 0.4 },
  ],
  INSUFFICIENT_EVIDENCE: [
    { type: 'MICRO_QUIZ', benefit: 0.55 },
    { type: 'VERIFY', benefit: 0.45 },
  ],
};
