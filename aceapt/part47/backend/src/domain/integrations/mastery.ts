/**
 * Port for Feature 36/37 - Mastery (Sections 82-83). Feature 47 produces
 * EVIDENCE; it never computes or overwrites a mastery score itself
 * (Section 82: "Do not create a competing mastery engine").
 */
export interface MasteryEvidence {
  studentId: string;
  skill: string;
  independent: boolean;
  recoveredWithGuidance: boolean;
  solutionRevealed: boolean;
  verificationSuccess?: boolean;
}

export interface MasteryPort {
  recordEvidence(evidence: MasteryEvidence): Promise<void>;
}

export class LoggingMasteryPort implements MasteryPort {
  async recordEvidence(evidence: MasteryEvidence): Promise<void> {
    // INTEGRATION: forward to the real mastery engine instead.
    console.log('[mastery:stub]', JSON.stringify(evidence));
  }
}
