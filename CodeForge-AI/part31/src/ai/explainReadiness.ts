import type { ReadinessResult } from '../domain/types';

/** Fields safe to show a student directly — internal-only fields (evidence ids, algorithm internals) are stripped (Phase 21). */
export interface StudentFacingReadinessView {
  roleName: string;
  readinessState: ReadinessResult['readinessState'];
  readinessScore: number;
  confidence: ReadinessResult['confidence'];
  strengths: { skillName: string; message: string }[];
  blockers: { skillName: string; message: string; severity: string }[];
  recentTrendSkills: { skillName: string; trend: string }[];
}

export function toStudentFacingView(result: ReadinessResult): StudentFacingReadinessView {
  return {
    roleName: result.roleName,
    readinessState: result.readinessState,
    readinessScore: result.readinessScore,
    confidence: result.confidence,
    strengths: result.strengths.map((s) => ({ skillName: s.skillName, message: s.message })),
    blockers: result.blockers.map((b) => ({ skillName: b.skillName, message: b.message, severity: b.severity })),
    recentTrendSkills: result.skillBreakdown
      .filter((s) => s.recentTrend === 'improving' || s.recentTrend === 'declining')
      .map((s) => ({ skillName: s.skillName, trend: s.recentTrend })),
  };
}

/**
 * Always-available, zero-dependency explanation (Phase 31: "if AI fails,
 * the deterministic readiness result must still be available"). This is
 * not a degraded experience bolted on as an afterthought — it's the
 * guaranteed baseline every student gets, with the AI version as an
 * enhancement layered on top when it's available and passes the sanity
 * check below.
 */
export function templateExplanation(view: StudentFacingReadinessView): string {
  const parts: string[] = [];
  parts.push(
    `You're currently "${view.readinessState.replace(/_/g, ' ').toLowerCase()}" for ${view.roleName} ` +
      `(readiness score ${view.readinessScore}/100, ${view.confidence} confidence).`,
  );
  if (view.strengths.length) {
    parts.push(`Strong areas: ${view.strengths.map((s) => s.skillName).join(', ')}.`);
  }
  if (view.blockers.length) {
    const critical = view.blockers.filter((b) => b.severity === 'critical');
    const list = (critical.length ? critical : view.blockers).map((b) => b.message);
    parts.push(`What's currently blocking readiness: ${list.join(' ')}`);
  }
  return parts.join(' ');
}

function extractNumbers(text: string): number[] {
  return (text.match(/\d+(\.\d+)?/g) ?? []).map(Number);
}

/**
 * The only number that's meaningfully "in" a student-facing view is the
 * readiness score itself — everything else is names, states, and prose.
 * This is a cheap, imperfect heuristic, not a guarantee: real protection
 * comes from the strict system prompt and from handing the model only
 * structured facts (never raw evidence) in the first place. Treat this as
 * a tripwire that trades some false positives (falls back to template
 * unnecessarily) for catching obviously fabricated figures.
 */
function numbersInView(view: StudentFacingReadinessView): Set<number> {
  return new Set([view.readinessScore]);
}

export interface ExplainOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface ExplainResult {
  explanation: string;
  source: 'ai' | 'template';
  warning?: string;
}

const SYSTEM_PROMPT = [
  'You explain an ALREADY-COMPUTED technical role readiness result to a student, in plain, encouraging language.',
  'You must not invent or alter any score, skill name, evidence, blocker, strength, or requirement.',
  'Only use the facts given to you in the JSON below. If something is not present, do not mention it.',
  'Never invent employer requirements, specific companies, or claims about the job market.',
  'Keep it to 3-5 sentences.',
].join(' ');

/**
 * AI explanation layer (Phase 30-31). Architecture: deterministic result ->
 * structured, scrubbed view -> AI -> prose. The model receives ONLY the
 * already-computed StudentFacingReadinessView — never raw evidence, never
 * an instruction that lets it "decide" a readiness value. On any failure —
 * missing key, HTTP error, empty response, or a suspicious untraceable
 * number in the output — this falls back to templateExplanation(), which
 * requires no network call and cannot fail the same ways.
 */
export async function explainReadiness(result: ReadinessResult, options: ExplainOptions = {}): Promise<ExplainResult> {
  const view = toStudentFacingView(result);
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
  const baseUrl = options.baseUrl ?? 'https://api.anthropic.com/v1/messages';

  if (!apiKey) {
    return { explanation: templateExplanation(view), source: 'template', warning: 'ANTHROPIC_API_KEY not set' };
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(view) }],
      }),
    });

    if (!response.ok) {
      return { explanation: templateExplanation(view), source: 'template', warning: `AI explanation HTTP ${response.status}` };
    }

    const data: any = await response.json();
    const text = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join(' ')
      .trim();

    if (!text) {
      return { explanation: templateExplanation(view), source: 'template', warning: 'empty AI response' };
    }

    const allowed = numbersInView(view);
    const suspicious = extractNumbers(text).filter((n) => !allowed.has(n) && n > 1);
    if (suspicious.length > 2) {
      return { explanation: templateExplanation(view), source: 'template', warning: 'AI response contained untraceable numbers' };
    }

    return { explanation: text, source: 'ai' };
  } catch (err: any) {
    return {
      explanation: templateExplanation(view),
      source: 'template',
      warning: `AI explanation failed: ${err?.message ?? 'unknown error'}`,
    };
  }
}
