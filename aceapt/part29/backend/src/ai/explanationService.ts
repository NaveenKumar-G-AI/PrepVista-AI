import Anthropic from '@anthropic-ai/sdk';
import { AlignmentExplanationFacts } from '../domain/types';

/**
 * Explainable AI (spec §47-48): "Use AI only to translate structured
 * results into understandable language... The AI should receive
 * structured facts. It should not invent them." This function is the only
 * place in the whole module an LLM is ever called — every score, gap, and
 * state it might describe was already decided deterministically by
 * engine/alignmentEngine.ts before this function ever runs.
 *
 * AlignmentExplanationFacts (domain/types.ts) is deliberately the ONLY
 * thing this function can see: no student id, no raw evidence, nothing
 * that isn't already a vetted, narrow, display-ready fact. There is
 * nothing resembling untrusted user text in that payload, so the usual
 * prompt-injection surface doesn't really apply here — but the strict
 * "use only these facts" system prompt and the fallback below are kept
 * anyway, on the same "never trust generation to also be the source of
 * truth" principle used elsewhere in ACEAPT's AI layers.
 *
 * No ANTHROPIC_API_KEY configured -> automatic template fallback. Nothing
 * about this feature requires a key to work end to end.
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_OUTPUT_CHARS = 1200;

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cachedClient;
}

const SYSTEM_PROMPT = `You are ALIGN's explanation layer inside ACEAPT, a student capability-alignment product.

You will receive a JSON object of ALREADY-COMPUTED facts about one student's alignment with one target role. Your only job is to turn those facts into two or three calm, plain-English sentences a student can read in seconds.

Hard rules:
- Use ONLY the facts given to you. Never invent a capability, a number, a job-market claim, or an outcome guarantee that isn't in the input.
- Never state or imply a numeric score that isn't present in the input.
- Never say "guaranteed", "you'll get the job/role", or anything that promises an outcome.
- If fitScore or readinessScore is null, do not invent a number in its place — say evidence is still being gathered for this target.
- Tone: evidence-based and calm, never hype. Prefer "your demonstrated X is currently strong" over "you're amazing at X". Never say things like "you are not suitable" — prefer "several core capabilities remain below the target requirement".
- Output plain prose only — no markdown, no bullet points, no headers, no emoji.`;

export interface ExplanationResult {
  text: string;
  source: 'ai' | 'template';
}

export async function explainAlignment(facts: AlignmentExplanationFacts): Promise<ExplanationResult> {
  const anthropic = getClient();
  if (!anthropic) {
    return { text: templateExplanation(facts), source: 'template' };
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 220,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(facts) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim();

    if (!text || text.length > MAX_OUTPUT_CHARS) {
      // Empty or suspiciously long — show something predictable instead.
      return { text: templateExplanation(facts), source: 'template' };
    }
    return { text, source: 'ai' };
  } catch (err) {
    console.error('[explanationService] Anthropic call failed, using template fallback:', err);
    return { text: templateExplanation(facts), source: 'template' };
  }
}

/** The deterministic explanation this feature falls back to with no API key, and the floor for what the AI version is allowed to say less clearly than. */
export function templateExplanation(facts: AlignmentExplanationFacts): string {
  if (facts.state === 'INSUFFICIENT_EVIDENCE') {
    return `We don't have enough evidence yet for a reliable alignment reading on ${facts.targetName}. Complete a few more targeted assessments to generate one.`;
  }

  const sentences: string[] = [];

  const openParts: string[] = [];
  if (facts.fitScore !== null) {
    openParts.push(`Your demonstrated capabilities currently show a ${facts.fitScore}% fit with ${facts.targetName}`);
  } else {
    openParts.push(`Your demonstrated capabilities are being compared against ${facts.targetName}`);
  }
  if (facts.topStrengths.length > 0) {
    openParts.push(`led by ${joinList(facts.topStrengths)}`);
  }
  sentences.push(`${openParts.join(', ')}.`);

  if (facts.readinessScore !== null) {
    sentences.push(
      `Readiness sits at ${facts.readinessScore}%, reflecting how much of that capability has been proof-verified so far.`,
    );
  }

  if (facts.criticalGapNames.length > 0) {
    const verb = facts.criticalGapNames.length === 1 ? 'remains' : 'remain';
    sentences.push(
      `${joinList(facts.criticalGapNames)} ${verb} below the bar this target requires, which is currently capping the overall alignment.`,
    );
  } else if (facts.supportingGapNames.length > 0) {
    const verb = facts.supportingGapNames.length === 1 ? 'has' : 'have';
    sentences.push(`${joinList(facts.supportingGapNames)} still ${verb} room to grow.`);
  }

  return sentences.join(' ');
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
