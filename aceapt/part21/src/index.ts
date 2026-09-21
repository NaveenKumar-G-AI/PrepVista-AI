// ============================================================
// PUBLIC API
//
// What a real ACEAPT backend should import. Everything else in
// this package is an implementation detail reachable through here.
// ============================================================

export { runDiagnosisAndNextBestAction, runDiagnosisAndNextBestActionWithLLM, explainTopBottleneck } from './orchestrator';
export { MockUpstreamBundle } from './upstreamAdapters';
export type {
  UpstreamEvidenceProvider,
  Feature13Readiness,
  Feature14MasteryTransfer,
  Feature15LearningJourney,
  Feature16InterventionRecovery,
  Feature17QuestionIntelligence,
  Feature18ReasoningIntelligence,
  Feature19Retention,
  Feature20SimulationPressure,
  MockDataset,
  StudentFixture,
} from './upstreamAdapters';
export { explainPrimaryAction, explainRootCauseInsight, explainVerifiedIntervention, explainEscalation, enhanceWithLLM } from './explanationGenerator';
export { getVerifiedHistory, recordPendingIntervention } from './interventionMemory';
export * from './types';
