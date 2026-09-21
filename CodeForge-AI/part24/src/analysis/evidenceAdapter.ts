/**
 * Integration seams for CodeForge's EXISTING analysis engines.
 *
 * Code Review Mode must not reimplement Feature 16 (Correctness), Feature 17
 * (Complexity) or Feature 18 (Code Quality) — this file defines the
 * interfaces those engines are consumed through. When this module is wired
 * into the real CodeForge repository, implement these interfaces with real
 * calls into the existing services and pass them into generateFindings();
 * nothing else in the review engine needs to change.
 *
 * No implementation here fabricates evidence. If a provider is not supplied,
 * the corresponding evidence category is simply skipped (see findingEngine.ts)
 * rather than guessed at.
 */

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
}

export interface CorrectnessEvidenceData {
  allPassed: boolean;
  failing: TestResult[];
  regression: TestResult[];
}

export interface ComplexityEvidenceData {
  before?: { cyclomatic: number; bigO: string };
  after: { cyclomatic: number; bigO: string };
}

export interface QualityFindingData {
  rule: string;
  message: string;
  file: string;
  startLine: number;
  endLine: number;
}

export interface CorrectnessEvidenceProvider {
  getResult(revisionId: string): Promise<CorrectnessEvidenceData | null>;
}

export interface ComplexityEvidenceProvider {
  getResult(revisionId: string, file: string): Promise<ComplexityEvidenceData | null>;
}

export interface QualityEvidenceProvider {
  getResult(revisionId: string): Promise<QualityFindingData[]>;
}

export interface EvidenceProviders {
  correctness?: CorrectnessEvidenceProvider;
  complexity?: ComplexityEvidenceProvider;
  quality?: QualityEvidenceProvider;
}
