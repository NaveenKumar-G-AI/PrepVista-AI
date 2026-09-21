import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { DIFFICULTY_LABELS, QuestionHealth, QuestionSource } from "../domain/enums";
import { Question, QuestionOption } from "../domain/types";
import { GenerationResult, QuestionProvider, QuestionSpecification } from "./types";
import { baseDifficultyProfile, baseExpectedTimeSeconds } from "./difficultyProfiles";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/**
 * §32/§51 — AI is used ONLY to author candidate content (prompt, options,
 * hints, explanation). It never touches scoring, difficulty stepping,
 * session state, or anything the QualityGate can't independently re-check.
 * If ANTHROPIC_API_KEY is unset this provider reports itself unavailable
 * and the pipeline falls straight through to TemplateProvider — the product
 * does not depend on this path being configured.
 */
export const AnthropicProvider: QuestionProvider = {
  name: "anthropic",
  isAvailable: () => getClient() !== null,

  async generate(spec: QuestionSpecification): Promise<GenerationResult> {
    const anthropic = getClient();
    if (!anthropic) {
      return { question: null, providerUsed: "anthropic", error: "ANTHROPIC_API_KEY not configured" };
    }

    const system = `You author aptitude practice questions for an adaptive learning engine. You respond with ONLY a single JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "prompt": string,
  "options": [{ "text": string, "isCorrect": boolean, "misconception": "CONCEPT_GAP"|"PROCEDURAL_ERROR"|"CALCULATION_ERROR"|"LOGICAL_ERROR"|"MISREAD"|"CARELESS_ERROR"|null, "misconceptionNote": string|null }],
  "correctReasoning": string,
  "efficientApproach": string,
  "hints": [{ "level": 1|2|3|4|5, "label": string, "text": string }]
}
Rules: exactly 4 options, exactly one with isCorrect true, all four option texts numerically/textually distinct, every wrong option must carry a plausible "misconception" tag with a one-sentence "misconceptionNote" explaining the error it represents, hints must be strictly progressive (level 1 = gentle direction, level 5 = the complete worked solution) and never give away the answer before level 5.`;

    const userPrompt = `Skill: ${spec.skill.name} (${spec.skill.topic} > ${spec.skill.subtopic}).
Question type: ${spec.questionType}.
Target difficulty: ${DIFFICULTY_LABELS[spec.targetDifficulty]}.
${spec.focusDimension ? `Emphasize the ${spec.focusDimension} dimension of difficulty.` : ""}
Reason this question is being generated: ${spec.reason}
Write ONE original quantitative-aptitude question (percentages domain) fitting this brief.`;

    try {
      const response = await anthropic.messages.create({
        model: config.anthropicModel,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) return { question: null, providerUsed: "anthropic", error: "No text content in AI response" };

      const parsed = parseModelJson(textBlock.text);
      if (!parsed) return { question: null, providerUsed: "anthropic", error: "AI response was not valid JSON" };

      const options: QuestionOption[] = parsed.options.map((o: any) => ({
        id: randomUUID(),
        text: String(o.text),
        isCorrect: !!o.isCorrect,
        misconception: o.misconception ?? undefined,
        misconceptionNote: o.misconceptionNote ?? undefined,
      }));

      const question: Question = {
        id: randomUUID(),
        domain: "Quantitative Aptitude",
        topic: spec.skill.topic,
        subtopic: spec.skill.subtopic,
        skillId: spec.skill.id,
        prerequisites: spec.skill.prerequisites,
        difficulty: baseDifficultyProfile(spec.targetDifficulty),
        questionType: spec.questionType,
        cognitiveDemand: "APPLICATION",
        expectedTimeSeconds: baseExpectedTimeSeconds(spec.targetDifficulty),
        prompt: String(parsed.prompt),
        options,
        explanation: {
          correctReasoning: String(parsed.correctReasoning ?? ""),
          efficientApproach: parsed.efficientApproach ? String(parsed.efficientApproach) : undefined,
        },
        hints: Array.isArray(parsed.hints) ? parsed.hints : [],
        commonMisconceptions: options.filter((o) => o.misconceptionNote).map((o) => o.misconceptionNote!),
        errorCategoriesCovered: Array.from(new Set(options.map((o) => o.misconception).filter(Boolean))) as Question["errorCategoriesCovered"],
        tags: [...spec.skill.subtopic.toLowerCase().split(" "), "ai-generated"],
        version: 1,
        // AI output is never trusted directly — always REVIEW_REQUIRED until the
        // QualityGate independently re-validates structure and answer uniqueness (§32, §34).
        qualityStatus: QuestionHealth.REVIEW_REQUIRED,
        source: QuestionSource.AI_GENERATED,
        examRelevance: 0.6,
        createdAt: new Date().toISOString(),
      };

      return { question, providerUsed: "anthropic" };
    } catch (err) {
      return { question: null, providerUsed: "anthropic", error: err instanceof Error ? err.message : "Unknown AI provider error" };
    }
  },
};

function parseModelJson(text: string): any | null {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
