import { Difficulty, ErrorCategory, QuestionType } from "../domain/enums";
import { baseDifficultyProfile, baseExpectedTimeSeconds } from "./difficultyProfiles";
import { QuestionTemplate } from "./templates";
import { buildNumericOptions, fmtCurrency, fmtPercent, pick, randInt, round2 } from "./templateUtils";
import { h } from "./hintHelper";

const T_SUCCESSIVE_PCT: QuestionTemplate = {
  id: "T_SUCCESSIVE_PCT",
  skillId: "SK_PCT_APPLICATION",
  questionType: QuestionType.STANDARD_PRACTICE,
  cognitiveDemand: "APPLICATION",
  tags: ["percentage", "successive-change", "application"],
  supportedDifficulties: [Difficulty.MEDIUM, Difficulty.MEDIUM_PLUS, Difficulty.HARD],
  difficultyProfile: (t) => baseDifficultyProfile(t, { calculationComplexity: Math.min(5, baseDifficultyProfile(t).calculationComplexity + 1) as 1 | 2 | 3 | 4 | 5 }),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 10),
  render: (target) => {
    const bandPcts = target === Difficulty.MEDIUM ? [10, 20] : target === Difficulty.MEDIUM_PLUS ? [10, 15, 20, 25] : [15, 20, 25, 30, 40];
    const base = 100 * randInt(target === Difficulty.HARD ? 5 : 2, target === Difficulty.HARD ? 40 : 20);
    const p1 = pick(bandPcts);
    const p2 = pick(bandPcts);
    const intermediate = base * (1 + p1 / 100);
    const correct = round2(intermediate * (1 - p2 / 100));

    const options = buildNumericOptions(
      correct,
      [
        {
          value: round2(base * (1 + (p1 - p2) / 100)),
          misconception: ErrorCategory.CONCEPT_GAP,
          note: "This treats the increase and decrease as if they simply subtract — successive percentage changes compound instead of adding linearly.",
        },
        {
          value: round2(base * (1 + p1 / 100) * (1 + p2 / 100)),
          misconception: ErrorCategory.PROCEDURAL_ERROR,
          note: "This applies the second change as another increase instead of a decrease.",
        },
        {
          value: round2(Math.round(intermediate) * (1 - p2 / 100)),
          misconception: ErrorCategory.CALCULATION_ERROR,
          note: "The intermediate value was rounded off before applying the second percentage change, drifting the final figure slightly.",
        },
      ],
      fmtCurrency
    );

    return {
      prompt: `A price of ${fmtCurrency(base)} is first increased by ${fmtPercent(p1)} and then decreased by ${fmtPercent(p2)}. What is the final price?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `Apply the changes one at a time. After the increase: ${fmtCurrency(base)} × (1 + ${p1}/100) = ${fmtCurrency(round2(intermediate))}. After the decrease: ${fmtCurrency(round2(intermediate))} × (1 − ${p2}/100) = ${fmtCurrency(correct)}.`,
        efficientApproach: `In one line: ${fmtCurrency(base)} × (${100 + p1}/100) × (${100 - p2}/100) = ${fmtCurrency(correct)}.`,
        howToAvoidMistake: "Never add or subtract successive percentages directly — always apply the second change to the result of the first, not to the original value.",
      },
      hints: [
        h(1, "Direction", "Handle one percentage change at a time, in order."),
        h(2, "Concept", "The second change applies to the RESULT of the first change, not to the original price."),
        h(3, "Step", `First find the price after the increase: ${fmtCurrency(base)} × (1 + ${p1}/100).`),
        h(4, "Structured solution", `Then apply the decrease to that new value: result × (1 − ${p2}/100).`),
        h(5, "Complete explanation", `${fmtCurrency(base)} × (${100 + p1}/100) × (${100 - p2}/100) = ${fmtCurrency(correct)}.`),
      ],
      commonMisconceptions: ["Adding/subtracting successive percentages directly instead of compounding them", "Applying both changes to the original value instead of chaining them"],
    };
  },
};

const T_PCT_COMPARISON: QuestionTemplate = {
  id: "T_PCT_COMPARISON",
  skillId: "SK_PCT_APPLICATION",
  questionType: QuestionType.APPLICATION,
  cognitiveDemand: "ANALYSIS",
  tags: ["percentage", "inverse-comparison", "application"],
  supportedDifficulties: [Difficulty.MEDIUM_PLUS, Difficulty.HARD],
  difficultyProfile: (t) => baseDifficultyProfile(t),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 15),
  render: (target) => {
    const pct = pick(target === Difficulty.MEDIUM_PLUS ? [20, 25, 40, 50] : [60, 80, 100, 30]);
    const correct = round2((pct * 100) / (100 + pct));

    const options = buildNumericOptions(correct, [
      { value: pct, misconception: ErrorCategory.CONCEPT_GAP, note: "This assumes the reverse comparison is the same percentage as the original — it isn't, because the base changes direction." },
      { value: round2((pct * 100) / (100 - Math.min(pct, 90))), misconception: ErrorCategory.PROCEDURAL_ERROR, note: "The denominator used here is going in the wrong direction." },
      { value: round2(correct / 10), misconception: ErrorCategory.CALCULATION_ERROR, note: "This is off by a factor of ten — check where the decimal point landed." },
    ]);

    return {
      prompt: `A's salary is ${fmtPercent(pct)} more than B's salary. By what percentage is B's salary less than A's?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `Let B = 100. Then A = 100 + ${pct} = ${100 + pct}. B is less than A by (A − B)/A × 100 = ${pct}/${100 + pct} × 100 = ${fmtPercent(correct)}.`,
        efficientApproach: `The two percentages are never equal — "more than" uses B as the base, "less than" uses A as the base.`,
        howToAvoidMistake: "Plug in a concrete number (like B = 100) rather than trying to do this one in the abstract.",
      },
      hints: [
        h(1, "Direction", "The two percentages describe the SAME gap but measured against different bases."),
        h(2, "Concept", "'A is X% more than B' uses B as the base. 'B is Y% less than A' uses A as the base — these bases differ."),
        h(3, "Step", `Try B = 100. Then A = ${100 + pct}.`),
        h(4, "Structured solution", `The gap is ${pct}. As a percentage of A: ${pct}/${100 + pct} × 100.`),
        h(5, "Complete explanation", `${pct}/(100+${pct}) × 100 = ${fmtPercent(correct)}.`),
      ],
      commonMisconceptions: ["Assuming 'A is X% more than B' and 'B is X% less than A' are the same percentage"],
    };
  },
};

export const APPLICATION_TEMPLATES = [T_SUCCESSIVE_PCT, T_PCT_COMPARISON];
