export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ContextStrategy = 'REJECT' | 'TRUNCATE_OLDEST';

export interface ContextPrepareResult {
  messages: Message[];
  estimatedTokens: number;
  truncated: boolean;
  rejected: boolean;
  reason?: string;
}

/**
 * Approximate token estimator. This is deliberately NOT a claim of exact
 * tokenization for any specific provider — different providers use
 * different tokenizers (and Anthropic's own docs note tokenizer changes
 * between model generations can shift counts by double-digit percentages
 * for the same text). ~4 characters/token is a standard, well-understood
 * approximation for English prose. A production deployment should plug
 * in each provider's real tokenizer here for precise pre-flight budgeting;
 * this keeps the estimator swappable rather than baking the approximation
 * in everywhere it's used.
 */
export interface TokenEstimator {
  estimate(text: string): number;
}

export class ApproximateTokenEstimator implements TokenEstimator {
  estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Enforces a hard context token budget before a request ever reaches a
 * provider. System messages are always preserved (they carry task
 * instructions); the most recent turns are preserved next; older turns
 * are dropped first. If even the system message + the single most recent
 * required turn cannot fit, the request is REJECTED rather than silently
 * truncating something load-bearing.
 */
export class ContextManager {
  constructor(private estimator: TokenEstimator = new ApproximateTokenEstimator()) {}

  prepare(messages: Message[], maxTokens: number, strategy: ContextStrategy = 'TRUNCATE_OLDEST'): ContextPrepareResult {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversation = messages.filter((m) => m.role !== 'system');

    const systemTokens = systemMessages.reduce((sum, m) => sum + this.estimator.estimate(m.content), 0);

    if (systemTokens >= maxTokens) {
      return { messages: [], estimatedTokens: systemTokens, truncated: false, rejected: true, reason: 'System instructions alone exceed the context budget' };
    }

    if (conversation.length === 0) {
      return { messages: systemMessages, estimatedTokens: systemTokens, truncated: false, rejected: false };
    }

    // Walk from most recent backwards, keeping what fits.
    const kept: Message[] = [];
    let runningTokens = systemTokens;
    for (let i = conversation.length - 1; i >= 0; i--) {
      const msgTokens = this.estimator.estimate(conversation[i].content);
      if (runningTokens + msgTokens > maxTokens) break;
      kept.unshift(conversation[i]);
      runningTokens += msgTokens;
    }

    if (kept.length === 0) {
      if (strategy === 'REJECT') {
        return { messages: [], estimatedTokens: runningTokens, truncated: false, rejected: true, reason: 'Even the most recent message exceeds the context budget' };
      }
      return { messages: [], estimatedTokens: runningTokens, truncated: false, rejected: true, reason: 'Most recent message exceeds context budget; nothing could be kept safely' };
    }

    const truncated = kept.length < conversation.length;
    if (truncated && strategy === 'REJECT') {
      return { messages: [], estimatedTokens: runningTokens, truncated: false, rejected: true, reason: 'Input exceeds context budget and REJECT strategy is configured (no silent truncation)' };
    }

    return { messages: [...systemMessages, ...kept], estimatedTokens: runningTokens, truncated, rejected: false };
  }
}

export const contextManager = new ContextManager();
