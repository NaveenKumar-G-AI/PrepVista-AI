import { Difficulty, ErrorCategory, QuestionType } from "../domain/enums";
import { DifficultyProfile, Hint, QuestionExplanation, QuestionOption } from "../domain/types";
import { baseDifficultyProfile, baseExpectedTimeSeconds } from "./difficultyProfiles";
import { buildNumericOptions, fmtCurrency, fmtNumber, fmtPercent, pick, randInt, round2 } from "./templateUtils";
import { h } from "./hintHelper";

export interface RenderedTemplate {
  prompt: string;
  options: QuestionOption[];
  correctValue: number;
  explanation: QuestionExplanation;
  hints: Hint[];
  commonMisconceptions: string[];
}

export interface QuestionTemplate {
  id: string;
  skillId: string;
  questionType: QuestionType;
  cognitiveDemand: "RECALL" | "APPLICATION" | "ANALYSIS" | "TRANSFER";
  tags: string[];
  supportedDifficulties: Difficulty[];
  difficultyProfile: (target: Difficulty) => DifficultyProfile;
  expectedTimeSeconds: (target: Difficulty) => number;
  render: (target: Difficulty) => RenderedTemplate;
}

// ---------------------------------------------------------------------------
// SK_PCT_BASIC
// ---------------------------------------------------------------------------

const T_PCT_OF_NUMBER: QuestionTemplate = {
  id: "T_PCT_OF_NUMBER",
  skillId: "SK_PCT_BASIC",
  questionType: QuestionType.CONCEPT_CHECK,
  cognitiveDemand: "RECALL",
  tags: ["percentage", "foundation"],
  supportedDifficulties: [Difficulty.FOUNDATION, Difficulty.EASY],
  difficultyProfile: (t) => baseDifficultyProfile(t),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t),
  render: (target) => {
    const pct = target === Difficulty.FOUNDATION ? pick([10, 20, 25, 50]) : pick([15, 20, 30, 40, 45]);
    const base = 20 * randInt(target === Difficulty.FOUNDATION ? 2 : 3, target === Difficulty.FOUNDATION ? 10 : 30);
    const correct = (pct * base) / 100;

    const options = buildNumericOptions(correct, [
      { value: pct === 10 ? base * 0.2 : base / 10, misconception: ErrorCategory.PROCEDURAL_ERROR, note: "This uses a flat 10% shortcut instead of the actual percentage asked for." },
      { value: base + pct, misconception: ErrorCategory.CONCEPT_GAP, note: "This adds the percentage value straight to the number instead of taking a percentage of it." },
      { value: correct / 10, misconception: ErrorCategory.CALCULATION_ERROR, note: "The decimal point looks like it slipped one place." },
    ]);

    return {
      prompt: `What is ${fmtPercent(pct)} of ${base}?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `${fmtPercent(pct)} means ${pct} per 100. So ${fmtPercent(pct)} of ${base} = (${pct}/100) × ${base} = ${fmtNumber(correct)}.`,
        efficientApproach: `Convert the percentage to a decimal (${pct}/100 = ${round2(pct / 100)}) and multiply once.`,
        shortcut: pct % 10 === 0 ? `10% of ${base} is ${round2(base / 10)}, so ${fmtPercent(pct)} is just ${pct / 10} times that.` : undefined,
      },
      hints: [
        h(1, "Direction", "Remember what 'percent' literally means."),
        h(2, "Concept", "'Percent' means 'per hundred' — X% of Y is (X/100) × Y."),
        h(3, "Step", `Convert ${fmtPercent(pct)} to a decimal: ${pct}/100 = ${round2(pct / 100)}.`),
        h(4, "Structured solution", `Multiply: ${round2(pct / 100)} × ${base} = ?`),
        h(5, "Complete explanation", `${fmtPercent(pct)} of ${base} = (${pct}/100) × ${base} = ${fmtNumber(correct)}.`),
      ],
      commonMisconceptions: ["Adding the percentage value instead of multiplying", "Defaulting to a 10% shortcut regardless of the actual percentage"],
    };
  },
};

const T_PCT_CHANGE: QuestionTemplate = {
  id: "T_PCT_CHANGE",
  skillId: "SK_PCT_BASIC",
  questionType: QuestionType.STANDARD_PRACTICE,
  cognitiveDemand: "APPLICATION",
  tags: ["percentage", "percentage-change"],
  supportedDifficulties: [Difficulty.EASY, Difficulty.EASY_PLUS],
  difficultyProfile: (t) => baseDifficultyProfile(t),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t),
  render: (target) => {
    const pct = pick(target === Difficulty.EASY ? [10, 20, 25, 50] : [5, 15, 30, 40]);
    const a = 20 * randInt(2, 25);
    const b = a + (a * pct) / 100;
    const correct = pct;

    const options = buildNumericOptions(correct, [
      { value: ((b - a) / b) * 100, misconception: ErrorCategory.CONCEPT_GAP, note: "This divides by the new (final) value instead of the original value." },
      { value: (b / a) * 100, misconception: ErrorCategory.PROCEDURAL_ERROR, note: "This is the ratio of new to old, not the percentage increase." },
      { value: correct - 5 < 1 ? correct + 5 : correct - 5, misconception: ErrorCategory.CALCULATION_ERROR, note: "The subtraction or division looks slightly off." },
    ]);

    return {
      prompt: `A quantity increased from ${a} to ${b}. What is the percentage increase?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `Percentage increase = (increase in value / original value) × 100 = ((${b} − ${a}) / ${a}) × 100 = ${fmtPercent(correct)}.`,
        efficientApproach: "Always divide by the ORIGINAL value, never the new one — 'percentage increase' is measured against the starting point.",
      },
      hints: [
        h(1, "Direction", "Percentage change always compares against where you started."),
        h(2, "Concept", "% increase = (change / original) × 100 — the denominator is the ORIGINAL value."),
        h(3, "Step", `The change here is ${b} − ${a} = ${b - a}.`),
        h(4, "Structured solution", `Divide the change by the original: ${b - a} / ${a}, then × 100.`),
        h(5, "Complete explanation", `((${b} − ${a}) / ${a}) × 100 = ${fmtPercent(correct)}.`),
      ],
      commonMisconceptions: ["Dividing by the final value instead of the original", "Computing new/old as a ratio instead of the increase"],
    };
  },
};

const T_FIND_WHOLE: QuestionTemplate = {
  id: "T_FIND_WHOLE",
  skillId: "SK_PCT_BASIC",
  questionType: QuestionType.GUIDED_PRACTICE,
  cognitiveDemand: "APPLICATION",
  tags: ["percentage", "reverse-percentage"],
  supportedDifficulties: [Difficulty.EASY_PLUS, Difficulty.MEDIUM],
  difficultyProfile: (t) => baseDifficultyProfile(t),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 5),
  render: (target) => {
    const pct = pick(target === Difficulty.EASY_PLUS ? [10, 20, 25, 50] : [15, 30, 40, 12]);
    const whole = 20 * randInt(2, target === Difficulty.EASY_PLUS ? 20 : 35);
    const part = (whole * pct) / 100;
    const correct = whole;

    const options = buildNumericOptions(correct, [
      { value: (part * pct) / 100, misconception: ErrorCategory.CONCEPT_GAP, note: "This takes the percentage of the given part again, instead of solving for the whole." },
      { value: correct / 10, misconception: ErrorCategory.CALCULATION_ERROR, note: "This looks like the decimal point moved when dividing." },
      { value: part + pct, misconception: ErrorCategory.CARELESS_ERROR, note: "This combines the two given numbers without applying the percentage relationship." },
    ]);

    return {
      prompt: `${fmtPercent(pct)} of a number is ${fmtNumber(part)}. What is the number?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `If ${fmtPercent(pct)} of the number is ${fmtNumber(part)}, the number = ${fmtNumber(part)} ÷ (${pct}/100) = ${fmtNumber(part)} × 100/${pct} = ${fmtNumber(correct)}.`,
        efficientApproach: "Set up the equation (pct/100) × number = part, then divide — don't try to reverse it in your head.",
      },
      hints: [
        h(1, "Direction", "You're working backward from a part to the whole."),
        h(2, "Concept", "(percent/100) × number = part — solve this equation for 'number'."),
        h(3, "Step", `(${pct}/100) × number = ${fmtNumber(part)}.`),
        h(4, "Structured solution", `number = ${fmtNumber(part)} ÷ (${pct}/100) = ${fmtNumber(part)} × (100/${pct}).`),
        h(5, "Complete explanation", `number = ${fmtNumber(part)} × 100 / ${pct} = ${fmtNumber(correct)}.`),
      ],
      commonMisconceptions: ["Taking a percentage of the part instead of reversing the relationship"],
    };
  },
};

export const BASIC_TEMPLATES = [T_PCT_OF_NUMBER, T_PCT_CHANGE, T_FIND_WHOLE];
