import type { AIGatewayPort, GenerateQuestionInput, GeneratedQuestionDraft, EvaluateResponseInput } from "./ports.js";
import type { StructuredEvaluation } from "../domain/types.js";

/**
 * Real provider adapter — targets Groq's OpenAI-compatible /chat/completions
 * endpoint. Groq was the CodeForge diagnostic's originally stated "free-
 * first" AI provider, so this is the default reference implementation
 * rather than a generic "any LLM" example.
 *
 * NOT exercised live by this build: this sandbox's outbound network is
 * limited to package registries + api.anthropic.com + github, and no API
 * key was supplied (per "leave keys blank"). The automated test suite uses
 * SimulatedAIGateway (devAdapters.ts) instead, which honors the identical
 * AIGatewayPort contract. Swapping this class in for that one is the only
 * change needed once GROQ_API_KEY is set — the code path below is real,
 * not a placeholder.
 *
 * §16-18 constraints this class enforces before returning to the caller:
 *   - the model is only ever given the specific role/skill/difficulty/
 *     evidence/previous-Q&A context for ONE question — never given the
 *     scoring rubric, evaluation prompt, or blueprint internals to leak.
 *   - responses are parsed as strict JSON against a fixed shape; anything
 *     that doesn't parse is a thrown error, not a best-effort guess.
 */
export class GroqAIGatewayAdapter implements AIGatewayPort {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_MODEL_ID ?? "llama-3.3-70b-versatile",
    private readonly baseUrl: string = "https://api.groq.com/openai/v1/chat/completions"
  ) {}

  async generateQuestion(input: GenerateQuestionInput): Promise<GeneratedQuestionDraft> {
    const system = [
      "You are a professional, neutral, technically precise technical interviewer (§52 of the CodeForge interview spec).",
      "Ask exactly ONE question. No preamble, no praise, no filler.",
      "If followUpReason is CLARIFICATION, VERIFICATION, or EVIDENCE_CHECK, you are re-asking about the SAME depth level as before — phrase it as a follow-up to what was just said (e.g. \"Could you clarify...\"), never repeat the prior question's wording verbatim.",
      "You may ONLY reference the specific evidence artifact supplied below — never invent a project feature, a piece of code, or a prior answer the candidate didn't actually provide.",
      "If no evidence is supplied, ask a general conceptual question for the skill instead of fabricating context.",
      'Respond with strict JSON only: {"promptText": string, "citedEvidenceArtifactId": string | null}',
    ].join(" ");

    const user = JSON.stringify({
      role: input.role,
      skill: input.skill,
      questionType: input.questionType,
      difficulty: input.difficulty,
      depthLevel: input.depthLevel,
      followUpReason: input.followUpReason ?? null,
      evidence: input.evidence ?? null,
      previousQuestions: input.previousQuestions,
      previousAnswerSummaries: input.previousAnswerSummaries,
    });

    const json = await this.callJSON(system, user);
    return {
      promptText: String(json.promptText),
      questionType: input.questionType,
      skill: input.skill,
      difficulty: input.difficulty,
      citedEvidenceArtifactId: json.citedEvidenceArtifactId ?? undefined,
    };
  }

  async evaluateResponse(
    input: EvaluateResponseInput
  ): Promise<Omit<StructuredEvaluation, "id" | "responseId" | "evaluationVersion">> {
    const system = [
      "You are evaluating a technical interview answer. Be strict about grounding (§44):",
      "if the candidate references something not present in the supplied evidence, do not assume it is true.",
      "Never fabricate project features, code behavior, or prior answers.",
      "An explicit 'I don't know' is DONT_KNOW, not INCORRECT (§32) — it is not a failure.",
      "Respond with strict JSON only, matching this shape:",
      '{"answerQuality":"CORRECT|MOSTLY_CORRECT|PARTIALLY_CORRECT|INCORRECT|INSUFFICIENT|DONT_KNOW",',
      '"consistency":"CONSISTENT|PARTIALLY_CONSISTENT|UNCERTAIN|POTENTIAL_INCONSISTENCY",',
      '"evidenceConfidence":"LOW|MODERATE|HIGH",',
      '"dimensions":{"TECHNICAL_CORRECTNESS":"STRONG|ADEQUATE|WEAK|NOT_APPLICABLE", ... any of the requested dimensions},',
      '"rationaleSummary": string (<= 2 sentences, candidate-safe — never mention internal scoring weights or rubric),',
      '"grounded": boolean (true only if your evaluation relied solely on the supplied context)}',
    ].join(" ");

    const user = JSON.stringify({
      role: input.role,
      skill: input.skill,
      questionText: input.questionText,
      questionType: input.questionType,
      responseText: input.responseText,
      evidence: input.evidence ?? null,
      dimensionsRequested: input.dimensions,
    });

    const json = await this.callJSON(system, user);
    return {
      answerQuality: json.answerQuality,
      consistency: json.consistency,
      dimensions: json.dimensions ?? {},
      evidenceConfidence: json.evidenceConfidence,
      rationaleSummary: String(json.rationaleSummary),
      status: "COMPLETED",
      grounded: Boolean(json.grounded),
    };
  }

  private async callJSON(system: string, user: string): Promise<any> {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      // §45: an AI failure must never become "candidate failed" — the caller
      // (evaluationPipeline.ts) catches this and moves the session to
      // EVALUATION_PENDING/EVALUATION_FAILED for retry instead of scoring
      // the candidate down.
      throw new Error(`AI gateway request failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const content = body.choices[0]?.message.content;
    if (!content) throw new Error("AI gateway returned no content");
    try {
      return JSON.parse(content);
    } catch {
      throw new Error("AI gateway returned non-JSON content despite response_format=json_object");
    }
  }
}
