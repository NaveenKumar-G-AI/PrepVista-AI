import type {
  PortRegistry,
  MistakeClassificationPort,
  SkillGraphPort,
  PersonalMistakeBankPort,
  ErrorPatternIntelligencePort,
  FormulaIntelligencePort,
  HintIntelligencePort,
  AntiMemorizationPort,
  SpeedTrainingPort
} from "../types/ports.js";
import type { AttemptRecord } from "../types/accuracy.js";
import type { ErrorType } from "../types/errorTaxonomy.js";
import { ERROR_TYPES } from "../types/errorTaxonomy.js";
import { detectErrorClusters } from "../domain/errorClassification.js";

export interface DefaultAdapterDeps {
  /** Injected rather than imported directly, so ports/ never depends on db/ — the composition root wires this. */
  fetchRecentAttempts: (studentId: string, skillId: string | null, limit: number) => Promise<AttemptRecord[]>;
}

const EXPECTED_TIME_MS_BY_DIFFICULTY: Record<"easy" | "medium" | "hard", number> = {
  easy: 20_000,
  medium: 40_000,
  hard: 70_000
};

/**
 * Every port below is a genuine seam for the real F13/14, F29, F30, F31,
 * F45, F48, F49, F50 services (§7, §76-83). Two of them (personal mistake
 * bank, error pattern intelligence) have REAL default logic backed by
 * Feature 51's own attempt history, because that data already exists here
 * and re-deriving it beats stubbing it. The rest are honest placeholders —
 * documented as such — since this standalone module has no skill graph,
 * formula bank, hint log, novelty tracker, or pacing model to call.
 */
export function createDefaultPorts(deps: DefaultAdapterDeps): PortRegistry {
  const mistakeClassification: MistakeClassificationPort = {
    // Placeholder only — a real system should never reach this in practice,
    // because the real Mistake Classification service (§76) should have
    // already stamped errorType onto the submission before it reaches F51.
    async classify({ isCorrect, stepResults }) {
      if (isCorrect) return null;
      if (stepResults && stepResults.length > 0) {
        const firstFailedIdx = stepResults.findIndex((s) => !s.correct);
        if (firstFailedIdx === stepResults.length - 1) {
          // only the last step failed → looks like an execution slip, not a conceptual gap
          return "CALCULATION_ERROR" satisfies ErrorType;
        }
      }
      return "UNKNOWN" satisfies ErrorType;
    }
  };

  const skillGraph: SkillGraphPort = {
    // Placeholder — §70/§25 root-cause chaining needs the real Aptitude
    // Skill Graph (F45); no graph data exists in this standalone module.
    async getRelated(_skillId: string) {
      return { prerequisites: [], downstream: [] };
    }
  };

  const personalMistakeBank: PersonalMistakeBankPort = {
    // Real logic: tallies this student's own recent error types (§78).
    async getRecentErrorTypeCounts(studentId, skillId, windowSize) {
      const attempts = await deps.fetchRecentAttempts(studentId, skillId, windowSize);
      const counts = Object.fromEntries(ERROR_TYPES.map((t) => [t, 0])) as Record<ErrorType, number>;
      for (const a of attempts) {
        if (!a.isCorrect && a.errorType) counts[a.errorType]++;
      }
      return counts;
    }
  };

  const errorPatternIntelligence: ErrorPatternIntelligencePort = {
    // Real logic: reuses domain.detectErrorClusters (§79) on the attempts given.
    async findCluster(recentErrors: AttemptRecord[]) {
      const skillId = recentErrors[0]?.skillId;
      if (!skillId) return null;
      const cluster = detectErrorClusters(skillId, recentErrors);
      if (!cluster) return null;
      return { clusterName: cluster.clusterId, memberErrorTypes: cluster.memberErrorTypes };
    }
  };

  const formulaIntelligence: FormulaIntelligencePort = {
    // Placeholder — §80 needs the real Formula Intelligence bank (F31).
    async getFormulaMeta(_skillId: string) {
      return null;
    }
  };

  const hintIntelligence: HintIntelligencePort = {
    // Placeholder — only used when a submission omits hintLevel (§73/F48).
    async resolveHintLevel() {
      return "independent";
    }
  };

  const antiMemorization: AntiMemorizationPort = {
    // Placeholder — only used when a submission omits isNovel (§74/F49).
    async resolveIsNovel() {
      return false;
    }
  };

  const speedTraining: SpeedTrainingPort = {
    // Placeholder pacing table — only used when a submission omits expectedTimeMs (§75/F50).
    async getExpectedTimeMs(_skillId, difficulty) {
      return EXPECTED_TIME_MS_BY_DIFFICULTY[difficulty];
    },
    async isUnderPressure() {
      return false;
    }
  };

  return {
    mistakeClassification,
    skillGraph,
    personalMistakeBank,
    errorPatternIntelligence,
    formulaIntelligence,
    hintIntelligence,
    antiMemorization,
    speedTraining
  };
}
