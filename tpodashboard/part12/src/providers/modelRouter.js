'use strict';

const { AnthropicProvider } = require('./anthropicProvider');
const { GroqProvider } = require('./groqProvider');
const { MockProvider } = require('./mockProvider');
const { assertProviderIsUsable } = require('../config');

/**
 * Builds the single AIProvider instance for this process, from config only.
 * This is the ONE place in the codebase allowed to know provider class
 * names. Everything downstream (orchestrator, toolPlanner, etc.) receives
 * an AIProvider and calls it polymorphically.
 */
function createProvider(config) {
  assertProviderIsUsable(config);
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'groq':
      return new GroqProvider(config);
    case 'mock':
      return new MockProvider(config);
    default:
      throw new Error(`Unknown AI_PROVIDER "${config.provider}". Expected anthropic | groq | mock.`);
  }
}

/**
 * Model routing foundation (spec section 87): pick a model *name* for a
 * given task complexity, without ever hard-coding which provider is in use.
 * Policy itself (which complexity maps to which configured model) stays
 * data — swapping providers or renaming models means editing config/env,
 * not this function.
 *
 * @param {'simple'|'complex'|'report'} complexity
 */
function routeModel(config, complexity) {
  if (complexity === 'simple') return config.fastModel || config.model;
  if (complexity === 'report') return config.longContextModel || config.model;
  return config.model; // 'complex' and any unrecognized value use the primary model
}

module.exports = { createProvider, routeModel };
