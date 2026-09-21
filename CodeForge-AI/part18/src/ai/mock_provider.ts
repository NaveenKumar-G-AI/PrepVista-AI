import { AIProvider } from './provider';
import { AIInterpretationInput, AIInterpretationOutput } from '../types';

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };

/**
 * A template-based stand-in for a real LLM call. It ONLY rephrases/summarizes the
 * deterministic findings it's given — it does not perform real semantic reasoning, so
 * `semanticFindings` is intentionally left empty rather than inventing plausible-sounding
 * but unfounded claims. Swap this for GroqProvider/GeminiProvider once real credentials
 * and network access are available; the pipeline, schema validation, and injection
 * defenses are identical either way.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock-summarizer';

  async interpret(input: AIInterpretationInput): Promise<AIInterpretationOutput> {
    const top = [...input.deterministicFindings].sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)).slice(0, 3);

    const summary =
      top.length === 0
        ? 'No significant deterministic findings were raised — this submission looks solid on the checks this engine runs.'
        : `The most notable issue${top.length > 1 ? 's are' : ' is'}: ${top.map((f) => f.title.toLowerCase()).join('; ')}.`;

    return {
      summary,
      semanticFindings: [],
      recommendations: top.map((f) => f.suggestedAction),
      confidence: 'MEDIUM',
    };
  }
}
