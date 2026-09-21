/**
 * Mistake Intelligence integration seam (sec. 52, 145, 202). Lets Feature 57
 * ask "was this a strategy-selection error, or an arithmetic/formula error
 * inside an otherwise-correct strategy choice?" so shortcut evidence isn't
 * blamed for an unrelated mistake.
 */
export type MistakeCategory = 'STRATEGY_MISUSE' | 'FORMULA_ERROR' | 'CALCULATION_ERROR' | 'INTERPRETATION_ERROR' | 'UNKNOWN';

export interface MistakeIntelligenceClient {
  classifyMistake(usageId: string): Promise<MistakeCategory>;
}

export class StubMistakeIntelligenceClient implements MistakeIntelligenceClient {
  async classifyMistake(_usageId: string): Promise<MistakeCategory> {
    return 'UNKNOWN';
  }
}
