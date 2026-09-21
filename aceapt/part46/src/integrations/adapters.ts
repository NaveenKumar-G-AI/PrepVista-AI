// Adapter ("port") interfaces for the ACEAPT systems Feature 46 is supposed
// to consume (sections 9-14, 45-49 of the spec). No such systems existed in
// this build environment, so each port below ships with a small mock/local
// implementation. Wire your real services in by implementing the same
// interface and swapping the instance in integrations/index.ts - nothing
// else in the codebase needs to change.

export interface SkillGraphPort {
  // Feature 45
  getPrerequisites(skill: string): Promise<string[]>;
  getStudentSkillState(
    studentId: string,
    skill: string
  ): Promise<{ mastery: "unknown" | "weak" | "developing" | "solid"; evidenceCount: number }>;
}

export interface DiagnosticsPort {
  // Feature 42
  getDiagnosticProfile(studentId: string, skill: string): Promise<{ accuracy: number | null; speed: "slow" | "average" | "fast" | null }>;
}

export interface AdaptiveAssessmentPort {
  // Feature 43
  getCurrentDifficulty(studentId: string, skill: string): Promise<"easy" | "medium" | "hard">;
}

export interface GoalsPort {
  // Feature 44
  getActiveGoal(studentId: string): Promise<{ prioritySkills: string[]; deadline: string | null } | null>;
}

export interface MistakeIntelligencePort {
  reportMistake(input: { studentId: string; skill: string; signal: string; occurrences: number }): Promise<void>;
}

export interface HintIntelligencePort {
  // Feature 48 owns formal hint escalation; Feature 46 only requests a level.
  // The local implementation below defers to domain/hintEscalation.ts so the
  // product works stand-alone until Feature 48 is wired in.
  describeLevel(level: number): string;
}

export interface MasteryPort {
  // Feature 36/37
  submitEvidence(input: {
    studentId: string;
    skill: string;
    independentSuccess: boolean;
    reasoningQuality: "none" | "guess" | "partial" | "strong";
    verificationSuccess: boolean;
  }): Promise<void>;
}

export interface LearningPathPort {
  submitPriorityUpdate(input: { studentId: string; skill: string; note: string }): Promise<void>;
}

export interface DailyMissionPort {
  notifySessionCompleted(input: { studentId: string; skill: string }): Promise<void>;
}

// --- Local mock/default implementations -------------------------------

export class MockSkillGraphAdapter implements SkillGraphPort {
  async getPrerequisites(): Promise<string[]> {
    return []; // TODO: replace with a real Feature 45 client call
  }
  async getStudentSkillState() {
    return { mastery: "unknown" as const, evidenceCount: 0 };
  }
}

export class MockDiagnosticsAdapter implements DiagnosticsPort {
  async getDiagnosticProfile() {
    return { accuracy: null, speed: null };
  }
}

export class MockAdaptiveAssessmentAdapter implements AdaptiveAssessmentPort {
  async getCurrentDifficulty() {
    return "medium" as const;
  }
}

export class MockGoalsAdapter implements GoalsPort {
  async getActiveGoal() {
    return null;
  }
}

export class LoggingMistakeIntelligenceAdapter implements MistakeIntelligencePort {
  async reportMistake(input: { studentId: string; skill: string; signal: string; occurrences: number }) {
    // TODO: replace with a real call into the existing Mistake Intelligence service.
    // Kept as a no-op-with-log so the engine works stand-alone.
    void input;
  }
}

export class LocalHintIntelligenceAdapter implements HintIntelligencePort {
  describeLevel(level: number): string {
    const labels = [
      "question only",
      "direction",
      "conceptual reminder",
      "strategic clue",
      "partial step",
      "detailed guidance",
      "worked explanation",
    ];
    return labels[Math.max(0, Math.min(6, level))];
  }
}

export class LoggingMasteryAdapter implements MasteryPort {
  async submitEvidence(input: Parameters<MasteryPort["submitEvidence"]>[0]) {
    // TODO: replace with a real call into Feature 36/37. Feature 46 must
    // never declare MASTERED itself (section 46) - it only hands off evidence.
    void input;
  }
}

export class LoggingLearningPathAdapter implements LearningPathPort {
  async submitPriorityUpdate(input: Parameters<LearningPathPort["submitPriorityUpdate"]>[0]) {
    void input;
  }
}

export class LoggingDailyMissionAdapter implements DailyMissionPort {
  async notifySessionCompleted(input: Parameters<DailyMissionPort["notifySessionCompleted"]>[0]) {
    void input;
  }
}
