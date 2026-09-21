import { randomUUID } from "node:crypto";
import { ErrorCategory } from "../domain/enums";
import { QuestionOption } from "../domain/types";

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtNumber(n: number): string {
  const rounded = round2(n);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function fmtCurrency(n: number): string {
  return `₹${fmtNumber(n)}`;
}

export function fmtPercent(n: number): string {
  return `${fmtNumber(n)}%`;
}

export interface DistractorSpec {
  value: number;
  misconception: ErrorCategory;
  note: string;
}

/**
 * Builds a 4-option set from a correct numeric value and up to 3 distractor
 * specs, guaranteeing every option is numerically distinct (nudging any
 * collision by a small deterministic amount) and shuffling display order.
 * This is what makes template-generated questions self-validating on the
 * "unique answer" and "distinct distractors" checks in the quality gate (§34).
 */
export function buildNumericOptions(
  correct: number,
  distractors: DistractorSpec[],
  format: (n: number) => string = fmtNumber
): QuestionOption[] {
  const seen = new Set<string>([round2(correct).toFixed(2)]);
  const dedupedDistractors = distractors.map((d) => {
    let value = round2(d.value);
    let guard = 0;
    while (seen.has(value.toFixed(2)) && guard < 8) {
      value = round2(value + Math.max(0.5, Math.abs(correct) * 0.04) * (guard % 2 === 0 ? 1 : -1) * (guard + 1));
      guard++;
    }
    seen.add(value.toFixed(2));
    return { ...d, value };
  });

  const options: QuestionOption[] = [
    { id: randomUUID(), text: format(correct), isCorrect: true },
    ...dedupedDistractors.map((d) => ({
      id: randomUUID(),
      text: format(d.value),
      isCorrect: false,
      misconception: d.misconception,
      misconceptionNote: d.note,
    })),
  ];

  return shuffle(options);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
