import type { ProblemTemplate } from './types.js';
import { buildSpeedDistanceTimeProblem } from './speedDistanceTime.js';
import { buildProbabilityProblem } from './probability.js';
import { buildPercentageProblem } from './percentage.js';
import { buildAlgebraProblem } from './algebra.js';

/**
 * INTEGRATION SEAM (Sections 6-7, 61, 70): in real ACEAPT, this file would
 * not exist as an in-memory registry - it would be a thin adapter calling
 * the existing Question/Solution service and mapping its trusted solution
 * structure onto a ProblemTemplate. Every other module in this codebase
 * (the engine, the service layer, the API) depends only on `ProblemBankPort`
 * below, never on this in-memory implementation directly, so swapping it
 * out is a one-file change.
 */
export interface ProblemBankPort {
  getById(problemId: string): Promise<ProblemTemplate | null>;
  list(): Promise<Pick<ProblemTemplate, 'problemId' | 'type' | 'title' | 'promptText' | 'difficulty' | 'skill'>[]>;
}

export class InMemoryProblemBank implements ProblemBankPort {
  private readonly problems: Map<string, ProblemTemplate>;

  constructor() {
    const seeded = [buildSpeedDistanceTimeProblem(), buildProbabilityProblem(), buildPercentageProblem(), buildAlgebraProblem()];
    this.problems = new Map(seeded.map((p) => [p.problemId, p]));
  }

  async getById(problemId: string): Promise<ProblemTemplate | null> {
    return this.problems.get(problemId) ?? null;
  }

  async list() {
    return [...this.problems.values()].map(({ problemId, type, title, promptText, difficulty, skill }) => ({
      problemId,
      type,
      title,
      promptText,
      difficulty,
      skill,
    }));
  }
}

export * from './types.js';
