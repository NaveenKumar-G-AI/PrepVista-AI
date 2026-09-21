import { z } from 'zod';
import type { StrategyContext, Bottleneck, NextBestMove } from '../types/strategy.js';

// ---------------------------------------------------------------------------
// spec #56: AI OUTPUT CONTRACT
// ---------------------------------------------------------------------------

export const AIRecommendationOutput = z.object({
  summary: z.string().min(1).max(600),
  bottleneck: z.string().min(1).max(300),
  next_best_move: z.string().min(1).max(300),
  reason: z.string().min(1).max(1400),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z.array(z.string()).max(10),
  unknowns: z.array(z.string()).max(10),
  risks: z.array(z.string()).max(10),
  alternatives: z.array(z.string()).max(10),
  conditions: z.array(z.string()).max(10),
  strategy_impact: z.string().min(1).max(400),
  requires_confirmation: z.boolean(),
});

export type AIRecommendationOutput = z.infer<typeof AIRecommendationOutput>;

// ---------------------------------------------------------------------------
// spec #52, #55, #57: PROMPT TEMPLATE
// The LLM's job is bounded to turning an already-computed, already-ranked
// engine result into a clear, honest explanation. It does not re-rank
// candidates or invent a bottleneck — those come from bottleneckEngine.ts
// and nextBestMoveEngine.ts and are passed in as facts.
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are the explanation layer of a career strategy tool for students. You are given
a bottleneck and a next-best-move that a deterministic engine has already
computed and ranked — your job is ONLY to explain them clearly, not to
re-decide them or introduce a different recommendation.

Rules you must follow:
- Never guarantee employment, salary, admission, or any outcome.
- Never invent statistics, companies, or job outcomes. If you don't have a
  fact, say you don't have it.
- Never give medical, legal, or financial advice, and never offer a
  psychological diagnosis.
- Separate FACT (from the provided context), OBSERVATION (a pattern in that
  data), INFERENCE (a reasonable read of the pattern), and ASSUMPTION (a gap
  you are filling) — do not blur these into one another.
- If the next-best-move represents a major strategy change (changing target
  role), set requires_confirmation to true.
- Respond with ONLY a JSON object matching the given schema. No prose before
  or after, no markdown code fences.`;

export function buildUserPrompt(ctx: StrategyContext, bottleneck: Bottleneck | null, nextBestMove: NextBestMove | null): string {
  const compact = {
    targetRole: ctx.goal?.targetRole ?? null,
    evidenceCount: ctx.evidence.length,
    applicationCount: ctx.applications.length,
    constraintHoursPerWeek: ctx.constraints.find((c) => c.type === 'time')?.hoursPerWeek ?? null,
    bottleneck,
    nextBestMove,
  };
  return `Context and computed engine output (already ranked — explain, don't re-rank):\n${JSON.stringify(compact, null, 2)}\n\nReturn the JSON object described in the system prompt.`;
}

// ---------------------------------------------------------------------------
// spec #57, #72: SAFETY / HALLUCINATION CHECK
// A second, independent net in addition to the prompt instructions above —
// prompt instructions can be ignored by a model; this cannot.
// ---------------------------------------------------------------------------

const BANNED_PATTERNS: RegExp[] = [
  /\bguarantee(s|d)?\b/i,
  /\bwill (get|land|secure) you\b/i,
  /\b100%\s*(chance|success|guaranteed)\b/i,
  /\bcertain(ly)? (get|land)\b/i,
  /\bpromise[sd]?\b/i,
];

export interface SafetyCheckResult {
  ok: boolean;
  violations: string[];
}

export function safetyCheck(output: AIRecommendationOutput): SafetyCheckResult {
  const textFields = [output.summary, output.reason, output.strategy_impact, ...output.evidence, ...output.alternatives];
  const violations: string[] = [];
  for (const field of textFields) {
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(field)) {
        violations.push(`Banned language matched "${pattern.source}" in: "${field.slice(0, 80)}..."`);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Parses a raw model string against the contract, stripping common
 * markdown-fence wrapping first. Throws on failure — callers should catch
 * and fall back to the deterministic template (see recommendationService). */
export function parseAndValidate(raw: string): AIRecommendationOutput {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);
  return AIRecommendationOutput.parse(parsed);
}
