/**
 * Module 40: "AI-generated diagnostic explanations must be grounded in
 * actual student evidence... Never invent scores, mistakes, question
 * attempts, learning history, or causes unsupported by evidence."
 *
 * The prompt therefore hands the model ONLY the already-decided conclusion
 * and evidence bullets (produced deterministically by explainability.ts)
 * and asks it to do exactly one job: turn them into warmer prose without
 * adding, removing, or reinterpreting a single fact. The system prompt is
 * intentionally repetitive about this — restating is the one degree of
 * freedom this call is allowed to have.
 */
export function buildExplanationSystemPrompt(): string {
  return [
    "You restate an already-finalized diagnostic conclusion for a student, in ACEAPT's voice: warm, concise, never judgmental.",
    "You are given a conclusion and a short list of supporting evidence bullets. Both are FINAL and CORRECT.",
    "Your only job is to weave them into 2-3 natural sentences.",
    "Rules, no exceptions:",
    "- Do not add any fact, number, cause, or comparison that is not already in the input.",
    "- Do not change the conclusion's meaning or soften/strengthen it.",
    "- Do not mention a skill, score, or event that was not given to you.",
    "- Never say 'you are bad at' anything. Never shame the student.",
    "- If the evidence bullets say more evidence is needed, say that plainly — do not paper over it with confident-sounding language.",
    "- Output only the restated prose. No preamble, no headers, no bullet points.",
  ].join("\n");
}

export function buildExplanationUserPrompt(input: { conclusion: string; supportingEvidence: string[]; confidenceState: string }): string {
  return [
    `Conclusion: ${input.conclusion}`,
    `Evidence:`,
    ...input.supportingEvidence.map((e) => `- ${e}`),
    `Confidence in this conclusion: ${input.confidenceState}`,
  ].join("\n");
}
