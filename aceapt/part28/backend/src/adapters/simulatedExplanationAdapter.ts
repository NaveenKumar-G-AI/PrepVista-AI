// Contract-faithful stand-in for GroqExplanationAdapter, used in tests and
// the seed script so results are deterministic and the suite never depends
// on network access or a real API key.

import type { ExplanationAdapter } from './groqExplanationAdapter.js';
import { deterministicExplanation } from './groqExplanationAdapter.js';
import type { VerificationResult } from '../domain/types.js';

export class SimulatedExplanationAdapter implements ExplanationAdapter {
  async explain(result: VerificationResult): Promise<string> {
    return deterministicExplanation(result);
  }
}
