/**
 * CodeForge AI — Submission System
 * DEMO/TEST ONLY. A fixed in-memory table of problems keyed by problemVersionId, so
 * tests and local runs have something real to evaluate against without a real problem
 * database. Production replaces this whole file with an implementation that queries
 * CodeForge's actual problems / test-suite-versions / checkers tables — see
 * ProblemDataResolver in problemDataResolver.ts, which is the only thing worker.ts
 * actually depends on.
 */
import type { ProblemDataResolver, ProblemTestData } from './problemDataResolver.js';

export class FixtureProblemDataResolver implements ProblemDataResolver {
  private readonly table = new Map<string, ProblemTestData>();

  register(problemVersionId: string, data: ProblemTestData): void {
    this.table.set(problemVersionId, data);
  }

  async resolve(input: { problemVersionId: string }): Promise<ProblemTestData> {
    const data = this.table.get(input.problemVersionId);
    if (!data) throw new Error(`FIXTURE_PROBLEM_NOT_FOUND: no fixture test data registered for problemVersionId ${input.problemVersionId}`);
    return data;
  }
}

/** A + B, the canonical judge smoke-test problem: read two ints, print their sum. */
export const AB_SUM_PYTHON: ProblemTestData = {
  publicCases: [
    { name: 'sample-1', input: '2 3\n', expectedOutput: '5\n' },
    { name: 'sample-2', input: '10 -4\n', expectedOutput: '6\n' },
  ],
  hiddenGroups: [
    { weight: 50, cases: [{ input: '100 200\n', expectedOutput: '300\n' }, { input: '0 0\n', expectedOutput: '0\n' }] },
    { weight: 50, cases: [{ input: '-5 -5\n', expectedOutput: '-10\n' }, { input: '999999 1\n', expectedOutput: '1000000\n' }] },
  ],
};
