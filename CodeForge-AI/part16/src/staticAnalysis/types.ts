import type { StaticFinding } from "../domain/types.js";

export interface StaticAnalyzer {
  /** Real diagnostic source used, for observability/reporting honesty. */
  availability: "available" | "unavailable";
  reasonUnavailable?: string;
  analyze(sourceCode: string, filename: string): Promise<StaticFinding[]>;
}
