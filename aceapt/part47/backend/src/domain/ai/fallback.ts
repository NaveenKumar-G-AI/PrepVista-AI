import type { AssistanceIssueType, StepTemplate } from '../problemBank/types.js';
import type { AiGuidanceOutput } from './outputSchema.js';

const ISSUE_FRAMING: Record<AssistanceIssueType, string> = {
  CONCEPT: 'Think about what this step is actually asking for before reaching for numbers.',
  STRATEGY: 'Focus on choosing the right approach first - the calculation comes after.',
  FORMULA: 'Focus on which relationship or formula connects the values you have.',
  CALCULATION: 'Your approach looks right - slow down on the arithmetic itself.',
  INTERPRETATION: 'Look again at which value in the problem statement goes where.',
  UNIT: 'Check the unit you are expressing this in, not just the number.',
  LOGIC: 'Re-check the constraints you are applying here.',
  VERIFICATION: "Try checking your result against the problem statement - does it make sense?",
};

/**
 * Pre-authored, deterministic guidance used whenever AI is unavailable
 * (no key configured, network failure, timeout, or invalid AI output).
 * Section 66 is explicit: "never display fake AI responses" - this returns
 * a real, useful, author-written message, clearly distinguishable in
 * telemetry as `source: 'DETERMINISTIC_FALLBACK'` (see services layer).
 */
export function buildFallbackGuidance(input: {
  action: 'GUIDE_STEP' | 'EXPLAIN_STEP' | 'GIVE_HINT';
  step: StepTemplate;
  helpLevel: number;
  targetIssue?: AssistanceIssueType;
}): AiGuidanceOutput {
  const ladder = input.step.hintLadder;
  const hintIndex = Math.min(Math.max(input.helpLevel - 1, 0), ladder.length - 1);

  let message: string;
  if (input.action === 'EXPLAIN_STEP') {
    message = input.step.explanation;
  } else if (ladder.length > 0) {
    const framing = input.targetIssue ? ISSUE_FRAMING[input.targetIssue] : undefined;
    message = framing ? `${framing} ${ladder[hintIndex]}` : ladder[hintIndex] ?? input.step.explanation;
  } else {
    message = input.targetIssue ? ISSUE_FRAMING[input.targetIssue] : input.step.explanation;
  }

  return {
    action: input.action,
    stepId: input.step.stepId,
    message,
    helpLevel: input.helpLevel,
    targetSkill: input.step.skill,
    targetIssue: input.targetIssue,
  };
}
