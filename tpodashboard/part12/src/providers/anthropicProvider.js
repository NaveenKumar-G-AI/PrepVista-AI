'use strict';

const { AIProvider } = require('./providerInterface');

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Real Anthropic provider. This calls the live Messages API and is written
 * to the real request/response shape (tool_use / tool_result content
 * blocks). It requires network egress and ANTHROPIC_API_KEY, neither of
 * which is available in the sandbox this module was built in — see
 * PART12_FINAL_REPORT.md truth table for what has and hasn't been
 * network-tested.
 */
class AnthropicProvider extends AIProvider {
  get name() {
    return 'anthropic';
  }

  async #call(body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || this.config.timeoutMs);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKeys.anthropic,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Anthropic API error ${res.status}: ${errText}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async generate({ system, messages, model }) {
    const data = await this.#call({
      model: model || this.config.model,
      max_tokens: this.config.maxOutputTokens,
      temperature: this.config.temperature,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return { text, usage: data.usage };
  }

  async stream(request, onToken) {
    // Streaming requires an SSE-capable fetch loop against the same endpoint
    // with `stream: true`. Not implemented in this pass (see truth table) —
    // falls back to a single non-streamed call so callers relying on
    // stream() still get a correct, if not incremental, result.
    const result = await this.generate(request);
    if (typeof onToken === 'function' && result.text) onToken(result.text);
    return result;
  }

  async structuredOutput({ system, messages, schema, model }) {
    const toolName = 'emit_structured_output';
    const data = await this.#call({
      model: model || this.config.model,
      max_tokens: this.config.maxOutputTokens,
      temperature: 0,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [{ name: toolName, description: 'Emit the final structured result.', input_schema: schema }],
      tool_choice: { type: 'tool', name: toolName },
    });
    const block = (data.content || []).find((b) => b.type === 'tool_use' && b.name === toolName);
    if (!block) throw new Error('Anthropic did not return the expected structured tool_use block.');
    return block.input;
  }

  async toolCall({ system, messages, tools, model }) {
    const data = await this.#call({
      model: model || this.config.model,
      max_tokens: this.config.maxOutputTokens,
      temperature: this.config.temperature,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    });

    const toolCalls = (data.content || [])
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return {
      stopReason: data.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      text: text || null,
      toolCalls,
    };
  }
}

module.exports = { AnthropicProvider };
