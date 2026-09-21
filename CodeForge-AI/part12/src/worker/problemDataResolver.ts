/**
 * CodeForge AI — Submission System
 * Integration seam to CodeForge's existing problem system and hidden test engine. This
 * module does not own test data — "the submission pipeline must integrate with the
 * existing public test engine... then integrate with the existing secure Hidden Test
 * Engine" (spec). worker.ts depends only on this interface; wiring in the real problem
 * system means implementing this once, here.
 */
import type { CheckerFn } from '../services/resultAggregation.js';

export interface PublicTestCase {
  name: string;
  input: string;
  expectedOutput: string;
}

export interface HiddenTestGroup {
  weight: number;
  cases: { input: string; expectedOutput: string }[];
}

export interface ProblemTestData {
  publicCases: PublicTestCase[];
  hiddenGroups: HiddenTestGroup[];
  checker?: CheckerFn;
}

export interface ProblemDataResolver {
  resolve(input: { problemId: string; problemVersionId: string; testSuiteVersionId: string; checkerVersionId: string }): Promise<ProblemTestData>;
}
