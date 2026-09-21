import { Difficulty, ErrorCategory, QuestionType } from "../domain/enums";
import { baseDifficultyProfile, baseExpectedTimeSeconds } from "./difficultyProfiles";
import { QuestionTemplate } from "./templates";
import { buildNumericOptions, fmtNumber, fmtPercent, pick, randInt, round2 } from "./templateUtils";
import { h } from "./hintHelper";

const T_POPULATION_GROWTH: QuestionTemplate = {
  id: "T_POPULATION_GROWTH",
  skillId: "SK_PCT_POPULATION",
  questionType: QuestionType.TRANSFER,
  cognitiveDemand: "TRANSFER",
  tags: ["percentage", "population", "compound-growth", "transfer"],
  supportedDifficulties: [Difficulty.MEDIUM, Difficulty.MEDIUM_PLUS],
  difficultyProfile: (t) => baseDifficultyProfile(t, { transferDifficulty: 4, calculationComplexity: Math.min(5, baseDifficultyProfile(t).calculationComplexity + 1) as 1 | 2 | 3 | 4 | 5 }),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 15),
  render: (target) => {
    const pop = 1000 * randInt(2, 50);
    const pct = pick(target === Difficulty.MEDIUM ? [5, 10] : [10, 15, 20, 25]);
    const afterYear1 = pop * (1 + pct / 100);
    const correct = Math.round(afterYear1 * (1 + pct / 100));

    const options = buildNumericOptions(
      correct,
      [
        { value: Math.round(pop * (1 + (2 * pct) / 100)), misconception: ErrorCategory.CONCEPT_GAP, note: "This doubles the growth rate as a simple addition instead of compounding it year over year." },
        { value: Math.round(afterYear1), misconception: ErrorCategory.CARELESS_ERROR, note: "This is only one year of growth — the question asks for two years." },
        { value: Math.round(Math.round(afterYear1) * (1 + pct / 100)), misconception: ErrorCategory.CALCULATION_ERROR, note: "The first year's result was rounded off before compounding the second year, drifting the final figure slightly." },
      ],
      (n) => fmtNumber(Math.round(n))
    );

    return {
      prompt: `The population of a town is ${pop.toLocaleString("en-IN")}. It grows at ${fmtPercent(pct)} per year. What will the population be after 2 years (to the nearest whole number)?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `Growth compounds each year. After year 1: ${pop.toLocaleString("en-IN")} × (1 + ${pct}/100) = ${fmtNumber(round2(afterYear1))}. After year 2: that figure × (1 + ${pct}/100) again = ${correct.toLocaleString("en-IN")}.`,
        efficientApproach: `In one line: population × (1 + ${pct}/100)² = ${correct.toLocaleString("en-IN")}.`,
        howToAvoidMistake: "Each year's growth applies to that year's population, not the original starting population — this is the same compounding idea as successive percentage change.",
      },
      hints: [
        h(1, "Direction", "This is the same 'apply one change at a time' idea from successive percentage change, just repeated over years."),
        h(2, "Concept", "Each year's growth is calculated on THAT year's population, not the original one."),
        h(3, "Step", `Year 1: ${pop.toLocaleString("en-IN")} × (1 + ${pct}/100).`),
        h(4, "Structured solution", `Year 2: take the year-1 result and apply the same growth again.`),
        h(5, "Complete explanation", `${pop.toLocaleString("en-IN")} × (1 + ${pct}/100)² ≈ ${correct.toLocaleString("en-IN")}.`),
      ],
      commonMisconceptions: ["Doubling the growth rate instead of compounding across years", "Stopping after one year of growth"],
    };
  },
};

const T_DI_PERCENT_OF_TOTAL: QuestionTemplate = {
  id: "T_DI_PERCENT_OF_TOTAL",
  skillId: "SK_DATA_INTERPRETATION",
  questionType: QuestionType.TRANSFER,
  cognitiveDemand: "TRANSFER",
  tags: ["percentage", "data-interpretation", "transfer"],
  supportedDifficulties: [Difficulty.MEDIUM, Difficulty.MEDIUM_PLUS],
  difficultyProfile: (t) => baseDifficultyProfile(t, { transferDifficulty: 4 }),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 10),
  render: (target) => {
    const total = 20 * randInt(target === Difficulty.MEDIUM ? 5 : 15, target === Difficulty.MEDIUM ? 25 : 50);
    const pctA = pick([10, 20, 25, 30, 40, 60, 70]);
    const teaCount = (total * pctA) / 100;
    const correct = total - teaCount;

    const options = buildNumericOptions(correct, [
      { value: teaCount, misconception: ErrorCategory.MISREAD, note: "This is the count for Tea, but the question asked for the count who prefer Coffee." },
      { value: total - pctA, misconception: ErrorCategory.CALCULATION_ERROR, note: "This subtracts the percentage NUMBER from the total instead of the percentage OF the total." },
      { value: round2(correct * 1.1), misconception: ErrorCategory.CALCULATION_ERROR, note: "The final multiplication looks slightly off." },
    ]);

    return {
      prompt: `In a survey of ${total} students, ${fmtPercent(pctA)} prefer Tea and the rest prefer Coffee. How many students prefer Coffee?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `If ${fmtPercent(pctA)} prefer Tea, then ${fmtPercent(100 - pctA)} prefer Coffee. Coffee count = ${fmtPercent(100 - pctA)} of ${total} = ${fmtNumber(correct)}.`,
        efficientApproach: "Find the complementary percentage first (100 − given%), then apply it directly — no need to compute the Tea count at all.",
      },
      hints: [
        h(1, "Direction", "Notice carefully which group the question is actually asking about."),
        h(2, "Concept", "If X% prefer one option, (100 − X)% prefer the other, since everyone is in one group or the other."),
        h(3, "Step", `Coffee percentage = 100 − ${pctA} = ${100 - pctA}%.`),
        h(4, "Structured solution", `Coffee count = ${fmtPercent(100 - pctA)} of ${total}.`),
        h(5, "Complete explanation", `${fmtPercent(100 - pctA)} × ${total} = ${fmtNumber(correct)}.`),
      ],
      commonMisconceptions: ["Answering with the count for the wrong category", "Subtracting the percentage figure from the total instead of finding the percentage of the total"],
    };
  },
};

const T_MULTISTEP_CHAIN: QuestionTemplate = {
  id: "T_MULTISTEP_CHAIN",
  skillId: "SK_MULTISTEP",
  questionType: QuestionType.CHALLENGE,
  cognitiveDemand: "ANALYSIS",
  tags: ["percentage", "multi-step", "markup", "discount", "challenge"],
  supportedDifficulties: [Difficulty.HARD, Difficulty.HARD_PLUS],
  difficultyProfile: (t) => baseDifficultyProfile(t, { reasoningComplexity: 5, calculationComplexity: 5 }),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 25),
  render: (target) => {
    const cp = 20 * randInt(10, 40);
    const up = pick(target === Difficulty.HARD ? [20, 25, 30] : [30, 40, 50]);
    const disc = pick([10, 15, 20]);
    const mp = cp * (1 + up / 100);
    const spExact = mp * (1 - disc / 100);
    const correct = round2(((spExact - cp) / cp) * 100);
    const fmt = (n: number) => (n >= 0 ? `${fmtNumber(n)}% profit` : `${fmtNumber(Math.abs(n))}% loss`);

    const options = buildNumericOptions(
      correct,
      [
        { value: up - disc, misconception: ErrorCategory.CONCEPT_GAP, note: "This combines the mark-up and discount by simple subtraction instead of compounding the two steps." },
        { value: up, misconception: ErrorCategory.CARELESS_ERROR, note: "This is just the mark-up percentage — the discount step was never applied." },
        { value: round2(((Math.round(mp) * (1 - disc / 100) - cp) / cp) * 100), misconception: ErrorCategory.CALCULATION_ERROR, note: "The marked price was rounded off before applying the discount, drifting the final percentage slightly." },
      ],
      fmt
    );

    return {
      prompt: `A shopkeeper marks an item ${fmtPercent(up)} above its cost price of ₹${cp}, then offers a discount of ${fmtPercent(disc)} on the marked price. What is the shopkeeper's overall profit or loss percentage on the sale?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `Marked price = ${cp} × (1 + ${up}/100) = ${fmtNumber(round2(mp))}. Selling price after discount = ${fmtNumber(round2(mp))} × (1 − ${disc}/100) = ${fmtNumber(round2(spExact))}. Profit % on cost = (${fmtNumber(round2(spExact))} − ${cp}) / ${cp} × 100 = ${fmt(correct)}.`,
        efficientApproach: `In one line: [(1 + ${up}/100)(1 − ${disc}/100) − 1] × 100 — notice the cost price itself cancels out of the final percentage.`,
        howToAvoidMistake: "Work through mark-up and discount as two separate, sequential steps — don't try to combine the two percentages by eye.",
      },
      hints: [
        h(1, "Direction", "There are two separate steps here: mark up the cost, then discount the marked price. Do them one at a time."),
        h(2, "Concept", "Marked price depends on cost price; selling price depends on marked price; profit % depends on cost price and selling price."),
        h(3, "Step", `Marked price = ${cp} × (1 + ${up}/100) = ${fmtNumber(round2(mp))}.`),
        h(4, "Structured solution", `Selling price = ${fmtNumber(round2(mp))} × (1 − ${disc}/100). Then compare that to the original cost price of ${cp}.`),
        h(5, "Complete explanation", `Selling price = ${fmtNumber(round2(spExact))}. Profit % = (${fmtNumber(round2(spExact))} − ${cp})/${cp} × 100 = ${fmt(correct)}.`),
      ],
      commonMisconceptions: ["Subtracting discount % from mark-up % directly", "Stopping at the mark-up step and forgetting the discount", "Computing profit % against the marked price instead of the cost price"],
    };
  },
};

export const POPULATION_TEMPLATES = [T_POPULATION_GROWTH];
export const DI_TEMPLATES = [T_DI_PERCENT_OF_TOTAL];
export const MULTISTEP_TEMPLATES = [T_MULTISTEP_CHAIN];
