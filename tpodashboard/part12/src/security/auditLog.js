'use strict';

const crypto = require('crypto');

/** Spec section 96 — the full published event contract. */
const EVENTS = Object.freeze({
  AI_SESSION_CREATED: 'AI_SESSION_CREATED',
  AI_TOOL_CALLED: 'AI_TOOL_CALLED',
  AI_TOOL_FAILED: 'AI_TOOL_FAILED',
  AI_RESPONSE_GENERATED: 'AI_RESPONSE_GENERATED',
  AI_ACTION_PROPOSED: 'AI_ACTION_PROPOSED',
  AI_ACTION_CONFIRMED: 'AI_ACTION_CONFIRMED',
  AI_ACTION_EXECUTED: 'AI_ACTION_EXECUTED',
  AI_ACTION_FAILED: 'AI_ACTION_FAILED',
  AI_PERMISSION_DENIED: 'AI_PERMISSION_DENIED',
});

// Fields that must never be written to the audit log verbatim (spec
// section 56: "Do not log raw sensitive prompts unnecessarily" / section
// 76: "Do not expose private prompts broadly").
const NEVER_LOG_KEYS = new Set(['rawPrompt', 'fullMessage', 'phone', 'email', 'address', 'documents']);

function minimizeForAudit(payload) {
  const out = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (NEVER_LOG_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * In-memory, append-only. Swap `sink` for a durable write-once store in
 * production (see PART12_HOSTILE_REVIEW.md finding OPS-1 — this reference
 * implementation loses its log on process restart, which is fine for a
 * demo and not fine for production audit requirements).
 */
function createAuditLog() {
  const events = [];

  function record(eventName, payload) {
    if (!Object.values(EVENTS).includes(eventName)) {
      throw new Error(`Unknown audit event "${eventName}" — extend EVENTS in auditLog.js first.`);
    }
    const entry = {
      id: crypto.randomUUID(),
      event: eventName,
      at: new Date().toISOString(),
      ...minimizeForAudit(payload),
    };
    events.push(entry);
    return entry;
  }

  function list({ event, userId, limit } = {}) {
    let out = events;
    if (event) out = out.filter((e) => e.event === event);
    if (userId) out = out.filter((e) => e.userId === userId);
    if (limit) out = out.slice(-limit);
    return out.slice();
  }

  return { record, list, EVENTS };
}

module.exports = { EVENTS, createAuditLog, minimizeForAudit };
