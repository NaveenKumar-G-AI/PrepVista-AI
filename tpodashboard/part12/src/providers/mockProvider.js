'use strict';

const { AIProvider } = require('./providerInterface');

/**
 * MockProvider — a deterministic stand-in for a real LLM, used only for
 * offline development, unit tests, and this sandbox's demo run.
 *
 * IMPORTANT — what this is NOT: it is not a hand-authored bank of answers
 * to specific questions (that is exactly what spec section 5 and section
 * 107 forbid). It never emits a fact, number, or claim of its own. Its two
 * jobs are:
 *
 *   1. toolCall() — decide which *registered* tools look relevant to the
 *      user's message, using simple keyword matching against each tool's
 *      real name/description (pulled from the live tool registry passed in
 *      at call time, not a hard-coded list). This stands in for the
 *      model's tool-selection reasoning.
 *   2. generate() — deterministically render the evidence it is handed
 *      into prose. Every number in the output is read out of the evidence
 *      object it receives; nothing is invented. A real provider would
 *      phrase this more fluently and could draw qualified interpretations
 *      a keyword matcher cannot — that gap is real and is called out in
 *      PART12_FINAL_REPORT.md.
 *
 * config.assertProviderIsUsable() throws if AI_PROVIDER=mock is selected
 * with NODE_ENV=production, so this class can never become the production
 * reasoning path by accident.
 */
class MockProvider extends AIProvider {
  get name() {
    return 'mock';
  }

  async generate({ messages }) {
    const last = messages[messages.length - 1];
    return { text: typeof last?.content === 'string' ? last.content : '', usage: { note: 'mock provider — no tokens billed' } };
  }

  async stream(request, onToken) {
    const result = await this.generate(request);
    if (typeof onToken === 'function') onToken(result.text);
    return result;
  }

  async structuredOutput({ schema }) {
    // Return the schema's default/empty shape rather than inventing values.
    const out = {};
    const props = schema?.properties || {};
    for (const key of Object.keys(props)) {
      out[key] = props[key].type === 'array' ? [] : props[key].type === 'number' ? 0 : null;
    }
    return out;
  }

  /**
   * Keyword-based tool selection. `tools` is the live, permission-filtered
   * list the caller is actually allowed to see for this turn — the mock
   * provider only ever picks from tools it was handed, exactly like a real
   * model only ever sees the tools offered to it in the request.
   *
   * Matching always looks at the ORIGINAL user question, not at whichever
   * message happens to be last (which, after round 1, is a synthetic
   * "Tool results: ..." message — matching against that would let a tool
   * result's own text, e.g. the word "unverified" inside a data-quality
   * result, re-trigger another round of the same tool call). Tools already
   * requested earlier in this turn are never requested again, which is
   * also what naturally ends the loop after one round for this provider.
   */
  async toolCall({ messages, tools }) {
    const originalQuestion = [...messages].reverse().find((m) => m.role === 'user' && !String(m.content).startsWith('Tool results:'));
    const text = String(originalQuestion?.content || '').toLowerCase();

    const alreadyRequested = new Set();
    for (const m of messages) {
      const match = m.role === 'assistant' && typeof m.content === 'string' && m.content.match(/^\[requested tools: (.+)\]$/);
      if (match) match[1].split(', ').forEach((name) => alreadyRequested.add(name));
    }

    const byName = (name) => tools.find((t) => t.name === name);
    const matched = [];
    const want = (name, input = {}) => {
      if (alreadyRequested.has(name)) return;
      const t = byName(name);
      if (t) matched.push({ id: `mock_${name}_${Math.random().toString(36).slice(2, 8)}`, name, input });
    };

    if (/attention today|briefing|good morning|what needs my attention/.test(text)) {
      want('get_expiring_offers', { withinHours: 48 });
      want('get_pending_results', { olderThanHours: 24 });
      want('get_unapplied_eligible_students', { minReadiness: 75 });
      want('get_data_quality', {});
    } else if (/what should i (do|prioriti[sz]e) first/.test(text)) {
      want('get_drive_health', { driveId: 'drive_abc_tech' });
    } else if (/show (me )?(them|the (23|high[- ]readiness))/.test(text)) {
      want('get_unapplied_eligible_students', { minReadiness: 75, driveId: 'drive_abc_tech' });
    } else if (/prepare a reminder|draft a reminder/.test(text)) {
      want('prepare_message', { driveId: 'drive_abc_tech' });
    } else if (/why is placement below target|below target/.test(text)) {
      want('get_executive_metrics', {});
      want('get_placement_funnel', {});
      want('get_department_report', {});
      want('get_data_quality', {});
    } else if (/eligible students?.*(haven'?t applied|have not applied|not applied)|unapplied eligible|students? who.*(haven'?t|have not|not) applied/.test(text)) {
      want('get_unapplied_eligible_students', {});
    } else if (/high[- ]readiness/.test(text)) {
      want('get_unapplied_eligible_students', { minReadiness: 75 });
    } else if (/expir\w*.*offers?|offers?.*expir\w*/.test(text)) {
      want('get_expiring_offers', { withinHours: 48 });
    } else if (/pending (interview )?results?|results?.*pending/.test(text)) {
      want('get_pending_results', { olderThanHours: 24 });
    } else if (/joining (confirmation|pending)/.test(text)) {
      want('get_joining_pending', {});
    } else if (/(training|bootcamp).*(effective|improvement)/.test(text)) {
      want('get_training_effectiveness', {});
    } else if (/why is (ece|.*) underperforming|department readiness|weakest department/.test(text)) {
      want('get_department_readiness', {});
    } else if (/data quality|incomplete|unverified/.test(text)) {
      want('get_data_quality', {});
    } else if (/company z/.test(text)) {
      want('get_company', { name: 'Company Z' });
    }

    if (matched.length === 0) {
      return { stopReason: 'end_turn', text: null, toolCalls: [] };
    }
    return { stopReason: 'tool_use', text: null, toolCalls: matched };
  }
}

module.exports = { MockProvider };
