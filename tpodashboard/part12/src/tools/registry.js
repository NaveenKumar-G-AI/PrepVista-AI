'use strict';

const { validate } = require('./schema');
const { checkToolPermission, checkEntityScope, minimizeFields, PermissionError } = require('../security/permissionGuard');
const { requiresConfirmation } = require('../security/actionSafety');
const { EVENTS } = require('../security/auditLog');

/**
 * ToolRegistry — spec section 13: "The AI must interact through explicit
 * tools... Every tool must define: name, description, input schema, output
 * schema, permissions, side-effect status, confirmation requirement, audit
 * behavior."
 *
 * executeTool() is the ONLY sanctioned path from "the model wants to call a
 * tool" to "a handler actually runs". Nothing else in this codebase calls a
 * tool's handler directly (this is verified by
 * tests/toolRegistry.test.js and called out in PART12_HOSTILE_REVIEW.md
 * finding SEC-1).
 *
 * Tool definition shape:
 * {
 *   name, description, category,
 *   inputSchema,               // JSON-schema-ish, see tools/schema.js
 *   permissions: [ROLES...],
 *   safetyLevel,                // security/actionSafety SAFETY_LEVELS
 *   scopeMode: 'single'|'list'|'none',
 *   listPath,                   // for scopeMode 'list': dotted path to the array, default 'items'
 *   includeSensitiveFields,     // opt-in, TPO_ADMIN only, default false
 *   handler: async (params, { user, context }) => rawResult,
 *   previewHandler: async (params, { user, context }) => previewObject, // required if safetyLevel >= LOW_RISK_WRITE
 * }
 */
class ToolRegistry {
  constructor({ auditLog }) {
    this.tools = new Map();
    this.auditLog = auditLog;
  }

  registerTool(def) {
    const required = ['name', 'description', 'category', 'permissions', 'safetyLevel', 'handler'];
    for (const key of required) {
      if (def[key] === undefined) throw new Error(`Tool definition missing required field "${key}".`);
    }
    if (this.tools.has(def.name)) throw new Error(`Tool "${def.name}" is already registered.`);
    this.tools.set(def.name, { scopeMode: 'none', listPath: 'items', includeSensitiveFields: false, ...def });
  }

  getTool(name) {
    return this.tools.get(name) || null;
  }

  /** Only tools the given role is permitted to call — this is what gets offered to the model, so it can't even see a tool it can't use. */
  listTools({ role } = {}) {
    const all = [...this.tools.values()];
    const visible = role ? all.filter((t) => t.permissions.includes(role)) : all;
    return visible.map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      inputSchema: t.inputSchema,
      safetyLevel: t.safetyLevel,
    }));
  }

  #filterListForScope(raw, listPath, user) {
    const path = listPath || 'items';
    const list = path === '' ? raw : raw?.[path];
    if (!Array.isArray(list)) return { data: raw, filteredCount: 0 };

    let filteredCount = 0;
    const kept = list.filter((item) => {
      try {
        checkEntityScope(user, item);
        return true;
      } catch (err) {
        if (err instanceof PermissionError) {
          filteredCount += 1;
          return false;
        }
        throw err;
      }
    });

    const data = path === '' ? kept : { ...raw, [path]: kept };
    return { data, filteredCount };
  }

  async executeTool(name, rawParams, user, context = {}, opts = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      this.auditLog?.record(EVENTS.AI_TOOL_FAILED, { tool: name, userId: user?.id, reason: 'unknown_tool' });
      return { success: false, error: `Unknown tool "${name}".`, code: 'UNKNOWN_TOOL' };
    }

    if (requiresConfirmation(tool.safetyLevel, context.policy) && !opts.confirmed) {
      return {
        success: false,
        error: `Tool "${name}" changes data (safety level ${tool.safetyLevel}) and must go through proposeAction/confirmAction, not a direct call.`,
        code: 'CONFIRMATION_REQUIRED',
      };
    }

    const { valid, errors } = validate(tool.inputSchema, rawParams);
    if (!valid) {
      this.auditLog?.record(EVENTS.AI_TOOL_FAILED, { tool: name, userId: user?.id, reason: 'invalid_input', errors });
      return { success: false, error: `Invalid input for "${name}": ${errors.join(' ')}`, code: 'INVALID_INPUT' };
    }

    try {
      checkToolPermission(user, tool);
    } catch (err) {
      this.auditLog?.record(EVENTS.AI_PERMISSION_DENIED, { tool: name, userId: user?.id, role: user?.role, code: err.code });
      return { success: false, error: err.message, code: err.code };
    }

    this.auditLog?.record(EVENTS.AI_TOOL_CALLED, { tool: name, userId: user.id, category: tool.category });

    let raw;
    try {
      raw = await tool.handler(rawParams, { user, context });
    } catch (err) {
      this.auditLog?.record(EVENTS.AI_TOOL_FAILED, { tool: name, userId: user.id, reason: 'handler_error', message: err.message });
      return { success: false, error: `Tool "${name}" failed: ${err.message}`, code: 'TOOL_EXECUTION_ERROR' };
    }

    let data = raw;
    let filteredCount = 0;

    if (tool.scopeMode === 'single') {
      try {
        checkEntityScope(user, raw);
      } catch (err) {
        this.auditLog?.record(EVENTS.AI_PERMISSION_DENIED, { tool: name, userId: user.id, code: err.code });
        return { success: false, error: err.message, code: err.code };
      }
    } else if (tool.scopeMode === 'list') {
      const filtered = this.#filterListForScope(raw, tool.listPath, user);
      data = filtered.data;
      filteredCount = filtered.filteredCount;
    }

    data = minimizeFields(data, { tool, user });

    const envelope = {
      success: true,
      data,
      source: {
        module: tool.category,
        tool: tool.name,
        generated_at: new Date().toISOString(),
      },
    };
    if (filteredCount > 0) {
      envelope.source.note = `${filteredCount} record(s) omitted — outside your permission scope.`;
    }
    return envelope;
  }
}

module.exports = { ToolRegistry };
