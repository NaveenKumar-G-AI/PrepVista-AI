import { config, isLlmConfigured } from '../config';

/**
 * The only place in this codebase that talks to an LLM. Per Section 38, the
 * LLM is used ONLY for wording — explanations, examples, hints, question
 * phrasing, conversational feedback. It never decides the root cause or
 * which intervention to run; that is 100% deterministic engine logic that
 * runs before this is ever called.
 *
 * ANTHROPIC_API_KEY is intentionally blank in .env.example — fill it in
 * when you're ready. Until then, every caller below has a deterministic
 * template fallback, so the product works end-to-end with no key at all.
 */

interface LlmRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

async function callAnthropic({ system, prompt, maxTokens = 400 }: LlmRequest): Promise<string | null> {
  if (!isLlmConfigured()) return null;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.llmModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('[llmService] Anthropic API error', response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const textBlock = data.content?.find((b) => b.type === 'text' && b.text);
    return textBlock?.text?.trim() ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[llmService] Anthropic API call failed', err);
    return null;
  }
}

const TUTOR_SYSTEM_PROMPT =
  'You are a calm, precise aptitude tutor inside an EdTech product. ' +
  'You are given a diagnosed root cause and asked to produce ONE short piece of content. ' +
  'Never invent facts about the student. Never say "wrong answer" bluntly. Keep it concise, ' +
  'concrete, and encouraging without being saccharine. Do not use emoji.';

export async function generateExplanation(args: {
  skillLabel: string;
  microSkillLabel?: string;
  style: string;
  rootCauseLabel: string;
}): Promise<{ text: string; source: 'llm' | 'template' }> {
  const prompt =
    `Explain "${args.microSkillLabel ?? args.skillLabel}" using a ${args.style} approach. ` +
    `The student's diagnosed gap is: ${args.rootCauseLabel}. Keep it under 90 words.`;
  const llm = await callAnthropic({ system: TUTOR_SYSTEM_PROMPT, prompt, maxTokens: 220 });
  if (llm) return { text: llm, source: 'llm' };
  return { text: templateExplanation(args.microSkillLabel ?? args.skillLabel, args.style), source: 'template' };
}

export async function generateHintText(args: {
  level: number;
  skillLabel: string;
  microSkillLabel?: string;
}): Promise<{ text: string; source: 'llm' | 'template' }> {
  const templates = [
    `Think about which concept this question is really testing within "${args.microSkillLabel ?? args.skillLabel}".`,
    'What is the first step you would take, before doing any arithmetic?',
    'Walk through your reasoning one step at a time — where does the logic connect to the numbers given?',
    'Here is part of the approach: identify the known values first, then decide which formula relates them.',
    'Here is a fuller walkthrough of the approach, so you can see exactly how the pieces fit together.',
  ];
  const fallback = templates[Math.min(args.level - 1, templates.length - 1)];
  const prompt =
    `Give hint level ${args.level} of 5 (1=nudge, 5=near-complete walkthrough, never the final numeric answer) ` +
    `for a question on "${args.microSkillLabel ?? args.skillLabel}". Keep it to 1-2 sentences.`;
  const llm = await callAnthropic({ system: TUTOR_SYSTEM_PROMPT, prompt, maxTokens: 120 });
  if (llm) return { text: llm, source: 'llm' };
  return { text: fallback, source: 'template' };
}

export async function generateErrorFeedback(args: {
  rootCauseLabel: string;
  errorStepDescription: string;
}): Promise<{ why: string; howToAvoid: string; source: 'llm' | 'template' }> {
  const prompt =
    `A student's solution first went wrong at this step: "${args.errorStepDescription}". ` +
    `The diagnosed root cause is ${args.rootCauseLabel}. In JSON with keys "why" and "howToAvoid" ` +
    `(each one short sentence, no markdown), explain why that step likely failed and how to avoid it next time. ` +
    `Respond with ONLY the JSON object.`;
  const llm = await callAnthropic({ system: TUTOR_SYSTEM_PROMPT, prompt, maxTokens: 200 });
  if (llm) {
    try {
      const cleaned = llm.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.why && parsed.howToAvoid) {
        return { why: parsed.why, howToAvoid: parsed.howToAvoid, source: 'llm' };
      }
    } catch {
      // fall through to template
    }
  }
  return {
    why: `This is the point where the approach diverged from what the question required (${args.rootCauseLabel.toLowerCase()}).`,
    howToAvoid: 'Pause at this exact step next time and double-check it against what the question is asking before continuing.',
    source: 'template',
  };
}

export async function generateQuestionPhrasing(args: {
  basePrompt: string;
  strategyLabel: string;
}): Promise<{ text: string; source: 'llm' | 'template' }> {
  // The numbers/answer are always generated deterministically (see skillGraph.ts) —
  // the LLM, when configured, is only used to add light contextual variation to
  // the wording so repeated practice doesn't feel templated.
  return { text: args.basePrompt, source: 'template' };
}

function templateExplanation(subject: string, style: string): string {
  const byStyle: Record<string, string> = {
    simple: `In plain terms, "${subject}" is about identifying what you know, what you're solving for, and the one relationship that connects them.`,
    real_world: `Think of "${subject}" like checking a shop receipt: you know some numbers on the bill, and you're working backward to one you don't.`,
    analogy: `"${subject}" works like adjusting a recipe: if you know the finished result and the percentage change, you can work back to the original amount.`,
    visual: `Picture a bar split into two parts — the original amount and the change. "${subject}" is about figuring out how big the original bar was.`,
    formula_first: `Start from the relationship: SP = CP × (1 ± percentage/100) for "${subject}". Rearranging it tells you exactly which operation to use.`,
    step_by_step: `For "${subject}": 1) note what's given, 2) note what's asked, 3) pick the formula that connects them, 4) rearrange before substituting numbers.`,
    worked_example: `Here's a similar case worked fully for "${subject}": lay out the given values, choose the formula, rearrange it, then substitute — each step shown explicitly.`,
    counterexample: `Notice what happens if you pick the wrong operation for "${subject}" — the result becomes inconsistent with the numbers given, which is the tell that the method was wrong.`,
  };
  return byStyle[style] ?? byStyle.simple;
}
