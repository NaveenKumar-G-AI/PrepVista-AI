'use strict';

const crypto = require('crypto');

/** Spec section 66. */
const SAFETY_LEVELS = Object.freeze({
  READ: 0,
  PREPARE: 1,
  LOW_RISK_WRITE: 2,
  SENSITIVE_WRITE: 3,
  HIGH_RISK: 4,
});

/**
 * Spec section 46/65-66: reads execute immediately, PREPARE never has a
 * side effect so it never needs confirmation, level 2 is policy-dependent
 * (defaults to requiring confirmation — a false negative here is a
 * mis-sent message; a false positive just costs one extra click), and
 * levels 3-4 always require explicit confirmation.
 */
function requiresConfirmation(safetyLevel, policy = {}) {
  if (safetyLevel === SAFETY_LEVELS.READ) return false;
  if (safetyLevel === SAFETY_LEVELS.PREPARE) return false;
  if (safetyLevel === SAFETY_LEVELS.LOW_RISK_WRITE) {
    return policy.lowRiskWriteRequiresConfirmation !== false; // default true
  }
  return true; // SENSITIVE_WRITE, HIGH_RISK
}

const PROPOSAL_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * In-memory proposal store. A proposal is single-flight: confirming it
 * twice (e.g. a client retry after a dropped response) replays the cached
 * result instead of re-executing the tool — this is the idempotency
 * mechanism spec section 90 asks for ("if the AI retries after a timeout,
 * it must not send duplicate communication or create duplicate records").
 */
function createActionSafety({ auditLog } = {}) {
  const proposals = new Map();

  function proposeAction({ tool, params, user, previewData }) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const proposal = {
      id,
      toolName: tool.name,
      safetyLevel: tool.safetyLevel,
      params,
      userId: user.id,
      userRole: user.role,
      createdAt: now,
      expiresAt: now + PROPOSAL_TTL_MS,
      status: 'proposed',
      preview: previewData,
      result: null,
    };
    proposals.set(id, proposal);
    auditLog?.record('AI_ACTION_PROPOSED', {
      proposalId: id,
      tool: tool.name,
      userId: user.id,
      safetyLevel: tool.safetyLevel,
    });
    return proposal;
  }

  async function confirmAction({ proposalId, user, execute }) {
    const proposal = proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`No such action proposal: ${proposalId}`);
    }
    if (proposal.userId !== user.id) {
      auditLog?.record('AI_PERMISSION_DENIED', { proposalId, reason: 'confirm_user_mismatch', userId: user.id });
      throw new Error('This action was proposed for a different user and cannot be confirmed here.');
    }

    if (proposal.status === 'confirmed') {
      // Idempotent replay — do not re-execute.
      return { ...proposal.result, replayed: true };
    }

    if (Date.now() > proposal.expiresAt) {
      proposal.status = 'expired';
      throw new Error('This action proposal has expired. Please ask again to get a fresh preview.');
    }

    auditLog?.record('AI_ACTION_CONFIRMED', { proposalId, tool: proposal.toolName, userId: user.id });
    try {
      const result = await execute(proposal);
      proposal.status = 'confirmed';
      proposal.result = result;
      auditLog?.record('AI_ACTION_EXECUTED', { proposalId, tool: proposal.toolName, userId: user.id });
      return { ...result, replayed: false };
    } catch (err) {
      auditLog?.record('AI_ACTION_FAILED', { proposalId, tool: proposal.toolName, userId: user.id, error: err.message });
      throw err;
    }
  }

  function getProposal(id) {
    return proposals.get(id) || null;
  }

  return { proposeAction, confirmAction, getProposal, SAFETY_LEVELS };
}

module.exports = { SAFETY_LEVELS, requiresConfirmation, createActionSafety };
