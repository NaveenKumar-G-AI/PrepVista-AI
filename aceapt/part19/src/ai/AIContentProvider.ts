// ============================================================================
// AI content generation.
//
// AI is used for ONE thing: generating the text of recall prompts, hints,
// concept reminders, micro-lessons, and contrastive explanations. It never
// decides a score, a risk state, or a stage transition — that logic lives
// entirely in src/engine and is deterministic. This split is intentional:
// "Do not allow AI to invent memory states."
// ============================================================================

export interface ConceptContext {
  conceptId: string;
  /** Human-readable label. Falls back to conceptId if the caller doesn't have one yet. */
  conceptLabel: string;
}

export interface AIContentProvider {
  generateRecallPrompt(ctx: ConceptContext): Promise<string>;
  generateHint(ctx: ConceptContext, level: number): Promise<string>;
  generateConceptReminder(ctx: ConceptContext): Promise<string>;
  generateMicroLesson(ctx: ConceptContext): Promise<string>;
  generateContrastiveExplanation(a: ConceptContext, b: ConceptContext): Promise<string>;
}

/**
 * Deterministic, offline fallback. Used whenever ANTHROPIC_API_KEY is not
 * set, so the whole system — including `npm run demo` — works with zero
 * configuration. Swap in AnthropicContentProvider once a key is available;
 * nothing else has to change since both implement AIContentProvider.
 */
export class DeterministicFallbackProvider implements AIContentProvider {
  async generateRecallPrompt(ctx: ConceptContext): Promise<string> {
    return `Without looking anything up: what's the key idea behind ${ctx.conceptLabel}, and what's the first step on a typical problem?`;
  }
  async generateHint(ctx: ConceptContext, level: number): Promise<string> {
    return `Hint (level ${level}): think about what ${ctx.conceptLabel} is comparing or converting between.`;
  }
  async generateConceptReminder(ctx: ConceptContext): Promise<string> {
    return `Quick reminder: recall the core relationship behind ${ctx.conceptLabel} before you try again.`;
  }
  async generateMicroLesson(ctx: ConceptContext): Promise<string> {
    return `Micro-lesson: a 60-second refresher on ${ctx.conceptLabel}, then one more problem.`;
  }
  async generateContrastiveExplanation(a: ConceptContext, b: ConceptContext): Promise<string> {
    return `${a.conceptLabel} and ${b.conceptLabel} look similar. The difference that matters is what stays fixed and what compounds — spot that before picking a method.`;
  }
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}
interface AnthropicMessageResponse {
  content: AnthropicContentBlock[];
}

/**
 * Real provider — calls the Anthropic Messages API directly. Requires
 * ANTHROPIC_API_KEY. Update ANTHROPIC_MODEL in .env to whatever model
 * string your account currently has access to.
 */
export class AnthropicContentProvider implements AIContentProvider {
  private apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  private model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  private fallback = new DeterministicFallbackProvider();

  private async complete(prompt: string, maxTokens = 200): Promise<string> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) {
        throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
      }
      const data = (await response.json()) as AnthropicMessageResponse;
      const textBlock = data.content.find(b => b.type === 'text');
      return textBlock?.text?.trim() ?? '';
    } catch (err) {
      // Never let a flaky AI call take down a retention check — fall back
      // to deterministic content and let the caller keep going.
      console.error('[AIContentProvider] falling back to deterministic content:', err);
      throw err;
    }
  }

  async generateRecallPrompt(ctx: ConceptContext): Promise<string> {
    return this.complete(
      `Write one short, blind free-recall question (no formulas, no hints, no chapter name) that tests whether a student still remembers "${ctx.conceptLabel}". One sentence.`
    ).catch(() => this.fallback.generateRecallPrompt(ctx));
  }
  async generateHint(ctx: ConceptContext, level: number): Promise<string> {
    return this.complete(
      `Give one small, level-${level} hint (a nudge, not the method) for a student stuck recalling "${ctx.conceptLabel}". One sentence.`
    ).catch(() => this.fallback.generateHint(ctx, level));
  }
  async generateConceptReminder(ctx: ConceptContext): Promise<string> {
    return this.complete(
      `In 2 sentences, remind a student of the core idea of "${ctx.conceptLabel}" without solving anything for them.`
    ).catch(() => this.fallback.generateConceptReminder(ctx));
  }
  async generateMicroLesson(ctx: ConceptContext): Promise<string> {
    return this.complete(
      `Write a 60-second micro-lesson (max 80 words) re-teaching "${ctx.conceptLabel}" from scratch.`
    ).catch(() => this.fallback.generateMicroLesson(ctx));
  }
  async generateContrastiveExplanation(a: ConceptContext, b: ConceptContext): Promise<string> {
    return this.complete(
      `In 2 sentences, explain the single most important difference between "${a.conceptLabel}" and "${b.conceptLabel}" that students confuse.`
    ).catch(() => this.fallback.generateContrastiveExplanation(a, b));
  }
}

export function createAIContentProvider(): AIContentProvider {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicContentProvider() : new DeterministicFallbackProvider();
}
