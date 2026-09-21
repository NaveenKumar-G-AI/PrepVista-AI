// Rule-based fallback for natural-language goal extraction (Sections
// 13-15, 25, 50). Deliberately conservative: every field defaults to
// null/unresolved rather than guessed, because "AI extraction is NOT
// authoritative" applies just as much to this fallback as to the LLM
// path - both produce a DRAFT the student must confirm.
import type { CapabilityDimension } from "../domain/types.js";
import type { ExtractedGoalFields } from "../integrations/ai/AnthropicClient.js";

const SKILL_SYNONYMS: [RegExp, CapabilityDimension][] = [
  [/logical reasoning|logical aptitude|\blogic\b/i, "logical"],
  [/quant(itative)?( aptitude)?|\bmaths?\b|arithmetic/i, "quant"],
  [/verbal( ability)?|english|reading comprehension/i, "verbal"],
  [/probability/i, "probability"],
  [/data interpretation|\bDI\b/i, "data_interpretation"],
];

const GOAL_TYPE_RULES: [RegExp, ExtractedGoalFields["goal_type"]][] = [
  [/placement/i, "PLACEMENT_READINESS"],
  [/\b(assessment|test|exam)\b/i, "ASSESSMENT_PREPARATION"],
  [/\b(speed|faster|slow|time pressure|pace)\b/i, "SPEED_IMPROVEMENT"],
  [/\b(accuracy|accurate|careless mistakes|silly mistakes)\b/i, "ACCURACY_IMPROVEMENT"],
  [/overall aptitude|general aptitude|everything/i, "OVERALL_APTITUDE"],
];

export function extractDeterministically(freeText: string): ExtractedGoalFields {
  const text = freeText.trim();

  let deadline_days: number | null = null;
  const daysMatch = text.match(/in\s+(\d{1,3})\s*days?/i) ?? text.match(/(\d{1,3})\s*days?\s*(left|remaining|away)?/i);
  const weeksMatch = text.match(/(\d{1,2})\s*weeks?/i);
  const monthsMatch = text.match(/(\d{1,2})\s*months?/i);
  if (daysMatch) deadline_days = parseInt(daysMatch[1]!, 10);
  else if (weeksMatch) deadline_days = parseInt(weeksMatch[1]!, 10) * 7;
  else if (monthsMatch) deadline_days = parseInt(monthsMatch[1]!, 10) * 30;

  let deadline_exact_date: string | null = null;
  const isoDateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDateMatch) deadline_exact_date = isoDateMatch[1]!;

  let goal_type: ExtractedGoalFields["goal_type"] = null;
  for (const [pattern, type] of GOAL_TYPE_RULES) {
    if (pattern.test(text)) {
      goal_type = type;
      break;
    }
  }

  let student_reported_weakness: string | null = null;
  const weaknessContext = text.match(
    /(?:weak(?:est)? (?:in|at)|struggl\w+ with|bad at|not good at|need to improve)\s+([a-z ]{3,40})/i
  );
  const candidateText = weaknessContext?.[1] ?? text;
  for (const [pattern] of SKILL_SYNONYMS) {
    if (pattern.test(candidateText)) {
      const match = candidateText.match(pattern);
      student_reported_weakness = match?.[0]?.trim() ?? null;
      if (!goal_type && weaknessContext) goal_type = "SKILL_IMPROVEMENT";
      break;
    }
  }

  return {
    goal_type,
    deadline_days,
    deadline_exact_date,
    student_reported_weakness,
    confidence_notes:
      "Extracted with keyword matching (AI extraction was unavailable) - please confirm these fields.",
  };
}

/** Best-effort mapping from a free-text weakness mention to a real
 * capability dimension, so the priority engine can weight it - but this
 * is still just a hint (Section 14), never treated as measured fact. */
export function resolveWeaknessToDimension(weakness: string | null): CapabilityDimension | null {
  if (!weakness) return null;
  for (const [pattern, dimension] of SKILL_SYNONYMS) {
    if (pattern.test(weakness)) return dimension;
  }
  return null;
}
