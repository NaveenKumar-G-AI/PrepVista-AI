import Anthropic from '@anthropic-ai/sdk';
import type { Bottleneck, DimensionScores, EvidenceConfidence, ItemResponse, StrongestArea } from '@/lib/db/schema';

// This module is entirely optional. If ANTHROPIC_API_KEY is unset, every
// caller already has a complete, correct, deterministic result without it
// (dimensions, verdicts, readiness, explanations, next-best-action are all
// computed by the engines in lib/engines — never by this file). What AI adds
// here is strictly cosmetic: a warmer, personalized paragraph layered on top
// of numbers that were already finalized before this function is called.
// Spec §39/§71: AI must never become the source of truth for correctness,
// score, or readiness — this function cannot alter any of those even if it
// wanted to, because it never receives write access to them.

export interface DebriefInput {
  targetName: string;
  simulatedReadiness: number;
  evidenceConfidence: EvidenceConfidence;
  dimensions: DimensionScores;
  primaryBottleneck: Bottleneck | null;
  strongestArea: StrongestArea | null;
  freeTextResponses: ItemResponse[];
}

export async function maybeGenerateDebrief(input: DebriefInput): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

    const freeTextSummary = input.freeTextResponses.length
      ? input.freeTextResponses.map((r, i) => `Response ${i + 1}: ${r.freeText?.slice(0, 400) ?? '(empty)'}`).join('\n')
      : '(no written responses submitted)';

    const prompt = `You are writing a short, warm, honest debrief paragraph (3-5 sentences) for a student who just completed a readiness simulation for the "${input.targetName}" target.

Ground truth you must not contradict or restate as more certain than it is:
- Simulated readiness: ${input.simulatedReadiness}% (evidence confidence: ${input.evidenceConfidence})
- Primary bottleneck: ${input.primaryBottleneck ? `${input.primaryBottleneck.label} (${input.primaryBottleneck.verdict})` : 'none detected'}
- Strongest area: ${input.strongestArea ? input.strongestArea.label : 'not yet clear'}
- Dimension scores: capability ${input.dimensions.capability}%, application ${input.dimensions.application}%, transfer ${input.dimensions.transfer}%, speed ${input.dimensions.speed}%, consistency ${input.dimensions.consistency}%, completion ${input.dimensions.completion}%${input.dimensions.decisionQuality !== null ? `, decision quality ${input.dimensions.decisionQuality}/100` : ''}

The student's own written responses during the simulation:
${freeTextSummary}

Write directly to the student ("you"). Reference something specific from their written responses if it's genuinely relevant. Do not invent facts, scores, or outcomes beyond what's given above. Do not say they will pass or fail anything — only describe what this simulation showed. Output only the paragraph, no heading.`;

    const response = await client.messages.create({
      model,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return text || null;
  } catch {
    // Any AI failure is silently non-fatal — the deterministic result is
    // already complete without this paragraph.
    return null;
  }
}
