import { MisconceptionExperimentState } from "./types";

// Concrete, deterministic implementation of the "contradiction experiment"
// pattern described in section 27/130 of the spec, for the one misconception
// this build ships fully worked: "a percentage increase and an equal
// percentage decrease cancel out". Always anchors on base=100 for a clean
// mental model, regardless of the numbers in the student's actual problem -
// this mirrors the spec's own worked example.

function extractNumberLoose(text: string): number | null {
  const cleaned = (text || "").replace(/[₹$,]/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function startExperiment(percent: number): MisconceptionExperimentState {
  const safePercent = Number.isFinite(percent) && percent > 0 && percent < 100 ? percent : 20;
  return { misconceptionId: "percentage_increase_decrease_cancel", step: 0, base: 100, percent: safePercent };
}

export function currentPrompt(state: MisconceptionExperimentState): string {
  const afterIncrease = round2(state.base * (1 + state.percent / 100));
  switch (state.step) {
    case 0:
      return `Let's test that idea. Start with ${state.base}. What is the value after a ${state.percent}% increase?`;
    case 1:
      return `Now decrease ${afterIncrease} by ${state.percent}%. What do you get?`;
    case 2:
      return `So did we return to the original ${state.base}?`;
    default:
      return "What does that tell you about applying the same percentage increase and then decrease?";
  }
}

export interface ExperimentStepEvaluation {
  correct: boolean;
  advance: MisconceptionExperimentState;
  resolved: boolean;
  hint?: string;
}

export function evaluateStep(state: MisconceptionExperimentState, studentText: string): ExperimentStepEvaluation {
  const num = extractNumberLoose(studentText);
  const afterIncrease = state.base * (1 + state.percent / 100);
  const afterIncreaseDisplay = round2(afterIncrease);

  if (state.step === 0) {
    const expected = afterIncrease;
    const correct = num !== null && Math.abs(num - expected) < 0.5;
    return {
      correct,
      advance: correct ? { ...state, step: 1 } : state,
      resolved: false,
      hint: correct
        ? undefined
        : `Remember: a ${state.percent}% increase on ${state.base} means ${state.base} + ${state.percent}% of ${state.base}.`,
    };
  }

  if (state.step === 1) {
    const expected = afterIncrease * (1 - state.percent / 100);
    const correct = num !== null && Math.abs(num - expected) < 0.5;
    return {
      correct,
      advance: correct ? { ...state, step: 2 } : state,
      resolved: false,
      hint: correct ? undefined : `Take ${state.percent}% of ${afterIncreaseDisplay} and subtract it from ${afterIncreaseDisplay}.`,
    };
  }

  if (state.step === 2) {
    const saidNo = /\bno\b|not the same|didn'?t|different|lower|less/i.test(studentText);
    return { correct: saidNo, advance: { ...state, step: 3 }, resolved: false };
  }

  // Step 3: open reasoning question - the actual discovery moment.
  const understood = /base|different (number|amount|value)|changed|smaller (base|number|amount)|not the same/i.test(
    studentText
  );
  return { correct: understood, advance: state, resolved: understood };
}
