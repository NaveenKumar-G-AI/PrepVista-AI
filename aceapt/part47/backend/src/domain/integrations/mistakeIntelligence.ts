/**
 * Port for ACEAPT's existing mistake intelligence system (Section 42).
 * Feature 47 REPORTS evidence here; it does not maintain its own mistake
 * taxonomy or storage (Section 42: "Do not build a separate mistake
 * ecosystem").
 */
export interface MistakeEvidence {
  studentId: string;
  problemId: string;
  stepId: string;
  skill: string;
  category: 'STRATEGY' | 'FORMULA' | 'CALCULATION' | 'UNIT' | 'INTERPRETATION' | 'LOGIC';
  recovered: boolean;
  context: string;
}

export interface MistakeIntelligencePort {
  recordMistake(evidence: MistakeEvidence): Promise<void>;
}

export class LoggingMistakeIntelligencePort implements MistakeIntelligencePort {
  async recordMistake(evidence: MistakeEvidence): Promise<void> {
    // INTEGRATION: forward to the real mistake-intelligence service instead.
    console.log('[mistake-intelligence:stub]', JSON.stringify(evidence));
  }
}
