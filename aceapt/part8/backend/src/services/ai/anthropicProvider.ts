import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, EquivalentQuestionRequest, GeneratedQuestionCandidate, MasterySummaryRequest } from "./types.js";
import { AIGenerationUnavailableError } from "./types.js";

/**
 * Structured generation goes through forced tool use (tool_choice pinned to
 * one tool, strict: true), not "please reply with only JSON" prompting -
 * that's the documented, guaranteed-schema path for the Messages API, which
 * has no response_format/json-mode flag. This matters here specifically
 * because spec section 45/46 draws a hard line: AI may propose a question,
 * but must never be the thing deciding correctness - forcing the shape here
 * means "which choice is correct" always arrives as one specific field we
 * validate deterministically (questionQualityPipeline.ts), never as prose
 * we have to parse and hope about.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateEquivalentQuestion(req: EquivalentQuestionRequest): Promise<GeneratedQuestionCandidate> {
    const tool: Anthropic.Tool = {
      name: "propose_question",
      description:
        "Propose one multiple-choice aptitude question that tests the requested underlying skill at the requested novelty level and difficulty.",
      input_schema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The full, self-contained question text. Do not mention the skill/topic name inside the text itself.",
          },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              properties: { id: { type: "string", description: "Short id, e.g. 'a'" }, text: { type: "string" } },
              required: ["id", "text"],
            },
          },
          correct_choice_id: { type: "string", description: "Must exactly match one choice's id." },
          explanation: { type: "string", description: "Why the correct choice is correct, in 1-3 sentences." },
          reported_skill_tag: { type: "string", description: "The single underlying reasoning skill this tests, e.g. 'percentage-change'." },
          reported_difficulty: { type: "number", description: "Self-assessed difficulty from 0 (trivial) to 1 (very hard)." },
          expected_time_seconds: { type: "integer", description: "Realistic solve time in seconds for a prepared student." },
        },
        required: ["prompt", "choices", "correct_choice_id", "explanation", "reported_skill_tag", "reported_difficulty", "expected_time_seconds"],
      },
      // @ts-expect-error - `strict` is supported by current API versions for schema-guaranteed tool input even where the installed SDK's TS types haven't caught up yet.
      strict: true,
    };

    const noveltyGuidance: Record<string, string> = {
      FAMILIAR: "Use the same numbers/wording style as a standard textbook drill for this skill.",
      SLIGHTLY_VARIANT: "Change the surface details (numbers, names, ordering) from a typical drill, but keep the structure recognizable.",
      NOVEL: "Present the same underlying reasoning in an unfamiliar surface form - different phrasing, an applied scenario, or a structure students don't usually drill on. Do not name the skill/topic.",
      COMPLEX_APPLICATION: "Require combining this skill with an adjacent step (e.g. a real-world multi-step scenario) so a student who only memorized the basic pattern cannot pattern-match their way to the answer.",
    };

    const prompt = [
      `Skill: ${req.skillName} (key: ${req.skillKey})`,
      `Target novelty level: ${req.noveltyLevel}. ${noveltyGuidance[req.noveltyLevel] ?? ""}`,
      `Target context: ${req.contextType === "MIXED_CONTEXT" ? "Do not reveal the skill/topic name anywhere in the question." : "Standard labeled practice question."}`,
      `Target difficulty (0-1): ${req.difficultyTarget}`,
      req.referencePrompt ? `For topical reference only (do not copy), an existing question on this skill:\n"""${req.referencePrompt}"""` : "",
      req.avoidPrompts.length
        ? `Avoid closely resembling these existing questions (vary the scenario/numbers meaningfully):\n${req.avoidPrompts.slice(0, 5).map((p) => `- ${p}`).join("\n")}`
        : "",
      "Produce exactly one question with exactly 4 answer choices, exactly one of which is correct.",
    ]
      .filter(Boolean)
      .join("\n\n");

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        tools: [tool],
        tool_choice: { type: "tool", name: "propose_question" },
        messages: [{ role: "user", content: prompt }],
      });
    } catch (err) {
      throw new AIGenerationUnavailableError(`Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) {
      throw new AIGenerationUnavailableError("Model response contained no tool_use block.");
    }
    const raw = toolUse.input as {
      prompt: string;
      choices: { id: string; text: string }[];
      correct_choice_id: string;
      explanation: string;
      reported_skill_tag: string;
      reported_difficulty: number;
      expected_time_seconds: number;
    };

    return {
      prompt: raw.prompt,
      choices: raw.choices.map((c) => ({ id: c.id, text: c.text })),
      correctChoiceId: raw.correct_choice_id,
      explanation: raw.explanation,
      reportedSkillTag: raw.reported_skill_tag,
      reportedDifficulty: raw.reported_difficulty,
      expectedTimeSeconds: raw.expected_time_seconds,
    };
  }

  async generateMasterySummary(req: MasterySummaryRequest): Promise<string> {
    // Free-text is fine here - this is student-facing encouragement copy,
    // never fed back into any scoring or state decision (see section 46).
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              `Skill: ${req.skillName}. Current mastery state: ${req.state}.`,
              `Evidence-based reasoning behind this state:\n${req.rationale.map((r) => `- ${r}`).join("\n")}`,
              "Write 2-3 calm, encouraging sentences for the student explaining what this means and what evidence it's based on. Do not use the word 'failed'. Do not invent any numbers not given above.",
            ].join("\n\n"),
          },
        ],
      });
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      return textBlock?.text?.trim() ?? req.rationale.join(" ");
    } catch (err) {
      throw new AIGenerationUnavailableError(`Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function makeAnthropicProviderFromEnv(): AIProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  return new AnthropicProvider(apiKey, model);
}
