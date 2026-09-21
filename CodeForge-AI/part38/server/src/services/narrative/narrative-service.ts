import type { Narrative, TechnicalMasteryReportDto } from "../../domain/dto";
import { generateNarrativeViaAi, type NarrativeFacts } from "./ai-client";
import { buildFallbackNarrative, validateNarrativeResult } from "./guardrail";

/**
 * Brief §39, "AI Prompt Safety — send only the minimum authorized
 * structured report data." No internal IDs, no raw evidence refs, no
 * organization data, nothing beyond what's needed to write the narrative.
 */
export function buildNarrativeFacts(dto: Omit<TechnicalMasteryReportDto, "narrative">): NarrativeFacts {
  return {
    studentName: dto.identity.studentName,
    overallMastery: dto.summary.overallMastery,
    targetRole: dto.summary.targetRole,
    roleReadiness: dto.summary.roleReadiness,
    skills: dto.skills.map((s) => ({ name: s.skillName, level: s.masteryLevel, trend: s.trend })),
    strengths: dto.strengths.map((s) => ({ title: s.title, skill: s.skill })),
    weaknesses: dto.weaknesses.map((w) => ({
      title: w.title,
      impact: w.impact,
      recommendedAction: w.recommendedAction,
    })),
    nextBestAction: dto.summary.nextBestAction,
    hasProjectEvidence: dto.evidence.projects.length > 0,
    hasInterviewEvidence: dto.evidence.interviews.length > 0,
    hasGrowthData: !dto.growth.insufficientData,
  };
}

export async function generateNarrative(dto: Omit<TechnicalMasteryReportDto, "narrative">): Promise<Narrative> {
  const facts = buildNarrativeFacts(dto);

  try {
    const aiResult = await generateNarrativeViaAi(facts);
    const check = validateNarrativeResult(aiResult, facts);
    if (check.valid) {
      return { ...aiResult, source: "ai", validated: true };
    }
    // Contradiction found — do not surface it, even partially. Fall through to the deterministic path.
  } catch {
    // AI unavailable/failed — expected and fine, brief §38. Fall through.
  }

  const fallback = buildFallbackNarrative(facts);
  return { ...fallback, source: "fallback", validated: true };
}
