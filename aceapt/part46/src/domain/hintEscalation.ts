import { HelpLevel } from "./types";

export interface HintContext {
  base: number;
  percent: number;
  changeAmount: number;
  contextNoun: string;
}

// Levels follow section 14 of the spec:
// 0 question only, 1 direction, 2 conceptual reminder, 3 strategic clue,
// 4 partial step, 5 detailed guidance, 6 worked explanation.
export function buildHint(level: HelpLevel, ctx: HintContext): string {
  switch (level) {
    case 0:
      return "";
    case 1:
      return `Think about which number in the problem stayed fixed as the "before" value.`;
    case 2:
      return `Percentage change is always measured against the original (starting) value, not the new one.`;
    case 3:
      return `Try dividing the amount of change by the value you started with, then convert that to a percentage.`;
    case 4:
      return `The change here is ${ctx.changeAmount}. Which value would you divide that by?`;
    case 5:
      return `Divide ${ctx.changeAmount} by ${ctx.base}. What decimal do you get, and how do you turn that into a percentage?`;
    case 6:
      return `Worked example: change ÷ original × 100 = ${ctx.changeAmount} ÷ ${ctx.base} × 100 = ${(
        (ctx.changeAmount / ctx.base) *
        100
      ).toFixed(1)}%.`;
    default:
      return "";
  }
}
