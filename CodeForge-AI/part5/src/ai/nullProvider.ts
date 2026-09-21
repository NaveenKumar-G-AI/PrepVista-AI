import type { AIProvider } from './types.js';

/** Default provider when AI_PROVIDER is unset or 'none'. Deterministic logic handles everything. */
export class NullProvider implements AIProvider {
  readonly name = 'none';
  async generateLearningObjective(_ctx: Parameters<AIProvider['generateLearningObjective']>[0]): Promise<string | null> { return null; }
  async interpretAmbiguousEvidence(_ctx: Parameters<AIProvider['interpretAmbiguousEvidence']>[0]): Promise<{ interpretation: string; recommendedAction: string } | null> { return null; }
  async explainFeedback(_ctx: Parameters<AIProvider['explainFeedback']>[0]): Promise<string | null> { return null; }
}
