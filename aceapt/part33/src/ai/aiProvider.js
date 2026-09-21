'use strict';

const config = require('../config');

/**
 * Pluggable AI provider. Rule-based by default (works with zero setup, zero
 * cost, zero external calls). If ANTHROPIC_API_KEY is set and AI_PROVIDER is
 * "anthropic", Feature 33 will use Claude for exactly two narrow jobs:
 *
 *  1. classifyRequirements - propose a capability match for requirement
 *     text the rule-based matcher in seed/capabilities.js couldn't map.
 *  2. phraseExplanation - rewrite the (already-decided) recommendation's
 *     reasons into plainer prose for the student.
 *
 * The AI is never used to decide eligibility, fit, readiness, or the
 * recommendation itself - those come from the deterministic engines. See
 * spec section 66 (AI ROLE) and section 16.
 */
class RuleBasedProvider {
  isAvailable() { return false; }
  // eslint-disable-next-line no-unused-vars
  async classifyRequirements(texts) { return texts.map(() => null); }
  // eslint-disable-next-line no-unused-vars
  async phraseExplanation(context) { return null; } // caller falls back to templated text
}

class AnthropicProvider {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model;
  }

  isAvailable() { return Boolean(this.apiKey); }

  async _complete(prompt, { maxTokens = 512 } = {}) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
      throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  async classifyRequirements(texts) {
    if (texts.length === 0) return [];
    const prompt = [
      'You are classifying job/internship requirement phrases into a fixed capability list.',
      'Respond with ONLY a JSON array, same length and order as the input,',
      'each element either {"capabilityId": "<id>"} or null if nothing matches. No prose, no markdown fences.',
      '',
      `Requirement phrases: ${JSON.stringify(texts)}`,
    ].join('\n');
    const raw = await this._complete(prompt, { maxTokens: 400 });
    try {
      return JSON.parse(raw.trim());
    } catch {
      return texts.map(() => null);
    }
  }

  async phraseExplanation({ action, reasons }) {
    const prompt = [
      'Rewrite the following recommendation reasons as 2-3 short, plain-English sentences for a student.',
      'Do not add new facts, numbers, or promises beyond what is given. Do not guarantee any outcome.',
      `Recommendation: ${action}`,
      `Reasons: ${reasons.join(' | ')}`,
    ].join('\n');
    try {
      return await this._complete(prompt, { maxTokens: 200 });
    } catch (err) {
      console.warn('[aiProvider] explanation phrasing unavailable:', err.message);
      return null;
    }
  }
}

function buildAIProvider() {
  if (config.aiProvider === 'anthropic' && config.anthropicApiKey) {
    return new AnthropicProvider({ apiKey: config.anthropicApiKey, model: config.anthropicModel });
  }
  return new RuleBasedProvider();
}

module.exports = { buildAIProvider, RuleBasedProvider, AnthropicProvider };
