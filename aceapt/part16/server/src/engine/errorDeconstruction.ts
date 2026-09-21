import { SolutionStep } from '../types/evidence';
import { RootCause, ROOT_CAUSE_LABELS } from '../types/rootCause';
import { generateErrorFeedback } from '../llm/llmService';

export interface ErrorDeconstructionResult {
  steps: { stepNumber: number; description: string; correct: boolean }[];
  correctThroughStep: number;
  errorStep: { stepNumber: number; description: string } | null;
  why: string;
  howToAvoid: string;
  source: 'llm' | 'template' | 'none';
}

/**
 * Builds the "your approach -> correct step -> error point -> why -> how to
 * avoid" structure (Section 12). Only works when solution-step evidence
 * actually exists — Feature 16 never fabricates a step trace that wasn't
 * captured.
 */
export async function deconstructError(
  solutionPath: SolutionStep[] | undefined,
  rootCause: RootCause
): Promise<ErrorDeconstructionResult | null> {
  if (!solutionPath || solutionPath.length === 0) return null;

  const ordered = [...solutionPath].sort((a, b) => a.stepNumber - b.stepNumber);
  const errorStep = ordered.find((s) => !s.correct) ?? null;
  const correctThroughStep = errorStep ? errorStep.stepNumber - 1 : ordered[ordered.length - 1].stepNumber;

  if (!errorStep) {
    return {
      steps: ordered.map((s) => ({ stepNumber: s.stepNumber, description: s.description, correct: s.correct })),
      correctThroughStep,
      errorStep: null,
      why: 'Every captured step was correct.',
      howToAvoid: 'Nothing to correct in this solution path.',
      source: 'none',
    };
  }

  const feedback = await generateErrorFeedback({
    rootCauseLabel: ROOT_CAUSE_LABELS[rootCause],
    errorStepDescription: errorStep.description,
  });

  return {
    steps: ordered.map((s) => ({ stepNumber: s.stepNumber, description: s.description, correct: s.correct })),
    correctThroughStep,
    errorStep: { stepNumber: errorStep.stepNumber, description: errorStep.description },
    why: feedback.why,
    howToAvoid: feedback.howToAvoid,
    source: feedback.source,
  };
}
