'use strict';

const crypto = require('crypto');

/**
 * ai_session / ai_message reference shapes (spec section 9).
 * This in-memory store is a stand-in for a real table; swap `sessionStore`
 * for a DB-backed implementation with the same five methods and nothing
 * else in this file changes.
 */
function createInMemorySessionStore() {
  const sessions = new Map(); // id -> session
  const messages = new Map(); // sessionId -> array of ai_message

  return {
    createSession({ institutionId, userId, role }) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const session = {
        id,
        institution_id: institutionId,
        user_id: userId,
        role,
        context: {},
        created_at: now,
        last_activity_at: now,
        status: 'active',
      };
      sessions.set(id, session);
      messages.set(id, []);
      return session;
    },

    getSession(id) {
      return sessions.get(id) || null;
    },

    addMessage(sessionId, { role, content, metadata }) {
      const session = sessions.get(sessionId);
      if (!session) throw new Error(`Unknown AI session: ${sessionId}`);
      const msg = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        role,
        content,
        timestamp: new Date().toISOString(),
        metadata: metadata || {},
      };
      messages.get(sessionId).push(msg);
      session.last_activity_at = msg.timestamp;
      return msg;
    },

    getHistory(sessionId, limit) {
      const all = messages.get(sessionId) || [];
      return typeof limit === 'number' ? all.slice(-limit) : all.slice();
    },

    /** Configurable retention (spec section 9): drop sessions idle past retentionDays. */
    pruneExpired(retentionDays) {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      let pruned = 0;
      for (const [id, session] of sessions) {
        if (new Date(session.last_activity_at).getTime() < cutoff) {
          sessions.delete(id);
          messages.delete(id);
          pruned += 1;
        }
      }
      return pruned;
    },
  };
}

/**
 * Builds the layered context object described in spec section 12:
 *   Layer 1 systemRules, Layer 2 identity/permissions, Layer 3 UI context,
 *   Layer 4 trimmed conversation history, Layer 5 tool results (filled in
 *   later by the orchestrator), Layer 6 is "hand this to the model" —
 *   deliberately not part of the object itself.
 *
 * Critical security property (see PART12_HOSTILE_REVIEW.md, finding SEC-2):
 * entityRefs coming from the client (selectedStudentId, selectedDriveId,
 * etc.) are NEVER trusted as-is. Every ref is re-resolved through
 * `resolveEntity`, which the caller must wire to real, permission-checked
 * lookups. If resolution fails or the user isn't authorized for that
 * entity, the ref is dropped from context rather than passed through.
 */
function buildContext({ user, route, entityRefs = {}, filters = {}, history = [], resolveEntity, systemRules }) {
  const resolvedEntities = {};
  for (const [refName, ref] of Object.entries(entityRefs)) {
    if (!ref || !ref.type || !ref.id) continue;
    const resolved = resolveEntity ? resolveEntity(ref.type, ref.id, user) : null;
    if (resolved) {
      resolvedEntities[refName] = { type: ref.type, id: ref.id, entity: resolved };
    }
    // Silently dropped if unresolved/unauthorized — the AI simply won't
    // know about an entity the user can't prove access to, rather than
    // erroring in a way that confirms the ID exists.
  }

  return {
    systemRules: systemRules || null,
    identity: {
      userId: user.id,
      role: user.role,
      institutionId: user.institutionId,
      departmentScope: user.departmentScope || null,
      permissionScope: user.permissionScope || 'own_scope',
    },
    uiContext: {
      route,
      filters,
      entities: resolvedEntities,
    },
    history,
    toolResults: [], // populated by the orchestrator during Layer 5
  };
}

module.exports = { createInMemorySessionStore, buildContext };
