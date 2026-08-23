'use strict';

const { buildContext, createInMemorySessionStore } = require('./session');
const { buildSystemGuard } = require('./security/promptInjectionDefense');
const { createActionSafety } = require('./security/actionSafety');
const { EVENTS } = require('./security/auditLog');
const { routeModel } = require('./providers/modelRouter');
const { composeResponse } = require('./responseComposer');
const { generateBriefing } = require('./briefing');

class AIPlacementOfficer {
  constructor({ provider, registry, config, auditLog, sessionStore, resolveEntity }) {
    if (!provider) throw new Error('AIPlacementOfficer requires a provider.');
    if (!registry) throw new Error('AIPlacementOfficer requires a tool registry.');
    if (!config) throw new Error('AIPlacementOfficer requires config.');
    this.provider = provider;
    this.registry = registry;
    this.config = config;
    this.auditLog = auditLog;
    this.sessionStore = sessionStore || createInMemorySessionStore();
    this.resolveEntity = resolveEntity || (() => null);
    this.actionSafety = createActionSafety({ auditLog });
  }

  createSession({ user, route }) {
    const session = this.sessionStore.createSession({ institutionId: user.institutionId, userId: user.id, role: user.role });
    this.auditLog?.record(EVENTS.AI_SESSION_CREATED, { sessionId: session.id, userId: user.id, role: user.role, route });
    return session;
  }

  #systemPrompt(context) {
    return [
      'You are the PrepVista AI Placement Officer, a tool-grounded assistant for TPO staff (spec: PrepVista AI Part 12).',
      'You may only use the tools offered to you this turn — you cannot see or call any tool outside that list, and the list is already filtered to what this user is permitted to use.',
      'Never state a fact, count, deadline, or name that did not come from a tool result. If evidence is insufficient or conflicting, say so plainly rather than guessing.',
      buildSystemGuard(),
      `Institution: ${context.identity.institutionId}. User role: ${context.identity.role}.`,
      context.uiContext.route ? `Current page: ${context.uiContext.route}.` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Spec section 8's full pipeline. entityRefs carries whatever the
   * frontend says is "currently on screen" (selectedStudentId, etc.) —
   * buildContext re-resolves and re-authorizes every one of them before
   * they ever reach the model (see session.js).
   */
  async handleMessage({ sessionId, user, route, entityRefs = {}, filters = {}, message }) {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) throw new Error(`Unknown AI session "${sessionId}".`);
    if (session.institution_id !== user.institutionId || session.user_id !== user.id) {
      throw new Error('This AI session does not belong to the requesting user.');
    }

    this.sessionStore.addMessage(sessionId, { role: 'user', content: message });
    const priorHistory = this.sessionStore
      .getHistory(sessionId, this.config.contextLimits.maxHistoryMessages)
      .slice(0, -1) // exclude the message we just added — the tool-call loop below adds it explicitly
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const context = buildContext({
      user,
      route,
      entityRefs,
      filters,
      history: priorHistory,
      resolveEntity: this.resolveEntity,
      systemRules: 'PrepVista AI Placement Officer — TPO-side only. No recruiter tools exist.',
    });

    const availableTools = this.registry.listTools({ role: user.role });
    const providerMessages = [...priorHistory, { role: 'user', content: message }];

    const evidence = [];
    let rounds = 0;
    let directText = null;

    while (rounds < this.config.toolPolicy.maxToolCallRoundsPerTurn) {
      rounds += 1;
      const plan = await this.provider.toolCall({
        system: this.#systemPrompt(context),
        messages: providerMessages,
        tools: availableTools,
        model: routeModel(this.config, evidence.length > 4 ? 'report' : 'simple'),
      });

      if (plan.stopReason === 'end_turn' || plan.toolCalls.length === 0) {
        directText = plan.text;
        break;
      }

      const batch = plan.toolCalls.slice(0, this.config.toolPolicy.maxParallelTools);
      const results = await Promise.all(
        batch.map((call) => this.registry.executeTool(call.name, call.input, user, { auditLog: this.auditLog }))
      );
      batch.forEach((call, i) => evidence.push({ tool: call.name, input: call.input, result: results[i] }));

      providerMessages.push({ role: 'assistant', content: `[requested tools: ${batch.map((b) => b.name).join(', ')}]` });
      providerMessages.push({
        role: 'user',
        content:
          `Tool results:\n${batch
            .map((b, i) => `${b.name}: ${JSON.stringify(results[i]).slice(0, this.config.contextLimits.maxToolResultChars)}`)
            .join('\n')}\n` + 'Call more tools if genuinely needed, otherwise answer now.',
      });
    }

    let response;
    if (evidence.length === 0 && directText) {
      response = { type: 'answer', answer: directText, uncertain: false, evidence: [] };
    } else {
      response = await composeResponse({
        evidence,
        provider: this.provider,
        userMessage: message,
        model: routeModel(this.config, 'complex'),
      });
    }

    this.sessionStore.addMessage(sessionId, {
      role: 'assistant',
      content: response.answer,
      metadata: { toolsUsed: evidence.map((e) => e.tool), uncertain: response.uncertain },
    });
    this.auditLog?.record(EVENTS.AI_RESPONSE_GENERATED, {
      sessionId,
      userId: user.id,
      toolsUsed: evidence.map((e) => e.tool),
      uncertain: response.uncertain,
    });

    return response;
  }

  async generateBriefing({ user }) {
    return generateBriefing({ registry: this.registry, user });
  }

  /** Spec sections 46-48: preview before any WRITE/SENSITIVE_WRITE/HIGH_RISK tool executes. */
  async proposeAction({ user, toolName, params }) {
    const tool = this.registry.getTool(toolName);
    if (!tool) throw new Error(`Unknown tool "${toolName}".`);
    const previewData = tool.previewHandler ? await tool.previewHandler(params, { user }) : { action: tool.name, params };
    return this.actionSafety.proposeAction({ tool, params, user, previewData });
  }

  /** Spec sections 48, 90: executes exactly once even under retry (idempotent replay), reports the real result. */
  async confirmAction({ user, proposalId }) {
    return this.actionSafety.confirmAction({
      proposalId,
      user,
      execute: async (proposal) => {
        const result = await this.registry.executeTool(proposal.toolName, proposal.params, user, {}, { confirmed: true });
        if (!result.success) throw new Error(result.error);
        return result.data;
      },
    });
  }
}

module.exports = { AIPlacementOfficer };
