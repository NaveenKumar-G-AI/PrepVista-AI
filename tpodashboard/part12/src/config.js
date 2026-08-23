'use strict';

/**
 * AI configuration.
 *
 * Spec sections 6-7: provider/model/temperature/retry/tool-policy/context-limits
 * must be configurable, and no business-logic file may hard-code a model name
 * or provider. Every other module in this codebase reads its provider/model
 * choice through loadAIConfig() — never by importing a provider class directly
 * with a literal model string.
 *
 * In production this would be sourced from Part 11's Admin AI Controls
 * (spec section 91). Here it is sourced from environment variables with safe
 * defaults, so the same code works whether config comes from env vars,
 * a secrets manager, or an admin-configured DB row — nothing downstream cares
 * which.
 */

function loadAIConfig(env = process.env) {
  const provider = env.AI_PROVIDER || 'anthropic';
  const nodeEnv = env.NODE_ENV || 'development';

  const config = {
    provider,
    nodeEnv,
    model: env.AI_MODEL || null,
    fastModel: env.AI_FAST_MODEL || env.AI_MODEL || null,
    longContextModel: env.AI_LONG_CONTEXT_MODEL || env.AI_MODEL || null,
    temperature: env.AI_TEMPERATURE !== undefined ? Number(env.AI_TEMPERATURE) : 0.2,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS !== undefined ? Number(env.AI_MAX_OUTPUT_TOKENS) : 1024,
    timeoutMs: env.AI_TIMEOUT_MS !== undefined ? Number(env.AI_TIMEOUT_MS) : 30000,
    retry: {
      attempts: env.AI_RETRY_ATTEMPTS !== undefined ? Number(env.AI_RETRY_ATTEMPTS) : 2,
      backoffMs: env.AI_RETRY_BACKOFF_MS !== undefined ? Number(env.AI_RETRY_BACKOFF_MS) : 500,
    },
    toolPolicy: {
      maxParallelTools: env.AI_MAX_PARALLEL_TOOLS !== undefined ? Number(env.AI_MAX_PARALLEL_TOOLS) : 5,
      maxToolCallRoundsPerTurn: env.AI_MAX_TOOL_ROUNDS !== undefined ? Number(env.AI_MAX_TOOL_ROUNDS) : 4,
    },
    contextLimits: {
      maxHistoryMessages: env.AI_MAX_HISTORY_MESSAGES !== undefined ? Number(env.AI_MAX_HISTORY_MESSAGES) : 20,
      maxToolResultChars: env.AI_MAX_TOOL_RESULT_CHARS !== undefined ? Number(env.AI_MAX_TOOL_RESULT_CHARS) : 6000,
    },
    retentionDays: env.AI_SESSION_RETENTION_DAYS !== undefined ? Number(env.AI_SESSION_RETENTION_DAYS) : 90,
    apiKeys: {
      anthropic: env.ANTHROPIC_API_KEY || null,
      groq: env.GROQ_API_KEY || null,
    },
  };

  return config;
}

/**
 * A provider is "usable" only if it is either a real provider with a key
 * configured, or the mock provider explicitly requested outside production.
 * This is what section 107 ("Synthetic-AI Elimination") is enforced by in
 * code, not just in a code-review checklist: production mode refuses to
 * silently fall back to the mock.
 */
function assertProviderIsUsable(config) {
  if (config.provider === 'mock') {
    if (config.nodeEnv === 'production') {
      throw new Error(
        'AI_PROVIDER=mock is not permitted when NODE_ENV=production. ' +
        'The mock provider is a development/test fixture only (spec section 107).'
      );
    }
    return;
  }

  if (config.provider === 'anthropic' && !config.apiKeys.anthropic) {
    throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set.');
  }
  if (config.provider === 'groq' && !config.apiKeys.groq) {
    throw new Error('AI_PROVIDER=groq requires GROQ_API_KEY to be set.');
  }
  if (!config.model) {
    throw new Error('AI_MODEL must be set — no model name is hard-coded in this codebase (spec section 7).');
  }
}

module.exports = { loadAIConfig, assertProviderIsUsable };
