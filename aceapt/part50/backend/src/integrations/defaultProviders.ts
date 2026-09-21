import { IntegrationProviders } from './types';

/**
 * Conservative, "fail-safe" default adapters.
 *
 * Every method here returns "I don't know" (null / empty / false) rather
 * than a guessed value, so the rest of Feature 50 never has to distinguish
 * "real data says X" from "a placeholder made X up". Replace each of these
 * with a real call into Features 42/43 (difficulty), 44 (goals), 45 (skill
 * graph), 47 (guided solving), 48 (hints), 49 (novelty), the mastery /
 * readiness services, and your auth/role service, once this module is
 * wired into the main ACEAPT backend. Nothing else needs to change - every
 * consumer of this object only depends on the interfaces in ./types.ts.
 */
export const defaultIntegrationProviders: IntegrationProviders = {
  difficulty: {
    async getExpectedTimeMs() {
      return null; // no calibrated data - callers fall back to the student's own baseline
    },
  },
  mastery: {
    async getMasteryLevel() {
      return null; // unknown mastery - callers avoid aggressive speed pressure
    },
  },
  goals: {
    async getActiveGoal() {
      return null;
    },
  },
  skillGraph: {
    async getRelatedFoundationalSkills() {
      return [];
    },
  },
  novelty: {
    async getNoveltyLevel() {
      return null;
    },
  },
  guidedSolving: {
    async getStageTimings() {
      return null; // no step-level instrumentation - analysis falls back to total response time
    },
  },
  hints: {
    async getHintLevel() {
      return 0;
    },
  },
  readiness: {
    async reportSpeedSignal() {
      // no-op until wired to the real readiness service
    },
  },
  authorization: {
    async canViewCohortAnalytics() {
      return false; // fail closed until a real role check is wired in
    },
  },
};
