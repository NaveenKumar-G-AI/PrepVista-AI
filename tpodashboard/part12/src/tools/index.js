'use strict';

const { ToolRegistry } = require('./registry');

const CATEGORY_FILES = [
  require('./students.tools'),
  require('./companies.tools'),
  require('./drives.tools'),
  require('./applications.tools'),
  require('./interviews.tools'),
  require('./offers.tools'),
  require('./training.tools'),
  require('./readiness.tools'),
  require('./reports.tools'),
  require('./communication.tools'),
  require('./policy.tools'),
];

/**
 * Builds a fresh ToolRegistry with the full catalog registered. Call once
 * per process (or once per test) — registerTool() throws on duplicate
 * names, so this is not meant to be called twice against the same
 * registry instance.
 */
function buildToolRegistry({ auditLog }) {
  const registry = new ToolRegistry({ auditLog });
  for (const categoryTools of CATEGORY_FILES) {
    for (const tool of categoryTools) registry.registerTool(tool);
  }
  return registry;
}

module.exports = { buildToolRegistry };
