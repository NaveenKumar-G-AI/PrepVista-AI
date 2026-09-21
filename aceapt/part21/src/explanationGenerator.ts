// ============================================================
// EXPLANATION GENERATOR (spec §5, §30, §44)
//
// Turns a diagnosis + action into language that: hedges honestly by
// confidence level, cites the actual evidence, and never claims
// causality an intervention hasn't earned yet. The template-based
// generator below always works, fully offline. enhanceWithLLM() is
// a strictly optional rewrite pass — see its docstring.
// ============================================================

import { BottleneckCandidate, ConfidenceLevel, InterventionRecord, ScoredAction, SkillDiagnosisReport, SkillId } from './types';

export function explainPrimaryAction(action: ScoredAction, report: SkillDiagnosisReport): string {
  const hypothesis = report.hypotheses[0];
  if (!hypothesis) {
    return `"${report.skillId}" looks stable right now — no specific action needed.`;
  }

  const lines: string[] = [confidenceOpener(hypothesis.confidence), ...hypothesis.evidenceSummary.map((e) => `• ${e}`)];

  if (action.isPrerequisiteRepair) {
    lines.push(`Highest-value move: ${action.reason}`);
  }

  lines.push(`Suggested next step: ${action.action.label} — about ${formatDuration(action.action.baseDurationMinutes)}.`);
  lines.push(`We'll verify with: ${hypothesis.verificationMethod}`);
  return lines.join('\n');
}

function confidenceOpener(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'HIGH':
      return 'ACEAPT found strong evidence for the following:';
    case 'MEDIUM':
      return 'ACEAPT detected evidence consistent with the following:';
    case 'LOW':
      return 'There are early, not-yet-strong signs of the following — worth watching, not a firm conclusion yet:';
    default:
      return "Not enough evidence yet to say what's going on here:";
  }
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return 'no time at all';
  return `${minutes} min`;
}

export function explainRootCauseInsight(bottleneck: BottleneckCandidate, skillNames: Map<SkillId, string>): string {
  const name = skillNames.get(bottleneck.skillId) ?? bottleneck.skillId;
  const downstreamNames = bottleneck.downstreamWeakSkillIds.map((id) => skillNames.get(id) ?? id);
  return `Your biggest current blocker may not be the topic you most recently got wrong. Recent evidence points to "${name}" as the shared root cause behind ${downstreamNames.join(
    ', '
  )}. Repairing "${name}" first is likely to help all of them at once.`;
}

/** Reports an intervention's measured effect without overclaiming causality (spec §44). */
export function explainVerifiedIntervention(record: InterventionRecord, skillNames: Map<SkillId, string>): string {
  const name = skillNames.get(record.skillId) ?? record.skillId;
  const actionLabel = record.actionType.toLowerCase().replace(/_/g, ' ');
  if (record.beforeMetric === undefined || record.afterMetric === undefined) {
    return `A ${actionLabel} intervention was tried on "${name}". Outcome: ${record.outcome}.`;
  }
  const before = Math.round(record.beforeMetric * 100);
  const after = Math.round(record.afterMetric * 100);
  const verb = record.outcome === 'IMPROVED' ? 'improved' : record.outcome === 'WORSENED' ? 'declined' : 'stayed about the same';
  return `"${name}" was at ${before}% before a ${actionLabel} intervention. It's at ${after}% now — performance ${verb} after the intervention.`;
}

export function explainEscalation(pastFailures: InterventionRecord[], skillNames: Map<SkillId, string>): string | null {
  const failed = pastFailures.filter((iv) => iv.outcome === 'NO_CHANGE' || iv.outcome === 'WORSENED');
  if (failed.length === 0) return null;
  const name = skillNames.get(failed[0].skillId) ?? failed[0].skillId;
  const tried = failed.map((iv) => iv.actionType.toLowerCase().replace(/_/g, ' ')).join(', then ');
  return `We already tried ${tried} on "${name}" without lasting improvement, so we're stepping up to something more substantial rather than repeating what hasn't worked.`;
}

/**
 * Optional: if ANTHROPIC_API_KEY and ANTHROPIC_MODEL are both set, ask
 * Claude to rewrite the template output in a warmer, more personal voice
 * while preserving every hedge, number, and fact exactly. Falls back to
 * the plain template on any missing config or failure — the engine's
 * correctness never depends on this succeeding, only its tone does.
 *
 * A model string is intentionally NOT hardcoded here — fill in
 * ANTHROPIC_MODEL yourself with whatever current model you intend to
 * use, rather than trusting a default baked in ahead of time.
 */
export async function enhanceWithLLM(templateText: string, studentName: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return templateText;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system:
          'You rewrite ACEAPT diagnosis explanations for a student. Keep every hedge word ("evidence consistent with", "may", "early signs", etc.), every number, and every fact exactly as given. Do not add new claims or drop the confidence hedging. Speak directly to the student by name, warmly and briefly.',
        messages: [{ role: 'user', content: `Student name: ${studentName}\n\nTemplate:\n${templateText}` }],
      }),
    });
    if (!response.ok) return templateText;
    const data: unknown = await response.json();
    const text = extractFirstText(data);
    return text ?? templateText;
  } catch {
    return templateText; // an optional tone pass must never break the pipeline
  }
}

function extractFirstText(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('content' in data)) return null;
  const content = (data as { content: unknown }).content;
  if (!Array.isArray(content)) return null;
  const block = content.find((b): b is { type: string; text: string } => typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text');
  return typeof block?.text === 'string' && block.text.length > 0 ? block.text : null;
}
