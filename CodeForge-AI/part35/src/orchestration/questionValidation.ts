import type { GeneratedQuestionDraft, GenerateQuestionInput } from "../integration/ports.js";

export interface QuestionValidationResult {
  valid: boolean;
  problems: string[];
}

const MIN_PROMPT_LENGTH = 8;
const MAX_PROMPT_LENGTH = 2000;

/**
 * §17 — validated before ever reaching a candidate. §44 grounding is
 * enforced here structurally: a question can only cite the one evidence
 * artifact it was actually given, never a different id it wasn't supplied.
 */
export function validateGeneratedQuestion(
  input: GenerateQuestionInput,
  draft: GeneratedQuestionDraft,
  previousPromptTexts: string[]
): QuestionValidationResult {
  const problems: string[] = [];

  if (!draft.promptText || draft.promptText.trim().length < MIN_PROMPT_LENGTH) {
    problems.push("prompt is empty or too short to be answerable");
  }
  if (draft.promptText.length > MAX_PROMPT_LENGTH) {
    problems.push("prompt exceeds maximum length");
  }
  if (draft.skill !== input.skill) {
    problems.push(`draft skill "${draft.skill}" does not match requested skill "${input.skill}"`);
  }
  if (draft.difficulty !== input.difficulty) {
    problems.push(`draft difficulty "${draft.difficulty}" does not match requested difficulty "${input.difficulty}"`);
  }

  // §44 grounding: the model may only cite the evidence artifact it was actually handed.
  if (draft.citedEvidenceArtifactId && draft.citedEvidenceArtifactId !== input.evidence?.artifactId) {
    problems.push(
      `draft cites evidence artifact "${draft.citedEvidenceArtifactId}" which was not the artifact supplied ("${input.evidence?.artifactId ?? "none"}") — likely hallucinated`
    );
  }
  if (
    (draft.questionType === "PROJECT_BASED" || draft.questionType === "CODE_BASED") &&
    !draft.citedEvidenceArtifactId
  ) {
    problems.push(`${draft.questionType} question must cite a real evidence artifact, but none was cited`);
  }

  // §13 duplication check — near-identical prompt text already asked this session.
  const normalized = normalize(draft.promptText);
  for (const prior of previousPromptTexts) {
    if (normalize(prior) === normalized) {
      problems.push("duplicate of a question already asked in this session");
      break;
    }
  }

  // §19/§52 basic safety/tone floor — reject anything that reads as an
  // instruction to the model rather than a question to the candidate
  // (a crude but real guard against prompt-injected evidence content).
  if (/ignore (all|previous) instructions|you are now/i.test(draft.promptText)) {
    problems.push("prompt text contains suspicious instruction-like content, likely injected from evidence content");
  }

  return { valid: problems.length === 0, problems };
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
