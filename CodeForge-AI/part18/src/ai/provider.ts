import { AIInterpretationInput, AIInterpretationOutput } from '../types';

export interface AIProvider {
  readonly name: string;
  interpret(input: AIInterpretationInput): Promise<AIInterpretationOutput>;
}
