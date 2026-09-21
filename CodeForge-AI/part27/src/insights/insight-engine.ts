import { growthRules, GROWTH_MODEL_VERSION } from '../config/growth-rules.js';
import type { GrowthInsight, TimeWindow } from '../types/insight.js';
import type { SkillState } from '../types/skill-state.js';
import type { GrowthEvent } from '../types/growth-event.js';
import { MockAIProvider, type AIProvider } from './ai-provider.js';
import { PROMPT_INJECTION_SYSTEM_PREAMBLE, fenceStudentContent, scanForInjectionAttempt } from './prompt-injection-defense.js';
import { validateInsightOutput } from './insight-schema.js';
import { logger, metrics } from '../observability/logger.js';

/**
 * Growth Insight Engine (section 44-47, 81-82). Orchestrates: skip AI
 * entirely below a minimum evidence bar (section 102, cost control) ->
 * build a fenced, structural prompt -> call the provider -> parse ->
 * schema+hallucination validate -> deterministic fallback on ANY failure
 * at any step. Nothing here can ever cause a growth-profile request to
 * fail outright just because AI narration had a bad day.
 */

export interface GenerateInsightInput {
  studentId: string;
  skillStates: SkillState[];
  events: GrowthEvent[];
  /** Every evidence id that fed the states/events above — the allow-list used to catch hallucinated references. */
  evidenceIds: string[];
  timeWindow: TimeWindow;
  /** Untrusted — e.g. a student's own written reflection. Fenced before ever reaching a prompt. */
  studentAuthoredNotes?: string;
  provider?: AIProvider;
}

function deterministicFallback(input: GenerateInsightInput): GrowthInsight {
  const changingSkills = input.skillStates.filter((s) => s.trajectory === 'IMPROVING' || s.trajectory === 'RAPIDLY_IMPROVING' || s.trajectory === 'DECLINING');
  const summary =
    changingSkills.length > 0
      ? `${changingSkills.length} skill${changingSkills.length === 1 ? '' : 's'} showed a measurable trend in this window, backed by ${input.evidenceIds.length} evidence record${input.evidenceIds.length === 1 ? '' : 's'}.`
      : `No skill crossed a meaningful trend threshold in this window (${input.evidenceIds.length} evidence record${input.evidenceIds.length === 1 ? '' : 's'} reviewed).`;

  return {
    type: 'growth_insight',
    title: 'Growth summary',
    summary,
    evidenceRefs: input.evidenceIds,
    skills: input.skillStates.map((s) => s.skillId),
    confidence: input.evidenceIds.length >= growthRules.confidence.minEvidenceForModerate ? 'MODERATE' : 'LOW',
    timeWindow: input.timeWindow,
    generatedBy: 'deterministic',
    modelVersion: GROWTH_MODEL_VERSION,
  };
}

export async function generateGrowthInsight(input: GenerateInsightInput): Promise<GrowthInsight> {
  if (input.evidenceIds.length < growthRules.insights.minEvidenceForAiSummary) {
    return deterministicFallback(input);
  }

  const provider = input.provider ?? new MockAIProvider();
  const allowedEvidenceIds = new Set(input.evidenceIds);
  const allowedSkillIds = new Set(input.skillStates.map((s) => s.skillId));

  let fencedNotes: string | undefined;
  if (input.studentAuthoredNotes) {
    const scan = scanForInjectionAttempt(input.studentAuthoredNotes);
    if (scan.suspicious) {
      logger.warn('possible prompt-injection pattern in student-authored notes', { studentId: input.studentId, matchedPatterns: scan.matchedPatterns });
      metrics.incr('insights.injection_pattern_flagged');
    }
    fencedNotes = fenceStudentContent('student_reflection', input.studentAuthoredNotes);
  }

  const startedAt = Date.now();
  try {
    const raw = await provider.generateGrowthSummary({
      systemPreamble: PROMPT_INJECTION_SYSTEM_PREAMBLE,
      structuredEvidence: {
        evidenceRefs: input.evidenceIds,
        skills: input.skillStates.map((s) => ({
          skillId: s.skillId,
          state: s.state,
          trajectory: s.trajectory,
          transfer: s.transfer,
          retention: s.retention,
          confidence: s.confidence.level,
        })),
        events: input.events.map((e) => ({ eventType: e.eventType, skillId: e.skillId, explanation: e.explanation, timestamp: e.timestamp })),
        timeWindow: input.timeWindow,
      },
      studentAuthoredContext: fencedNotes,
      instructions:
        'Return ONLY a JSON object matching this exact shape: {"type":"growth_insight","title":string,"summary":string,"evidence_refs":string[],"confidence":"LOW"|"MODERATE"|"HIGH","time_window":{"label":string,"start":string,"end":string},"skills":string[]}. Every evidence_refs entry and every skills entry MUST come from the structured evidence above — never invent one.',
    });

    metrics.recordDuration('insights.ai_latency_ms', Date.now() - startedAt);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw new Error('AI response was not valid JSON');
    }

    const validation = validateInsightOutput(parsedJson, { allowedEvidenceIds, allowedSkillIds });
    if (!validation.valid || !validation.data) {
      logger.warn('AI insight failed validation, falling back to deterministic summary', { studentId: input.studentId, errors: validation.errors });
      metrics.incr('insights.ai_validation_failures');
      return deterministicFallback(input);
    }

    metrics.incr('insights.ai_summaries_generated');
    return {
      type: 'growth_insight',
      title: validation.data.title,
      summary: validation.data.summary,
      evidenceRefs: validation.data.evidence_refs,
      skills: validation.data.skills,
      confidence: validation.data.confidence,
      timeWindow: input.timeWindow,
      generatedBy: 'ai',
      modelVersion: GROWTH_MODEL_VERSION,
    };
  } catch (err) {
    logger.warn('AI provider failed, falling back to deterministic summary', { studentId: input.studentId, error: err instanceof Error ? err.message : String(err) });
    metrics.incr('insights.ai_provider_failures');
    return deterministicFallback(input);
  }
}
