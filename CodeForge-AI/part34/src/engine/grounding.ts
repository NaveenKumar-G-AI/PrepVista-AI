// ============================================================================
// Phase 41 — "The evaluation model must only use supplied evidence. It must
// not hallucinate project functionality, technologies, code behavior..."
//
// This module is the ONLY place that turns StudentEvidenceContext into text
// handed to the AI gateway. Centralizing it means there is exactly one
// function to audit for "does this leak more than it should" and exactly one
// function to fix if the summary format ever needs to change.
// ============================================================================

import type { CodeExcerpt, SkillId, StudentEvidenceContext } from "../domain/types.js";

export interface GroundingContext {
  evidenceSummaries: string[];
  codeExcerpt?: { language: string; content: string; excerptId: string };
}

/**
 * Builds ONLY the evidence strings relevant to one skill. Evidence for other
 * skills is never included — this both keeps prompts small and prevents a
 * question about SQL from being grounded in unrelated System Design evidence.
 */
export function buildGroundingContext(evidence: StudentEvidenceContext, skillId: SkillId, preferCodeGrounded: boolean): GroundingContext {
  const summaries: string[] = [];

  const snapshot = evidence.perSkill[skillId];
  if (snapshot) {
    summaries.push(
      `Prior evidence for this skill: state=${snapshot.evidenceState}, confidence=${snapshot.confidence.toFixed(2)}, based on ${snapshot.sources.length} source(s).`,
    );
    for (const source of snapshot.sources) {
      summaries.push(`Evidence source: ${source.sourceType} — ${source.description}`);
    }
  } else {
    summaries.push(`No prior evidence recorded for ${skillId}.`);
  }

  let codeExcerpt: GroundingContext["codeExcerpt"];
  if (preferCodeGrounded && evidence.projectContext) {
    const match = pickRelevantExcerpt(evidence.projectContext.codeExcerpts, skillId);
    if (match) {
      codeExcerpt = { language: match.language, content: match.content, excerptId: match.id };
      summaries.push(`Project: "${evidence.projectContext.title}". Verified components: ${evidence.projectContext.verifiedComponents.join("; ")}.`);
    }
  }

  return { evidenceSummaries: summaries, codeExcerpt };
}

function pickRelevantExcerpt(excerpts: CodeExcerpt[], skillId: SkillId): CodeExcerpt | undefined {
  // No arbitrary fallback: grounding a question in code that was never
  // tagged as relevant to this skill would mean claiming a relationship
  // that doesn't exist (Phase 41). If nothing matches, the caller falls
  // back to evidence-summary or generic-fallback grounding instead.
  return excerpts.find((e) => e.relatedSkillIds.includes(skillId));
}
