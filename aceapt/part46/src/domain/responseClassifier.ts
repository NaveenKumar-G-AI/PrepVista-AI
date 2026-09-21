import { ResponseClassification } from "./types";

export interface MisconceptionPattern {
  id: string;
  skill: string;
  test: (text: string) => boolean;
}

// One fully-built canonical misconception (see misconceptionLab.ts for the
// contradiction-experiment that resolves it). Additional patterns can be
// registered here following the same shape - see README for the extension
// point instead of a second, duplicate mistake classifier (section 13).
export const KNOWN_MISCONCEPTIONS: MisconceptionPattern[] = [
  {
    id: "percentage_increase_decrease_cancel",
    skill: "QUANT.PERCENTAGES",
    test: (t) =>
      /cancel|cancels out|return(s)? to (the )?(same|original)|net(s)? (out|to zero)|back to (where|the same)/i.test(
        t
      ) && /(percent|%|increase|decrease)/i.test(t),
  },
];

function extractNumber(text: string): number | null {
  const cleaned = text.replace(/[₹$,]/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function extractAllNumbers(text: string): number[] {
  const cleaned = text.replace(/[₹$,]/g, "");
  const matches = cleaned.match(/-?\d+(\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

const REASONING_MARKERS =
  /\bbecause\b|\bsince\b|\btherefore\b|\bso\b.{0,15}\b(is|was)\b|÷|\/|×|\*|\bpercent of\b|\bof\s+\d/i;
const UNSURE_MARKERS = /\bi\s?(don'?t|do not)\s?know\b|\bnot sure\b|\bno idea\b|\bconfused\b|\bunsure\b/i;

export interface ClassifyInput {
  text: string;
  trustedAnswer: number;
  answerTolerance?: number;
  referenceKeywords?: string[];
  wrongReferenceKeywords?: string[];
  skill: string;
}

export interface ClassifyResult {
  classification: ResponseClassification;
  extractedNumber: number | null;
  matchesTrusted: boolean | null;
  reasoningDetected: boolean;
  matchedMisconception: string | null;
}

export function classifyDeterministic(input: ClassifyInput): ClassifyResult {
  const text = (input.text || "").trim();

  if (!text) {
    return {
      classification: "NO_RESPONSE",
      extractedNumber: null,
      matchesTrusted: null,
      reasoningDetected: false,
      matchedMisconception: null,
    };
  }

  const misconception = KNOWN_MISCONCEPTIONS.find((m) => m.skill === input.skill && m.test(text));
  if (misconception) {
    return {
      classification: "MISCONCEPTION",
      extractedNumber: extractNumber(text),
      matchesTrusted: null,
      reasoningDetected: true,
      matchedMisconception: misconception.id,
    };
  }

  if (UNSURE_MARKERS.test(text)) {
    return {
      classification: "UNSURE",
      extractedNumber: null,
      matchesTrusted: null,
      reasoningDetected: false,
      matchedMisconception: null,
    };
  }

  const num = extractNumber(text);
  const allNumbers = extractAllNumbers(text);
  const tolerance = input.answerTolerance ?? 0.5;
  const lower = text.toLowerCase();
  const reasoningDetected =
    REASONING_MARKERS.test(text) || (input.referenceKeywords ?? []).some((k) => lower.includes(k.toLowerCase()));

  if (allNumbers.length > 0) {
    const matches = allNumbers.some((n) => Math.abs(n - input.trustedAnswer) <= tolerance);
    if (matches) {
      return {
        classification: reasoningDetected ? "CORRECT_REASONING" : "CORRECT_GUESS",
        extractedNumber: num,
        matchesTrusted: true,
        reasoningDetected,
        matchedMisconception: null,
      };
    }
    const usedWrongReference = (input.wrongReferenceKeywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
    if (usedWrongReference || reasoningDetected) {
      return {
        classification: "PARTIALLY_CORRECT",
        extractedNumber: num,
        matchesTrusted: false,
        reasoningDetected,
        matchedMisconception: null,
      };
    }
    return {
      classification: "INCORRECT",
      extractedNumber: num,
      matchesTrusted: false,
      reasoningDetected,
      matchedMisconception: null,
    };
  }

  if (reasoningDetected) {
    return {
      classification: "PARTIALLY_CORRECT",
      extractedNumber: null,
      matchesTrusted: null,
      reasoningDetected: true,
      matchedMisconception: null,
    };
  }
  if (text.length < 3) {
    return {
      classification: "AMBIGUOUS",
      extractedNumber: null,
      matchesTrusted: null,
      reasoningDetected: false,
      matchedMisconception: null,
    };
  }
  return {
    classification: "IRRELEVANT",
    extractedNumber: null,
    matchesTrusted: null,
    reasoningDetected: false,
    matchedMisconception: null,
  };
}

/**
 * Grades the "what did you do with the original value to get that result?"
 * elicitation step (GUIDED_REASONING). This is deliberately NOT graded
 * against the problem's final numeric answer - the point of this step is to
 * surface *why* an answer was right, so it is graded on whether the
 * explanation identifies the base value and names an appropriate operation
 * (section 23-26: a correct final number is not, by itself, evidence of
 * understanding).
 */
export function classifyReasoningElicitation(text: string, base: number): ClassifyResult {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return {
      classification: "NO_RESPONSE",
      extractedNumber: null,
      matchesTrusted: null,
      reasoningDetected: false,
      matchedMisconception: null,
    };
  }
  if (UNSURE_MARKERS.test(trimmed)) {
    return {
      classification: "UNSURE",
      extractedNumber: null,
      matchesTrusted: null,
      reasoningDetected: false,
      matchedMisconception: null,
    };
  }
  const mentionsBase = new RegExp(`(^|\\D)${base}(\\D|$)`).test(trimmed);
  const hasOperationLanguage = /%|percent|÷|\/|×|\*|divide|multiply|original|starting|base/i.test(trimmed);
  const num = extractNumber(trimmed);

  if (mentionsBase && hasOperationLanguage) {
    return {
      classification: "CORRECT_REASONING",
      extractedNumber: num,
      matchesTrusted: null,
      reasoningDetected: true,
      matchedMisconception: null,
    };
  }
  if (mentionsBase || hasOperationLanguage) {
    return {
      classification: "PARTIALLY_CORRECT",
      extractedNumber: num,
      matchesTrusted: null,
      reasoningDetected: hasOperationLanguage,
      matchedMisconception: null,
    };
  }
  return {
    classification: "INCORRECT",
    extractedNumber: num,
    matchesTrusted: null,
    reasoningDetected: false,
    matchedMisconception: null,
  };
}
