'use strict';

require('dotenv').config();

/**
 * All secrets/config default to blank or safe local values.
 * Nothing here needs to be filled in for the service to run:
 * - No ANTHROPIC_API_KEY -> AI assistance is skipped, rule-based logic runs instead.
 * - No DATABASE_URL -> the in-memory store is used (see src/db/memoryStore.js).
 * Fill these in later in your own .env (copy .env.example) when you're ready.
 */
const config = {
  port: parseInt(process.env.PORT || '4000', 10),

  // 'rule_based' (default, zero setup) or 'anthropic'
  aiProvider: process.env.AI_PROVIDER || 'rule_based',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',

  // Left blank on purpose - see schema.sql + README "Wiring into the real ACEAPT".
  databaseUrl: process.env.DATABASE_URL || '',
};

module.exports = config;
