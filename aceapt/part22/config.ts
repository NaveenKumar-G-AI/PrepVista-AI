// ACEAPT Pathfinder — configuration
//
// Everything below is intentionally left blank. Fill these in when wiring
// Feature 22 into real ACEAPT infrastructure. Nothing in engines/ reads
// these directly yet — they're here so the integration points are explicit
// and don't need to be invented later.

export const config = {
  database: {
    // Persistence for LearningGoal / PathGraph / PathVersion / PathDecision.
    connectionString: "",
  },
  eventBus: {
    // Real ACEAPT event bus endpoint (Section 47). The in-repo eventBus in
    // events.ts is an in-memory stand-in until this is set.
    url: "",
  },
  ai: {
    // Used ONLY for natural-language explanations ("Why this?" copy, weekly
    // summaries) per Section 48. Never used for scoring, thresholds, gates,
    // or state transitions — those stay deterministic.
    apiKey: "",
    model: "",
  },
  integrations: {
    // Existing ACEAPT intelligence services this feature orchestrates
    // (Section 6, 42) but does not reimplement.
    questionIntelligenceUrl: "",
    reasoningIntelligenceUrl: "",
    masteryTransferServiceUrl: "",
    retentionIntelligenceUrl: "",
    simulationIntelligenceUrl: "",
    diagnosisIntelligenceUrl: "",
    interventionIntelligenceUrl: "",
    feature21NextBestActionUrl: "", // Section 43
    feature20SimulationUrl: "", // Section 44
  },
  featureFlags: {
    enablePathCompression: true, // Section 32
    enablePathExpansion: true, // Section 33
    enableMaintenanceMode: true, // Section 35
  },
};
