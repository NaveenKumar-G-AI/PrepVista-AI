import { Difficulty, ErrorCategory, QuestionType } from "../domain/enums";
import { baseDifficultyProfile, baseExpectedTimeSeconds } from "./difficultyProfiles";
import { QuestionTemplate } from "./templates";
import { buildNumericOptions, fmtCurrency, fmtPercent, pick, randInt, round2 } from "./templateUtils";
import { h } from "./hintHelper";

const T_SINGLE_DISCOUNT: QuestionTemplate = {
  id: "T_SINGLE_DISCOUNT",
  skillId: "SK_PCT_DISCOUNT",
  questionType: QuestionType.TRANSFER,
  cognitiveDemand: "TRANSFER",
  tags: ["percentage", "discount", "transfer"],
  supportedDifficulties: [Difficulty.EASY_PLUS, Difficulty.MEDIUM],
  difficultyProfile: (t) => baseDifficultyProfile(t, { transferDifficulty: Math.min(5, baseDifficultyProfile(t).transferDifficulty + 1) as 1 | 2 | 3 | 4 | 5 }),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 5),
  render: (target) => {
    const mp = 20 * randInt(target === Difficulty.EASY_PLUS ? 5 : 10, target === Difficulty.EASY_PLUS ? 30 : 50);
    const pct = pick([10, 15, 20, 25, 30, 40]);
    const correct = round2(mp * (1 - pct / 100));

    const options = buildNumericOptions(
      correct,
      [
        { value: round2(mp * (1 + pct / 100)), misconception: ErrorCategory.CONCEPT_GAP, note: "This adds the discount instead of subtracting it from the marked price." },
        { value: round2((mp * pct) / 100), misconception: ErrorCategory.CARELESS_ERROR, note: "This is the discount AMOUNT, not the final selling price that was asked for." },
        { value: round2(correct + pct), misconception: ErrorCategory.CALCULATION_ERROR, note: "The subtraction looks slightly off." },
      ],
      fmtCurrency
    );

    return {
      prompt: `A shirt has a marked price of ${fmtCurrency(mp)}. During a sale it is sold at a discount of ${fmtPercent(pct)}. What is the selling price?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `Selling price = marked price − discount = ${fmtCurrency(mp)} − (${pct}% of ${fmtCurrency(mp)}) = ${fmtCurrency(mp)} × (1 − ${pct}/100) = ${fmtCurrency(correct)}.`,
        efficientApproach: `Multiply directly by (100 − ${pct})/100 instead of computing the discount amount separately.`,
      },
      hints: [
        h(1, "Direction", "This is the same percentage-of-a-number idea as before, applied to a discount."),
        h(2, "Concept", "Selling price = marked price − discount amount."),
        h(3, "Step", `Discount amount = ${fmtPercent(pct)} of ${fmtCurrency(mp)}.`),
        h(4, "Structured solution", `Selling price = ${fmtCurrency(mp)} − discount amount.`),
        h(5, "Complete explanation", `${fmtCurrency(mp)} × (1 − ${pct}/100) = ${fmtCurrency(correct)}.`),
      ],
      commonMisconceptions: ["Answering with the discount amount instead of the final selling price", "Adding the discount instead of subtracting it"],
    };
  },
};

const T_SUCCESSIVE_DISCOUNT: QuestionTemplate = {
  id: "T_SUCCESSIVE_DISCOUNT",
  skillId: "SK_PCT_DISCOUNT",
  questionType: QuestionType.TRANSFER,
  cognitiveDemand: "TRANSFER",
  tags: ["percentage", "discount", "successive-change", "transfer"],
  supportedDifficulties: [Difficulty.MEDIUM_PLUS, Difficulty.HARD],
  difficultyProfile: (t) => baseDifficultyProfile(t, { calculationComplexity: 5, transferDifficulty: 4 }),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 15),
  render: (target) => {
    const mp = 20 * randInt(10, 50);
    const p1 = pick(target === Difficulty.MEDIUM_PLUS ? [10, 20] : [15, 20, 25, 30]);
    const p2 = pick([5, 10, 15, 20]);
    const afterFirst = mp * (1 - p1 / 100);
    const correct = round2(afterFirst * (1 - p2 / 100));

    const options = buildNumericOptions(
      correct,
      [
        { value: round2(mp * (1 - (p1 + p2) / 100)), misconception: ErrorCategory.CONCEPT_GAP, note: "This adds the two discount percentages together instead of applying them one after another." },
        { value: round2(afterFirst), misconception: ErrorCategory.CARELESS_ERROR, note: "This only applies the first discount and stops there." },
        { value: round2(Math.round(afterFirst) * (1 - p2 / 100)), misconception: ErrorCategory.CALCULATION_ERROR, note: "The intermediate price was rounded before applying the second discount." },
      ],
      fmtCurrency
    );

    return {
      prompt: `A store offers successive discounts of ${fmtPercent(p1)} and ${fmtPercent(p2)} on a marked price of ${fmtCurrency(mp)}. What is the final selling price?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `After the first discount: ${fmtCurrency(mp)} × (1 − ${p1}/100) = ${fmtCurrency(round2(afterFirst))}. After the second discount: ${fmtCurrency(round2(afterFirst))} × (1 − ${p2}/100) = ${fmtCurrency(correct)}.`,
        efficientApproach: `One line: ${fmtCurrency(mp)} × (${100 - p1}/100) × (${100 - p2}/100) = ${fmtCurrency(correct)}. Note this is NOT the same as a single ${fmtPercent(p1 + p2)} discount.`,
        howToAvoidMistake: "Successive discounts never simply add — the second discount is smaller in absolute terms because it applies to an already-reduced price.",
      },
      hints: [
        h(1, "Direction", "Apply the two discounts one at a time, in order — this is the same idea as successive percentage change."),
        h(2, "Concept", "The second discount applies to the price AFTER the first discount, not the original marked price."),
        h(3, "Step", `First: ${fmtCurrency(mp)} × (1 − ${p1}/100).`),
        h(4, "Structured solution", `Then apply the second discount to that result: × (1 − ${p2}/100).`),
        h(5, "Complete explanation", `${fmtCurrency(mp)} × (${100 - p1}/100) × (${100 - p2}/100) = ${fmtCurrency(correct)}.`),
      ],
      commonMisconceptions: ["Adding successive discount percentages together", "Stopping after applying only the first discount"],
    };
  },
};

const T_PROFIT_PERCENT: QuestionTemplate = {
  id: "T_PROFIT_PERCENT",
  skillId: "SK_PCT_PROFIT_LOSS",
  questionType: QuestionType.TRANSFER,
  cognitiveDemand: "TRANSFER",
  tags: ["percentage", "profit-loss", "transfer"],
  supportedDifficulties: [Difficulty.EASY_PLUS, Difficulty.MEDIUM],
  difficultyProfile: (t) => baseDifficultyProfile(t, { transferDifficulty: Math.min(5, baseDifficultyProfile(t).transferDifficulty + 1) as 1 | 2 | 3 | 4 | 5 }),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 5),
  render: (target) => {
    const cp = 20 * randInt(target === Difficulty.EASY_PLUS ? 3 : 10, target === Difficulty.EASY_PLUS ? 25 : 45);
    const profitPct = pick([10, 15, 20, 25, 30, 40]);
    const sp = cp * (1 + profitPct / 100);
    const correct = profitPct;

    const options = buildNumericOptions(
      correct,
      [
        { value: round2(((sp - cp) / sp) * 100), misconception: ErrorCategory.CONCEPT_GAP, note: "This divides by the selling price instead of the cost price — profit % is always measured against the cost price." },
        { value: sp - cp, misconception: ErrorCategory.CARELESS_ERROR, note: "This is the profit AMOUNT in rupees, not the profit percentage." },
        { value: round2(correct / 10), misconception: ErrorCategory.CALCULATION_ERROR, note: "This is off by a factor of ten." },
      ]
    );

    return {
      prompt: `A shopkeeper buys an item for ${fmtCurrency(cp)} and sells it for ${fmtCurrency(sp)}. What is the profit percentage?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `Profit % = (Selling Price − Cost Price) / Cost Price × 100 = (${fmtCurrency(sp)} − ${fmtCurrency(cp)}) / ${fmtCurrency(cp)} × 100 = ${fmtPercent(correct)}.`,
        efficientApproach: "Profit and loss percentages are always calculated on the Cost Price — never the Selling Price.",
      },
      hints: [
        h(1, "Direction", "This uses the same percentage-of-a-number relationship, applied to buying and selling."),
        h(2, "Concept", "Profit % = (SP − CP) / CP × 100 — always divide by the COST price."),
        h(3, "Step", `Profit amount = ${fmtCurrency(sp)} − ${fmtCurrency(cp)} = ${fmtCurrency(round2(sp - cp))}.`),
        h(4, "Structured solution", `Divide by the cost price: ${fmtCurrency(round2(sp - cp))} / ${fmtCurrency(cp)}, then × 100.`),
        h(5, "Complete explanation", `(${fmtCurrency(sp)} − ${fmtCurrency(cp)}) / ${fmtCurrency(cp)} × 100 = ${fmtPercent(correct)}.`),
      ],
      commonMisconceptions: ["Dividing by the selling price instead of the cost price", "Giving the profit amount instead of the profit percentage"],
    };
  },
};

const T_SP_FROM_PROFIT: QuestionTemplate = {
  id: "T_SP_FROM_PROFIT",
  skillId: "SK_PCT_PROFIT_LOSS",
  questionType: QuestionType.TRANSFER,
  cognitiveDemand: "TRANSFER",
  tags: ["percentage", "profit-loss", "transfer"],
  supportedDifficulties: [Difficulty.MEDIUM, Difficulty.MEDIUM_PLUS],
  difficultyProfile: (t) => baseDifficultyProfile(t, { transferDifficulty: 3 }),
  expectedTimeSeconds: (t) => baseExpectedTimeSeconds(t, 5),
  render: (target) => {
    const cp = 20 * randInt(10, 45);
    const pct = pick([10, 15, 20, 25, 30, 40]);
    const correct = round2(cp * (1 + pct / 100));

    const options = buildNumericOptions(
      correct,
      [
        { value: round2((cp * pct) / 100), misconception: ErrorCategory.CARELESS_ERROR, note: "This is the profit amount, not the selling price that was asked for." },
        { value: round2(cp * (1 - pct / 100)), misconception: ErrorCategory.CONCEPT_GAP, note: "This subtracts the profit instead of adding it — treating profit like a discount." },
        { value: round2(correct + pct), misconception: ErrorCategory.CALCULATION_ERROR, note: "The addition looks slightly off." },
      ],
      fmtCurrency
    );

    return {
      prompt: `A trader buys goods for ${fmtCurrency(cp)} and wants to make a profit of ${fmtPercent(pct)}. At what price should the goods be sold?`,
      options,
      correctValue: correct,
      explanation: {
        correctReasoning: `Selling Price = Cost Price + Profit = ${fmtCurrency(cp)} + (${pct}% of ${fmtCurrency(cp)}) = ${fmtCurrency(cp)} × (1 + ${pct}/100) = ${fmtCurrency(correct)}.`,
        efficientApproach: `Multiply directly by (100 + ${pct})/100.`,
      },
      hints: [
        h(1, "Direction", "This is the reverse of the profit-percentage question — building UP from cost price."),
        h(2, "Concept", "Selling Price = Cost Price + Profit amount, where profit is a percentage of the cost price."),
        h(3, "Step", `Profit amount = ${fmtPercent(pct)} of ${fmtCurrency(cp)}.`),
        h(4, "Structured solution", `Selling price = ${fmtCurrency(cp)} + profit amount.`),
        h(5, "Complete explanation", `${fmtCurrency(cp)} × (1 + ${pct}/100) = ${fmtCurrency(correct)}.`),
      ],
      commonMisconceptions: ["Subtracting the profit instead of adding it", "Giving the profit amount instead of the selling price"],
    };
  },
};

export const DISCOUNT_TEMPLATES = [T_SINGLE_DISCOUNT, T_SUCCESSIVE_DISCOUNT];
export const PROFIT_LOSS_TEMPLATES = [T_PROFIT_PERCENT, T_SP_FROM_PROFIT];
