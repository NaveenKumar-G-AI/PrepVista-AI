/**
 * Section 29 ("why is this not mastered") + Sections 39-40 ("no magic AI").
 *
 * The template function below is the real, always-available implementation
 * — it is deterministic, testable, and works with zero configuration. If
 * ANTHROPIC_API_KEY is set, generateExplanation() additionally asks Claude
 * to *rephrase* the same already-computed evidence object into warmer
 * prose. The model is only ever handed numbers the engine already computed
 * and is explicitly instructed not to invent any — it has no path to
 * fabricate a score, a flag, or a mastery conclusion. If the call fails or
 * no key is configured, the template output is used as-is.
 */

import { SkillAnalysis } from '../domain/types';

function pct(v: number | null): string {
  return v == null ? 'n/a' : `${Math.round(v * 100)}%`;
}

export function templateExplanation(skillName: string, analysis: SkillAnalysis): string {
  const { evidence, flags, state } = analysis;

  if (flags.includes('INSUFFICIENT_EVIDENCE')) {
    return `There isn't enough independent evidence for ${skillName} yet to say anything definite. ${analysis.confidenceReason}`;
  }

  const sentences: string[] = [];

  if (flags.includes('TRANSFER_GAP')) {
    sentences.push(
      `Your familiar-question accuracy on ${skillName} is strong (${pct(evidence.familiarAccuracy)}), but it drops to ${pct(evidence.novelAccuracy)} when the same concept appears in unfamiliar questions.`
    );
  }
  if (flags.includes('DIFFICULTY_GAP')) {
    sentences.push(
      `Performance is solid on easier ${skillName} questions (${pct(evidence.byDifficulty.easy.accuracy)}) but drops at hard difficulty (${pct(evidence.byDifficulty.hard.accuracy)}).`
    );
  }
  if (flags.includes('INDEPENDENCE_GAP')) {
    sentences.push(
      `With hints, accuracy on ${skillName} is ${pct(evidence.guidedAccuracy)}, but unaided it's ${pct(evidence.independentAccuracy)} \u2014 the method isn't holding up independently yet.`
    );
  }
  if (flags.includes('RETENTION_GAP')) {
    sentences.push(
      `${skillName} accuracy was ${pct(evidence.retention.immediateAccuracy)} right after practice but fell to ${pct(evidence.retention.delayedAccuracy)} on a later check \u2014 a sign it isn't fully retained yet.`
    );
  }
  if (flags.includes('FORMAT_TRANSFER_GAP') || flags.includes('CONTEXT_TRANSFER_GAP')) {
    sentences.push(
      `Accuracy on ${skillName} varies noticeably depending on how the question is presented \u2014 the method may still be tied to one familiar presentation.`
    );
  }
  if (flags.includes('ROOT_CAUSE_GAP')) {
    sentences.push(`Some of this may trace back to a weaker prerequisite skill rather than ${skillName} itself.`);
  }

  if (sentences.length === 0) {
    sentences.push(
      state === 'ROBUST_MASTERY'
        ? `${skillName} holds up across difficulty, format, context and time \u2014 this is robust, evidence-backed mastery.`
        : `${skillName} is progressing with no specific gap currently flagged \u2014 more independent practice will build toward the next mastery check.`
    );
  }

  return sentences.join(' ');
}

export async function generateExplanation(skillName: string, analysis: SkillAnalysis): Promise<string> {
  const fallback = templateExplanation(skillName, analysis);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        system:
          'You phrase mastery-evidence explanations for a student-facing education product. You are given a JSON object of already-computed evidence and flags for one skill. Rewrite it as 2-4 warm, clear sentences aimed at the student. Rules: never invent a number that is not in the JSON; never state a mastery conclusion the JSON does not support; no markdown; no preamble.',
        messages: [
          {
            role: 'user',
            content: `Skill: ${skillName}\nComputed analysis (ground truth, use only these numbers):\n${JSON.stringify(
              {
                state: analysis.state,
                flags: analysis.flags,
                confidence: analysis.confidence,
                evidence: analysis.evidence,
              },
              null,
              2
            )}`,
          },
        ],
      }),
    });

    if (!res.ok) return fallback;
    const data: any = await res.json();
    const text = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join(' ')
      .trim();
    return text || fallback;
  } catch {
    // Network issues, missing/invalid key, etc. must never break the mastery
    // flow — the deterministic explanation is always a complete answer.
    return fallback;
  }
}
