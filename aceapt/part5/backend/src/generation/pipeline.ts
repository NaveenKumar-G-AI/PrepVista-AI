import { Skill } from "../domain/types";
import { QuestionRepository } from "../repositories/questionRepository";
import { SkillRepository } from "../repositories/catalogRepository";
import { AnalyticsRepository } from "../repositories/analyticsRepository";
import { QuestionSpecification } from "./types";
import { TemplateProvider } from "./templateProvider";
import { AnthropicProvider } from "./anthropicProvider";
import { runQualityGate } from "./qualityGate";
import { Question } from "../domain/types";

export interface PipelineOutcome {
  question: Question | null;
  fromPool: boolean;
  providerTried: string[];
  note?: string;
}

/**
 * §32 end-to-end: Question Specification → Generation → Structural Validation
 * → Answer Validation → Explanation Validation → Difficulty Evaluation →
 * Skill Mapping → Quality Gate → Question Pool → Student.
 *
 * §43 performance: checks the existing pool FIRST and only generates when
 * genuinely needed — this is what keeps the engine from burning model calls
 * (or even template-render calls) on every single question.
 */
export async function fulfillQuestionSpec(
  spec: QuestionSpecification,
  opts: { preferPool?: boolean; allowAI?: boolean; excludeQuestionIds?: string[] } = {}
): Promise<PipelineOutcome> {
  const preferPool = opts.preferPool ?? true;

  if (preferPool) {
    const poolMatches = QuestionRepository.findCandidates({ skillId: spec.skill.id, excludeQuestionIds: opts.excludeQuestionIds });
    const closeEnough = poolMatches.filter((q) => Math.abs(q.difficulty.level - spec.targetDifficulty) <= 1 && !spec.avoidTemplateIds.includes(q.templateId ?? ""));
    if (closeEnough.length > 0) {
      return { question: null, fromPool: true, providerTried: [] }; // caller does its own ranked selection over the pool
    }
  }

  const providerTried: string[] = [];
  const knownSkills = new Map(SkillRepository.all().map((s) => [s.id, s]));

  // Template provider first: instant, free, and always available.
  providerTried.push("template");
  const templateResult = await TemplateProvider.generate(spec);
  if (templateResult.question) {
    const gated = gateAndPersist(templateResult.question, knownSkills);
    if (gated.passed) {
      return { question: gated.question, fromPool: false, providerTried };
    }
    AnalyticsRepository.record("question_quality_rejected", null, { provider: "template", issues: gated.issues, questionId: gated.question.id });
  }

  // Only reach for AI if explicitly allowed and actually configured — and
  // even then, an AI miss falls back to the template path rather than failing
  // the request outright (§41 graceful failure handling).
  if (opts.allowAI && AnthropicProvider.isAvailable()) {
    providerTried.push("anthropic");
    const aiResult = await AnthropicProvider.generate(spec);
    if (aiResult.question) {
      const gated = gateAndPersist(aiResult.question, knownSkills);
      AnalyticsRepository.record("ai_generation_attempted", null, { passed: gated.passed, status: gated.status });
      if (gated.passed) {
        return { question: gated.question, fromPool: false, providerTried };
      }
      // AI content lands as REVIEW_REQUIRED, which is intentional (see
      // qualityGate.ts) — fall through to a guaranteed-good template question
      // rather than surfacing unreviewed AI content to a student.
    } else if (aiResult.error) {
      AnalyticsRepository.record("ai_generation_failed", null, { error: aiResult.error });
    }

    // Retry once more on the template path with a slightly relaxed spec so
    // the student still gets *something* this turn.
    const fallback = await TemplateProvider.generate({ ...spec, avoidTemplateIds: [] });
    if (fallback.question) {
      const gated = gateAndPersist(fallback.question, knownSkills);
      if (gated.passed) {
        return { question: gated.question, fromPool: false, providerTried, note: "AI generation was attempted but not released; served a validated template question instead." };
      }
    }
  }

  return { question: null, fromPool: false, providerTried, note: "Generation pipeline could not produce a HEALTHY question for this specification." };
}

function gateAndPersist(question: Question, knownSkills: Map<string, Skill>) {
  const result = runQualityGate(question, knownSkills);
  const finalQuestion: Question = { ...question, qualityStatus: result.status };
  QuestionRepository.upsert(finalQuestion);
  return { passed: result.passed, status: result.status, issues: result.issues, question: finalQuestion };
}
