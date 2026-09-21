import Groq from "groq-sdk";
import type { ExplanationProvider } from "../types/contracts.js";
import { buildExplanationSystemPrompt, buildExplanationUserPrompt } from "./prompts.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 6000;

export function createGroqExplanationProvider(apiKey: string, model = DEFAULT_MODEL): ExplanationProvider {
  const client = new Groq({ apiKey });

  return {
    async explain(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: buildExplanationSystemPrompt() },
              { role: "user", content: buildExplanationUserPrompt(input) },
            ],
            temperature: 0.4,
            max_tokens: 200,
          },
          { signal: controller.signal },
        );
        const text = completion.choices[0]?.message?.content?.trim();
        if (!text) throw new Error("empty completion from Groq");
        return text;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
