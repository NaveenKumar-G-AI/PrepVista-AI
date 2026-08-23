'use strict';

const { AIProvider } = require('./providerInterface');

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Real Groq provider, using Groq's OpenAI-compatible chat completions API
 * with function-calling ("tools") in OpenAI's schema shape. Same caveat as
 * anthropicProvider.js: correct against the documented API surface, not
 * network-tested in this sandbox (no egress, no GROQ_API_KEY here).
 */
class GroqProvider extends AIProvider {
  get name() {
    return 'groq';
  }

  async #call(body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || this.config.timeoutMs);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKeys.groq}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Groq API error ${res.status}: ${errText}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  #toMessages(system, messages) {
    return [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
  }

  async generate({ system, messages, model }) {
    const data = await this.#call({
      model: model || this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxOutputTokens,
      messages: this.#toMessages(system, messages),
    });
    const text = data.choices?.[0]?.message?.content || '';
    return { text, usage: data.usage };
  }

  async stream(request, onToken) {
    const result = await this.generate(request);
    if (typeof onToken === 'function' && result.text) onToken(result.text);
    return result;
  }

  async structuredOutput({ system, messages, schema, model }) {
    const data = await this.#call({
      model: model || this.config.model,
      temperature: 0,
      max_tokens: this.config.maxOutputTokens,
      messages: this.#toMessages(system, messages),
      response_format: { type: 'json_schema', json_schema: { name: 'result', schema, strict: true } },
    });
    const raw = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(raw);
  }

  async toolCall({ system, messages, tools, model }) {
    const data = await this.#call({
      model: model || this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxOutputTokens,
      messages: this.#toMessages(system, messages),
      tools: tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
    });

    const choice = data.choices?.[0];
    const rawCalls = choice?.message?.tool_calls || [];
    const toolCalls = rawCalls.map((c) => ({
      id: c.id,
      name: c.function.name,
      input: JSON.parse(c.function.arguments || '{}'),
    }));

    return {
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      text: choice?.message?.content || null,
      toolCalls,
    };
  }
}

module.exports = { GroqProvider };
