// ============================================================
// FEATURE 4 INTEGRATION SEAM  (spec section 40)
// ============================================================
// Feature 9 never edits the mastery path directly - it only forwards
// structured evidence, e.g. "simulation_signal: DATA_INTERPRETATION_
// PERFORMANCE_WEAK". Feature 4 decides whether/how to act on it.

export interface Feature4Client {
  submitMasteryPathSignal(
    studentId: string,
    simulationSignal: string,
    evidence: Record<string, unknown>,
  ): Promise<void>;
}

export class MockFeature4Client implements Feature4Client {
  private signals: Array<{ studentId: string; simulationSignal: string; evidence: Record<string, unknown> }> = [];

  async submitMasteryPathSignal(
    studentId: string,
    simulationSignal: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    this.signals.push({ studentId, simulationSignal, evidence });
  }

  getSignals() {
    return this.signals;
  }
}
