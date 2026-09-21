// Thin wrapper around the Anthropic SDK. This is the ONLY file that
// imports @anthropic-ai/sdk - every caller goes through
// AiExtractionService / AiExplanationService, which always have a
// deterministic fallback (Section 50: "AI must never become a single
// point of failure"). Nothing here computes a number, a date, or a
// state transition (Section 49) - only language.
import Anthropic from "@anthropic-ai/sdk";

const EXTRACTION_TIMEOUT_MS = 8000;
const EXPLANATION_TIMEOUT_MS = 6000;

export interface ExtractedGoalFields {
  goal_type: string | null;
  deadline_days: number | null;
  deadline_exact_date: string | null;
  student_reported_weakness: string | null;
  confidence_notes: string | null;
}

const EXTRACT_TOOL = {
  name: "extract_goal_fields",
  description:
    "Extract structured goal information from a student's free-text description of what they want to achieve. Only fill a field when the text actually supports it - set a field to null rather than guessing.",
  input_schema: {
    type: "object" as const,
    properties: {
      goal_type: {
        type: ["string", "null"],
        enum: [
          "PLACEMENT_READINESS",
          "ASSESSMENT_PREPARATION",
          "SKILL_IMPROVEMENT",
          "PERFORMANCE_IMPROVEMENT",
          "SPEED_IMPROVEMENT",
          "ACCURACY_IMPROVEMENT",
          "OVERALL_APTITUDE",
          "CUSTOM",
          null,
        ],
      },
      deadline_days: {
        type: ["number", "null"],
        description: "Number of days from today until the student's deadline, if one was mentioned.",
      },
      deadline_exact_date: {
        type: ["string", "null"],
        description: "ISO date (YYYY-MM-DD) if the student named a specific date rather than a day count.",
      },
      student_reported_weakness: {
        type: ["string", "null"],
        description:
          "A weak area in the student's own words (e.g. 'logical reasoning'). This is what they SAID, not a verified fact.",
      },
      confidence_notes: {
        type: ["string", "null"],
        description: "One short sentence on anything ambiguous or worth confirming with the student.",
      },
    },
    required: ["goal_type", "deadline_days", "deadline_exact_date", "student_reported_weakness"],
  },
};

export class AnthropicClient {
  private client: Anthropic | null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async extractGoalFields(freeText: string): Promise<ExtractedGoalFields> {
    if (!this.client) throw new Error("ANTHROPIC_API_KEY not configured");
    const model = process.env.ANTHROPIC_EXTRACTION_MODEL || "claude-haiku-4-5-20251001";

    const response = await this.client.messages.create(
      {
        model,
        max_tokens: 512,
        system:
          "You extract structured fields from a student's description of a learning goal. You are not authoritative - a human will confirm anything uncertain afterward. Never fabricate a value the text doesn't support.",
        messages: [{ role: "user", content: freeText }],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_goal_fields" },
      },
      { timeout: EXTRACTION_TIMEOUT_MS }
    );

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Anthropic did not return the expected tool_use block");
    }
    return toolUse.input as ExtractedGoalFields;
  }

  /**
   * Turns an already-computed, fact-checked reason string into warmer
   * student-facing prose. `facts` are the ONLY things the model is
   * allowed to reference - the system prompt forbids adding new claims.
   */
  async polishExplanation(facts: string): Promise<string> {
    if (!this.client) throw new Error("ANTHROPIC_API_KEY not configured");
    const model = process.env.ANTHROPIC_EXPLANATION_MODEL || "claude-sonnet-5";

    const response = await this.client.messages.create(
      {
        model,
        max_tokens: 200,
        system:
          "Rewrite the given facts as one short, encouraging sentence or two for a student preparing for placements. Use ONLY the facts provided - do not add numbers, comparisons, or claims that are not already there. Do not use markdown.",
        messages: [{ role: "user", content: facts }],
      },
      { timeout: EXPLANATION_TIMEOUT_MS }
    );

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic did not return a text block");
    }
    return textBlock.text.trim();
  }
}
