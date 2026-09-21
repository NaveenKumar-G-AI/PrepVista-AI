import { RootCauseCandidate } from './rootCause';

export type SignalStatus = 'ok' | 'warning' | 'fail' | 'unknown';

/** Maps directly onto the "Let's find what happened" student-facing panel (Section 44). */
export interface DiagnosticUiPanel {
  conceptStatus: SignalStatus;
  methodStatus: SignalStatus;
  calculationStatus: SignalStatus;
  likelyIssueLabel: string;
}

export interface Diagnosis {
  attemptId: string;
  studentId: string;
  skillId: string;
  primary: RootCauseCandidate;
  secondary: RootCauseCandidate[];
  isMultiFactor: boolean;
  insufficientEvidence: boolean;
  uiPanel: DiagnosticUiPanel;
  createdAt: string;
}
