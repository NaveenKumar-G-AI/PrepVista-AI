import type { AdminSnapshot, Anomaly, CalibrationCenterSummary, HistoryEntry, StudentDifficultyResponse } from '../lib/api.js';

export const mockSummary: CalibrationCenterSummary = {
  total: 13,
  calibrated: 8,
  provisional: 3,
  stale: 0,
  needs_review: 0,
  insufficient_data: 1,
  openAnomalies: 5,
};

export const mockAdminSnapshot: AdminSnapshot = {
  id: 'mock-snapshot-1',
  question_version_id: '3fa479ae-9323-4a15-96ce-e55a56746571',
  mode: 'OVERALL',
  estimate: '0.82',
  facility: '0.18',
  ci_low: '0.10',
  ci_high: '0.29',
  sample_size: 60,
  confidence: 'MEDIUM',
  category: 'HARD',
  status: 'CALIBRATED',
  source: 'EMPIRICAL',
  median_time_ms: 104000,
  discrimination: '0.34',
  label_mismatch: true,
  initial_category: 'EASY',
  calibrated_at: new Date().toISOString(),
};

export const mockHistory: HistoryEntry[] = [
  {
    id: 'h1',
    fieldChanged: 'category',
    oldValue: 'EASY',
    newValue: 'HARD',
    reason: 'empirical_evidence_diverged_from_initial_label',
    actor: 'SYSTEM',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'h2',
    fieldChanged: 'status',
    oldValue: 'PROVISIONAL',
    newValue: 'CALIBRATED',
    reason: 'recalibration',
    actor: 'SYSTEM',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const mockAnomalies: Anomaly[] = [
  {
    id: 'a1',
    question_version_id: '3fa479ae-9323-4a15-96ce-e55a56746571',
    type: 'LABEL_MISMATCH',
    severity: 'MEDIUM',
    details: { note: 'Author labeled Easy; empirical evidence places it at Hard.' },
    status: 'OPEN',
    detected_at: new Date().toISOString(),
  },
  {
    id: 'a2',
    question_version_id: 'fabd4ce7-b5cf-4f31-acf3-454e122f84a8',
    type: 'TOO_HARD',
    severity: 'MEDIUM',
    details: { note: 'Investigate: may be genuinely difficult, a prerequisite gap, or invalid.' },
    status: 'OPEN',
    detected_at: new Date().toISOString(),
  },
  {
    id: 'a3',
    question_version_id: 'c847177e-05d5-4bdc-8926-addf30cba6ac',
    type: 'DIFFICULTY_DRIFT',
    severity: 'HIGH',
    details: { note: 'Statistically significant shift vs. baseline — check validity and population stability.' },
    status: 'OPEN',
    detected_at: new Date().toISOString(),
  },
];

export const mockStudentEasy: StudentDifficultyResponse = {
  questionVersionId: 'q-easy',
  category: 'EASY',
  recommended: true,
  personalChallenge: 'BELOW_LEVEL',
};

export const mockStudentStretch: StudentDifficultyResponse = {
  questionVersionId: 'q-stretch',
  category: 'HARD',
  recommended: true,
  personalChallenge: 'STRETCH',
};

export const mockStudentAtLevel: StudentDifficultyResponse = {
  questionVersionId: 'q-at-level',
  category: 'MEDIUM',
  recommended: false,
  provisional: true,
  personalChallenge: 'AT_LEVEL',
};
