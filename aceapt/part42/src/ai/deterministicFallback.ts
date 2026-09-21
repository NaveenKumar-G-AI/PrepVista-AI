import type { ExplanationProvider } from "../types/contracts.js";

/**
 * Module 39: "LLM output must never silently override deterministic
 * scoring." The simplest way to guarantee that is to make the
 * non-AI path fully correct and complete on its own — the AI layer
 * (groqExplanationAdapter.ts) only ever makes this prose warmer, never
 * more informative. If GROQ_API_KEY is unset, or the call fails or times
 * out, the student gets this instead and loses nothing but some polish.
 */
export const deterministicExplanationProvider: ExplanationProvider = {
  async explain({ conclusion, supportingEvidence, confidenceState }) {
    const evidenceSentence = supportingEvidence.join(" ");
    const confidenceNote =
      confidenceState === "low" || confidenceState === "incomplete"
        ? " We'll get a clearer picture as you answer more questions."
        : "";
    return `${conclusion} ${evidenceSentence}${confidenceNote}`.trim();
  },
};
