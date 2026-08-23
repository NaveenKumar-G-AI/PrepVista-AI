'use strict';

/**
 * AIProvider — abstract base class.
 *
 * Spec section 6: "Create a provider interface conceptually: AIProvider -
 * generate(), stream(), structured_output(), tool_call(). Provider
 * configuration must come from secure backend configuration."
 *
 * Nothing in orchestrator.js, toolPlanner, or responseComposer imports
 * AnthropicProvider or GroqProvider by name — they only ever hold a
 * reference typed as AIProvider, constructed once at startup by
 * providers/index-style wiring (see modelRouter.js). This is what makes it
 * possible to swap providers without touching AI domain logic (spec
 * section 7).
 */
class AIProvider {
  constructor(config) {
    if (new.target === AIProvider) {
      throw new Error('AIProvider is abstract and cannot be instantiated directly.');
    }
    this.config = config;
  }

  /** @returns {string} short id used in logs/audit, e.g. "anthropic", "groq", "mock" */
  get name() {
    throw new Error('AIProvider.name must be implemented by subclass.');
  }

  /**
   * Plain text generation, no tools. Used for final answer phrasing once
   * evidence has already been retrieved and grounded.
   * @param {{system: string, messages: Array<{role: string, content: string}>, model: string}} request
   * @returns {Promise<{text: string, usage?: object}>}
   */
  async generate(_request) {
    throw new Error(`${this.name} provider does not implement generate().`);
  }

  /**
   * Streaming variant of generate(). onToken is called with incremental text.
   * @returns {Promise<{text: string, usage?: object}>}
   */
  async stream(_request, _onToken) {
    throw new Error(`${this.name} provider does not implement stream().`);
  }

  /**
   * Ask the model to produce output matching a strict JSON schema (no prose).
   * @param {{system: string, messages: Array, schema: object, model: string}} request
   * @returns {Promise<object>} parsed JSON matching schema
   */
  async structuredOutput(_request) {
    throw new Error(`${this.name} provider does not implement structuredOutput().`);
  }

  /**
   * Tool-calling turn: the model sees the available tools and either answers
   * directly or requests one or more tool calls. The provider NEVER executes
   * tools itself — it only returns the requested calls. Execution always goes
   * through ToolRegistry.executeTool() so permission/schema/audit gates apply
   * uniformly regardless of which provider is configured (see
   * PART12_HOSTILE_REVIEW.md, finding SEC-1).
   * @param {{system: string, messages: Array, tools: Array<object>, model: string}} request
   * @returns {Promise<{
   *   stopReason: 'tool_use'|'end_turn',
   *   text: string|null,
   *   toolCalls: Array<{id: string, name: string, input: object}>
   * }>}
   */
  async toolCall(_request) {
    throw new Error(`${this.name} provider does not implement toolCall().`);
  }
}

module.exports = { AIProvider };
