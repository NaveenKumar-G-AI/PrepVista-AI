'use strict';

/** Spec section 61 — pick a structured UI hint from the shape of the evidence, so the frontend can render a table/list/cards instead of only prose. */
function inferResponseType(successfulEvidence) {
  if (successfulEvidence.length === 0) return 'answer';
  const single = successfulEvidence[0];
  const d = single.result.data;
  if (Array.isArray(d?.items) && d.items.length > 3) return 'table';
  if (single.tool.startsWith('get_executive_metrics') || single.tool.startsWith('get_placement_funnel')) return 'metric_cards';
  if (single.tool === 'prepare_message') return 'draft_action';
  if (single.tool === 'send_message') return 'confirmation_card';
  if (Array.isArray(d?.items)) return 'student_list';
  return 'answer';
}

/**
 * Deterministic, evidence-only phrasing used when the mock provider is
 * active (offline dev/demo/tests). Every clause below reads a value out of
 * `data` — nothing here is a canned answer to a canned question (spec
 * section 5); it is generic formatting logic keyed on tool *name*, applied
 * to whatever real numbers that tool actually returned this call. A real
 * provider (Anthropic/Groq) replaces this entire function with fluent,
 * more context-sensitive phrasing via generate() — see the branch in
 * compose() below.
 */
function renderDeterministic(evidence) {
  const lines = [];
  for (const e of evidence) {
    if (!e.result.success) {
      lines.push(`Couldn't complete ${e.tool}: ${e.result.error}`);
      continue;
    }
    const d = e.result.data;
    switch (e.tool) {
      case 'get_expiring_offers':
        lines.push(`${d.count} offer(s) are pending acceptance and expire within the requested window.`);
        break;
      case 'get_pending_results':
      case 'get_interview_issues':
        lines.push(`${d.count} interview result(s) have been pending for more than the threshold.`);
        break;
      case 'get_unapplied_eligible_students': {
        const deptBits = Object.entries(d.byDepartment || {}).map(([dep, n]) => `${n} ${dep}`).join(', ');
        lines.push(`${d.count} eligible student(s) haven't applied${deptBits ? ` (${deptBits})` : ''}.`);
        break;
      }
      case 'get_data_quality':
        lines.push(
          d.unverifiedJoiningRecords > 0
            ? `${d.unverifiedJoiningRecords} of ${d.totalJoiningRecords} joining record(s) are unverified — figures using them should be treated as provisional.`
            : 'No outstanding data-quality issues found.'
        );
        break;
      case 'get_drive_health':
        lines.push(
          `${d.drive.role} at this drive: ${d.eligibleCount} eligible, ${d.appliedCount} applied (${d.applicationRatePct}%), ` +
          `${d.unappliedCount} unapplied. Deadline in ${d.hoursUntilDeadline}h.${d.deadlineRisk ? ' Deadline risk flagged.' : ''}`
        );
        break;
      case 'get_executive_metrics':
        lines.push(
          `Institution-wide: ${d.eligible} eligible, ${d.applied} applied (${d.applicationRatePct}%), ${d.placed} placed (${d.placementRatePct}%).` +
          (d.belowTarget ? ` This is ${d.gapPts} points below the ${d.targetPct}% target.` : '')
        );
        break;
      case 'get_placement_funnel':
        lines.push(`Funnel: ${d.eligible} eligible -> ${d.applied} applied -> ${d.interviewed} interviewed -> ${d.offered} offered -> ${d.joined} joined.`);
        break;
      case 'get_department_report': {
        const rows = Object.entries(d).map(([dep, v]) => `${dep}: ${v.applicationRatePct}% applied, ${v.interviewConversionPct ?? 'n/a'}% interview conversion`);
        lines.push(rows.join(' | '));
        break;
      }
      case 'get_round_conversion': {
        const rows = Object.entries(d.ratesPct || {}).map(([dep, rate]) => `${dep} ${rate}%`);
        lines.push(`Interview conversion by department: ${rows.join(', ')}. Institutional median: ${d.institutionMedianPct}%.`);
        break;
      }
      case 'get_training_effectiveness':
        lines.push(
          d.note ||
          `${d.programName}: ${d.completions} completions, average improvement ${d.avgImprovement} points across all assessed students.`
        );
        break;
      case 'prepare_message':
        lines.push(`Draft prepared for ${d.draft.recipientCount} recipient(s): "${d.draft.body}"`);
        break;
      case 'send_message':
        lines.push(`${d.total} message(s) sent. ${d.delivered} delivered, ${d.failed} failed.`);
        break;
      default: {
        if (typeof d?.count === 'number') lines.push(`${e.tool}: ${d.count} record(s) found.`);
        else lines.push(`${e.tool} returned data (see evidence).`);
      }
    }
  }
  return lines.join(' ');
}

async function composeResponse({ evidence, provider, userMessage, model }) {
  if (evidence.length === 0) {
    return {
      type: 'answer',
      answer: "I don't have enough verified data to answer that reliably. Could you point me at the drive, student, or department you mean?",
      uncertain: true,
      evidence: [],
    };
  }

  const successes = evidence.filter((e) => e.result.success);
  const failures = evidence.filter((e) => !e.result.success);

  if (successes.length === 0) {
    return {
      type: 'answer',
      answer: `I couldn't retrieve the data needed to answer that. ${failures.map((f) => f.result.error).join(' ')}`,
      uncertain: true,
      evidence: evidence.map((e) => ({ tool: e.tool, error: e.result.error })),
    };
  }

  const notes = successes.map((e) => e.result.data?.note).filter(Boolean);

  let answerText;
  if (provider.name === 'mock') {
    answerText = renderDeterministic(evidence);
  } else {
    const evidenceBlock = successes
      .map((e) => `Tool ${e.tool} called with ${JSON.stringify(e.input)} returned: ${JSON.stringify(e.result.data).slice(0, 1500)}`)
      .join('\n');
    const prompt = [
      `TPO question: ${userMessage}`,
      '',
      'Evidence (already retrieved and permission-filtered — treat every field below as ground truth, and never state a number that is not present here):',
      evidenceBlock,
      '',
      'Respond with: a direct Answer, the supporting Evidence in plain language, an Interpretation only if clearly supported by the evidence, and a Recommended next step only if genuinely useful. Be concise.',
    ].join('\n');
    const result = await provider.generate({ system: '', messages: [{ role: 'user', content: prompt }], model });
    answerText = result.text;
  }

  return {
    type: inferResponseType(successes),
    answer: answerText,
    uncertain: notes.length > 0 || failures.length > 0,
    notes,
    evidence: successes.map((e) => ({ tool: e.tool, source: e.result.source, filteredNote: e.result.source.note })),
    partialFailures: failures.map((f) => ({ tool: f.tool, error: f.result.error })),
  };
}

module.exports = { composeResponse, inferResponseType, renderDeterministic };
