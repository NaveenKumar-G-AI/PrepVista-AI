import { RetentionAssessment } from '../types';
import { pct } from '../utils/math';
import { generateShortText, isAiConfigured } from '../ai/anthropicClient';

/**
 * Every explanation has a deterministic, hand-written fallback first.
 * These are not placeholder text — they're written to the same "avoid
 * generic AI language" bar the spec asks for (section 38), so the product
 * reads well with ANTHROPIC_API_KEY left blank. If a key is configured,
 * the AI call is used to rephrase/personalize the SAME facts — it is
 * never given license to invent new ones.
 */
function buildDeterministicExplanation(a: RetentionAssessment, skillName: string, attempts: number): string {
  switch (a.explanationKey) {
    case 'NO_EVIDENCE':
      return `ACEAPT hasn't seen any evidence for ${skillName} yet, so there's nothing to assess. It'll start forming a picture once you learn or practice it.`;
    case 'RECENTLY_LEARNED_NO_DELAYED_CHECK':
      return `You picked up ${skillName} recently${a.masteryScore != null ? ` and it looked solid at the time (around ${pct(a.masteryScore)})` : ''}. ACEAPT hasn't checked it again after a delay yet, so it can't say anything about retention until it does.`;
    case 'RECOVERING':
      return `${skillName} is mid-recovery right now. Finish the current steps and ACEAPT will tell you whether the improvement held once it checks again after a delay.`;
    case 'VERIFICATION_REQUIRED':
      return `You recovered ${skillName} recently and passed the check right afterward. The one thing ACEAPT hasn't confirmed is whether that improvement actually lasts — that's what this quick check is for.`;
    case 'RECURRING_WEAKNESS':
      return `We've noticed a pattern with ${skillName}: you've worked through it across ${attempts} separate sessions, and it keeps slipping again after it initially looks recovered. Rather than repeating the same kind of recovery, ACEAPT is switching to a more thorough re-explanation this time before testing retrieval again.`;
    case 'FORGOTTEN':
      return `${skillName} has dropped a long way from where it was${a.masteryScore != null ? ` (from around ${pct(a.masteryScore)} when you learned it)` : ''}, and it's been a while since you last got it right. This needs a full re-explanation, not just a quick retrieval nudge.`;
    case 'AT_RISK':
      return `You performed well on ${skillName} when you first learned it${a.masteryScore != null ? ` (around ${pct(a.masteryScore)})` : ''}, but your more recent checks came back lower${a.retentionScore != null ? ` (around ${pct(a.retentionScore)})` : ''}. ACEAPT is treating this as a retention issue, not a basic understanding problem — you knew this once, and it's starting to slip.`;
    case 'DECAYING':
      return `${skillName} is drifting down a little on recent checks${a.retentionScore != null ? ` (around ${pct(a.retentionScore)} now)` : ''} — not urgent yet, but worth a short check before it slides further.`;
    case 'STABLE':
    default:
      return `${skillName} has held up across ${a.delayedEvidenceCount} delayed check${a.delayedEvidenceCount === 1 ? '' : 's'}, so there's nothing to do here right now. ACEAPT will keep watching it quietly rather than asking you to review something you already have.`;
  }
}

export async function explainRetention(a: RetentionAssessment, skillName: string, priorAttempts: number): Promise<string> {
  const fallback = buildDeterministicExplanation(a, skillName, priorAttempts);
  if (!isAiConfigured()) return fallback;

  const prompt = [
    'You are writing ONE short, warm, specific sentence (max 2 sentences) for a student-facing aptitude-prep app called ACEAPT.',
    'Explain the retention finding below in plain language. Do not invent any numbers or facts beyond what is given.',
    'Avoid generic filler like "Great job!" or "Keep practicing!". Be concrete about what the evidence shows.',
    '',
    `Skill: ${skillName}`,
    `Memory state: ${a.memoryState}`,
    `Mastery score: ${a.masteryScore ?? 'unknown'}`,
    `Retention score: ${a.retentionScore ?? 'unknown'}`,
    `Trend: ${a.trend}`,
    `Recurring weakness: ${a.recurringWeakness} (prior recovery attempts: ${priorAttempts})`,
    `Confidence in this assessment: ${a.confidence}`,
    '',
    'A reasonable version of this explanation, for tone reference only (feel free to phrase differently):',
    fallback,
  ].join('\n');

  const aiText = await generateShortText(prompt, 150);
  return aiText ?? fallback;
}
