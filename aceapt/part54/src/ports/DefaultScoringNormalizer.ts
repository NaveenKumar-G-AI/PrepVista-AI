import type { AnswerType, ScoringNormalizerPort } from "../contracts/types.js";
import { extractNumericValue } from "../validators/support/numericAnswer.js";

/**
 * PORT (see /TRUTH_TABLE.md): the real ACEAPT grading/scoring engine owns answer
 * normalization for real. No ACEAPT repository was reachable in this session
 * (consistent with every prior part of this series), so this is a genuine,
 * working dev-mode implementation of the SAME contract — good enough to drive
 * real validation and real tests — not a mocked stub that always returns true.
 * Swap this for an adapter that calls the real grading module; nothing above
 * this file needs to change if the contract is honored.
 */
export class DefaultScoringNormalizer implements ScoringNormalizerPort {
  private readonly supportedTypes: ReadonlySet<AnswerType> = new Set([
    "SINGLE_SELECT",
    "MULTI_SELECT",
    "NUMERIC",
    "DECIMAL",
    "FRACTION",
    "PERCENTAGE",
    "TEXT",
    "TRUE_FALSE",
    "MATCHING",
    "ORDERING",
    "FILL_IN_BLANK"
  ]);

  supports(answerType: AnswerType): boolean {
    return this.supportedTypes.has(answerType);
  }

  normalize(answerType: AnswerType, raw: unknown): { ok: true; normalized: unknown } | { ok: false; reason: string } {
    switch (answerType) {
      case "SINGLE_SELECT": {
        if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "SINGLE_SELECT answer must be a non-empty option id string." };
        return { ok: true, normalized: raw };
      }
      case "MULTI_SELECT": {
        if (!Array.isArray(raw) || raw.length === 0 || !raw.every((x) => typeof x === "string")) {
          return { ok: false, reason: "MULTI_SELECT answer must be a non-empty array of option id strings." };
        }
        return { ok: true, normalized: [...raw].sort() };
      }
      case "NUMERIC":
      case "DECIMAL":
      case "FRACTION":
      case "PERCENTAGE": {
        const extraction = extractNumericValue(raw);
        if (!extraction) return { ok: false, reason: `Could not parse "${String(raw)}" as a ${answerType.toLowerCase()} value.` };
        return { ok: true, normalized: extraction.value };
      }
      case "TRUE_FALSE": {
        if (typeof raw === "boolean") return { ok: true, normalized: raw };
        if (typeof raw === "string" && ["true", "false"].includes(raw.toLowerCase())) {
          return { ok: true, normalized: raw.toLowerCase() === "true" };
        }
        return { ok: false, reason: "TRUE_FALSE answer must be a boolean or the string \"true\"/\"false\"." };
      }
      case "TEXT":
      case "FILL_IN_BLANK": {
        if (typeof raw === "string" && raw.trim().length > 0) return { ok: true, normalized: raw.trim() };
        if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) return { ok: true, normalized: raw.map((x) => x.trim()) };
        return { ok: false, reason: `${answerType} answer must be a non-empty string (or array of strings for multi-blank).` };
      }
      case "MATCHING": {
        if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) return { ok: true, normalized: raw };
        return { ok: false, reason: "MATCHING answer must be an object mapping left-ids to right-ids." };
      }
      case "ORDERING": {
        if (Array.isArray(raw) && raw.length > 0) return { ok: true, normalized: raw };
        return { ok: false, reason: "ORDERING answer must be a non-empty array." };
      }
      default:
        return { ok: false, reason: `Unsupported answer type: ${String(answerType)}` };
    }
  }
}
