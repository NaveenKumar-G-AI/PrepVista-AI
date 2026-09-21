// Orchestrates natural-language goal extraction (Section 13, 25, 50):
// try the real Anthropic adapter, and on ANY failure - missing key,
// network error, timeout, malformed response - fall back to the
// deterministic extractor so goal creation never breaks because AI is
// unavailable. The caller always gets a DRAFT, never something applied
// automatically (Section 13: "AI extraction is NOT authoritative").
import { AnthropicClient, type ExtractedGoalFields } from "../integrations/ai/AnthropicClient.js";
import { extractDeterministically, resolveWeaknessToDimension } from "./deterministicExtractor.js";
import type { CapabilityDimension, GoalType } from "../domain/types.js";

export interface GoalDraft {
  source: "AI" | "FALLBACK";
  goalType: GoalType | null;
  deadlineDays: number | null;
  deadlineExactDate: string | null;
  studentReportedWeakness: string | null;
  weaknessDimension: CapabilityDimension | null;
  notes: string | null;
  /** Anything the draft could not resolve - the caller (goal creation
   * route) uses this to decide what to ask the student (Section 15:
   * "ask only the minimum useful question"). */
  needsClarification: ("goal_type" | "deadline")[];
}

export class AiExtractionService {
  constructor(private readonly anthropic: AnthropicClient = new AnthropicClient()) {}

  async extract(freeText: string): Promise<GoalDraft> {
    let fields: ExtractedGoalFields;
    let source: GoalDraft["source"];

    if (this.anthropic.isConfigured) {
      try {
        fields = await this.anthropic.extractGoalFields(freeText);
        source = "AI";
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Anthropic extraction failed, falling back to deterministic extractor:", (err as Error).message);
        fields = extractDeterministically(freeText);
        source = "FALLBACK";
      }
    } else {
      fields = extractDeterministically(freeText);
      source = "FALLBACK";
    }

    const goalType = (fields.goal_type as GoalType | null) ?? null;
    const needsClarification: GoalDraft["needsClarification"] = [];
    if (!goalType) needsClarification.push("goal_type");
    if (!fields.deadline_days && !fields.deadline_exact_date) needsClarification.push("deadline");

    return {
      source,
      goalType,
      deadlineDays: fields.deadline_days,
      deadlineExactDate: fields.deadline_exact_date,
      studentReportedWeakness: fields.student_reported_weakness,
      weaknessDimension: resolveWeaknessToDimension(fields.student_reported_weakness),
      notes: fields.confidence_notes,
      needsClarification,
    };
  }
}
