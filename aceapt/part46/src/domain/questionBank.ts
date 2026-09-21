import { LearningObjectiveContract, ProblemContext } from "./types";

// Section 8 of the spec, adapted to this build's shipped objective.
export const PERCENTAGE_BASE_VALUE_OBJECTIVE: LearningObjectiveContract = {
  objective: "identify_base_value_for_percentage_change",
  targetSkill: "QUANT.PERCENTAGES",
  targetSubskill: "PERCENTAGE_CHANGE",
  successCriteria: ["identifies_original_value", "selects_correct_reference", "explains_reasoning"],
};

interface ContextWord {
  noun: string;
  verb: string;
  unit: string;
}

const CONTEXTS: ContextWord[] = [
  { noun: "price", verb: "increases", unit: "₹" },
  { noun: "salary", verb: "rises", unit: "₹" },
  { noun: "population", verb: "grows", unit: "" },
  { noun: "score", verb: "improves", unit: "" },
];

const PERCENTS = [10, 12, 15, 20, 25, 30];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function roundedBase(rng: () => number): number {
  return Math.round((200 + rng() * 4800) / 100) * 100;
}

/** Teaching-phase problem: asks for the new value after the change. */
export function generatePercentageProblem(rng: () => number = Math.random, avoid?: ProblemContext): ProblemContext {
  let ctx: ContextWord, base: number, percent: number;
  let attempts = 0;
  do {
    ctx = pick(CONTEXTS, rng);
    base = roundedBase(rng);
    percent = pick(PERCENTS, rng);
    attempts += 1;
  } while (
    attempts < 20 &&
    avoid &&
    avoid.variables.base === base &&
    avoid.variables.percent === percent &&
    avoid.variables.contextNoun === ctx.noun
  );

  const changeAmount = Math.round((base * percent) / 100);
  const newValue = base + changeAmount;
  const unitPrefix = ctx.unit;
  const prompt = `A ${ctx.noun} ${ctx.verb} by ${percent}% from ${unitPrefix}${base}. Find the new ${ctx.noun}.`;

  return {
    skill: "QUANT.PERCENTAGES",
    prompt,
    trustedAnswer: newValue,
    trustedSolutionSteps: [
      `Change = ${percent}% of ${base} = ${changeAmount}`,
      `New value = ${base} + ${changeAmount} = ${newValue}`,
    ],
    variables: { base, percent, changeAmount, newValue, contextNoun: ctx.noun },
    generator: "percentage_change_new_value_v1",
  };
}

/** Transfer / independent-verification problem: asks for the change amount
 *  instead of the new total - a structurally different question testing the
 *  same underlying skill (sections 42-44, novelty + structural variation). */
export function generateChangeAmountProblem(rng: () => number = Math.random, avoid?: ProblemContext): ProblemContext {
  let ctx: ContextWord, base: number, percent: number;
  let attempts = 0;
  do {
    ctx = pick(CONTEXTS, rng);
    base = roundedBase(rng);
    percent = pick(PERCENTS, rng);
    attempts += 1;
  } while (attempts < 20 && avoid && avoid.variables.base === base && avoid.variables.percent === percent);

  const changeAmount = Math.round((base * percent) / 100);
  const unitPrefix = ctx.unit;
  const prompt = `A ${ctx.noun} ${ctx.verb} by ${percent}% from ${unitPrefix}${base}. What is the increase?`;

  return {
    skill: "QUANT.PERCENTAGES",
    prompt,
    trustedAnswer: changeAmount,
    trustedSolutionSteps: [`Increase = ${percent}% of ${base} = ${changeAmount}`],
    variables: { base, percent, changeAmount, contextNoun: ctx.noun },
    generator: "percentage_change_amount_v1",
  };
}

/** A gentler restatement of an existing problem for the "simpler example"
 *  control (section 55) - smaller, round numbers, same shape. */
export function generateSimplifiedVariant(current: ProblemContext): ProblemContext {
  const percent = 10;
  const base = 100;
  const changeAmount = 10;
  const contextNoun = String(current.variables.contextNoun || "price");
  if (current.generator === "percentage_change_amount_v1") {
    return {
      skill: "QUANT.PERCENTAGES",
      prompt: `Let's simplify: a ${contextNoun} increases by ${percent}% from ₹${base}. What is the increase?`,
      trustedAnswer: changeAmount,
      trustedSolutionSteps: [`Increase = ${percent}% of ${base} = ${changeAmount}`],
      variables: { base, percent, changeAmount, contextNoun },
      generator: "percentage_change_amount_v1",
    };
  }
  return {
    skill: "QUANT.PERCENTAGES",
    prompt: `Let's simplify: a ${contextNoun} increases by ${percent}% from ₹${base}. Find the new ${contextNoun}.`,
    trustedAnswer: base + changeAmount,
    trustedSolutionSteps: [`Change = ${percent}% of ${base} = ${changeAmount}`, `New value = ${base + changeAmount}`],
    variables: { base, percent, changeAmount, newValue: base + changeAmount, contextNoun },
    generator: "percentage_change_new_value_v1",
  };
}
