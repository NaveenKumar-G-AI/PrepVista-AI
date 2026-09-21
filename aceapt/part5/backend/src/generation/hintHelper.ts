import { Hint } from "../domain/types";

export function h(level: 1 | 2 | 3 | 4 | 5, label: string, text: string): Hint {
  return { level, label, text };
}
