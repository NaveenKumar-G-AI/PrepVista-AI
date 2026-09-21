import {
  AdaptiveAssessmentPort,
  DailyMissionPort,
  DiagnosticsPort,
  GoalsPort,
  HintIntelligencePort,
  LearningPathPort,
  LoggingDailyMissionAdapter,
  LoggingLearningPathAdapter,
  LoggingMasteryAdapter,
  LoggingMistakeIntelligenceAdapter,
  LocalHintIntelligenceAdapter,
  MasteryPort,
  MistakeIntelligencePort,
  MockAdaptiveAssessmentAdapter,
  MockDiagnosticsAdapter,
  MockGoalsAdapter,
  MockSkillGraphAdapter,
  SkillGraphPort,
} from "./adapters";

export interface IntegrationBundle {
  skillGraph: SkillGraphPort;
  diagnostics: DiagnosticsPort;
  adaptiveAssessment: AdaptiveAssessmentPort;
  goals: GoalsPort;
  mistakeIntelligence: MistakeIntelligencePort;
  hintIntelligence: HintIntelligencePort;
  mastery: MasteryPort;
  learningPath: LearningPathPort;
  dailyMission: DailyMissionPort;
}

// Single place to wire real ACEAPT services in later. Replace any line below
// with your real client and nothing else in the codebase needs to change.
export function buildIntegrationBundle(): IntegrationBundle {
  return {
    skillGraph: new MockSkillGraphAdapter(),
    diagnostics: new MockDiagnosticsAdapter(),
    adaptiveAssessment: new MockAdaptiveAssessmentAdapter(),
    goals: new MockGoalsAdapter(),
    mistakeIntelligence: new LoggingMistakeIntelligenceAdapter(),
    hintIntelligence: new LocalHintIntelligenceAdapter(),
    mastery: new LoggingMasteryAdapter(),
    learningPath: new LoggingLearningPathAdapter(),
    dailyMission: new LoggingDailyMissionAdapter(),
  };
}
