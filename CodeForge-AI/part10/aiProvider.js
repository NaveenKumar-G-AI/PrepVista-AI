/**
 * AI Provider abstraction (Phase 41-43) — the LIVE counterpart to
 * demoAIReviewer.js. Not executed in this sandbox: no network access and
 * no API keys here. Written carefully but unverified — smoke-test against
 * your real Groq/Gemini keys before wiring it into evaluationEngine.js.
 *
 * Design rules this file follows:
 *  - Never throws past this module. Every path either returns a parsed
 *    object or null, so callers (evaluationEngine.js) can always fall back
 *    to deterministic-only scoring (Phase 43) — AI can degrade the
 *    experience, never break it.
 *  - Never used for anything deterministic (test results, auth, mastery
 *    arithmetic, submission state) — see Phase 42. This module only ever
 *    feeds the qualitative categories in aiContract.QUALITATIVE_CATEGORIES.
 *  - If CodeForge already has an AI-provider abstraction elsewhere in the
 *    codebase (Phase 41 says reuse, don't duplicate), point evaluationEngine
 *    at that instead of this file — this is only useful if you don't have
 *    one yet, or want a dedicated provider setup for this feature.
 */

const DEFAULT_TIMEOUT_MS = 20000;

export class AIProviderError extends Error {}

async function withTimeout(fn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} apiKey
 * @param {string} [model]
 */
export function createGroqProvider(apiKey, model = 'llama-3.3-70b-versatile') {
  return {
    name: 'groq',
    /** @param {string} systemPrompt @param {string} userPrompt */
    async generateStructured(systemPrompt, userPrompt) {
      const res = await withTimeout(
        (signal) =>
          fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.2,
            }),
          }),
        DEFAULT_TIMEOUT_MS
      );
      if (!res.ok) throw new AIProviderError(`Groq responded ${res.status}`);
      const data = await res.json();
      return JSON.parse(data.choices[0].message.content);
    },
  };
}

/**
 * @param {string} apiKey
 * @param {string} [model]
 */
export function createGeminiProvider(apiKey, model = 'gemini-2.0-flash') {
  return {
    name: 'gemini',
    async generateStructured(systemPrompt, userPrompt) {
      const res = await withTimeout(
        (signal) =>
          fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
            }),
          }),
        DEFAULT_TIMEOUT_MS
      );
      if (!res.ok) throw new AIProviderError(`Gemini responded ${res.status}`);
      const data = await res.json();
      return JSON.parse(data.candidates[0].content.parts[0].text);
    },
  };
}

/**
 * Tries providers in order (e.g. Groq first, Gemini fallback); returns
 * null — never throws — if all fail, so evaluateSubmission's try/catch
 * around deps.aiReview always has a clean deterministic-only path.
 *
 * @param {Array<{ name: string, generateStructured(s: string, u: string): Promise<any> }>} providers
 */
export function createProviderRouter(providers) {
  return {
    async generateStructured(systemPrompt, userPrompt) {
      for (const provider of providers) {
        try {
          return await provider.generateStructured(systemPrompt, userPrompt);
        } catch {
          continue; // try the next provider
        }
      }
      return null;
    },
  };
}

// ------------------------------------------------------------
// Prompt templates
// ------------------------------------------------------------

export const CODE_REVIEW_SYSTEM_PROMPT = `You are reviewing a student's code submission for a software engineering training platform.

STRICT RULES:
- Only comment on code that is present verbatim in the submission provided below.
- If you cannot point to the exact file for an observation, omit that observation entirely.
- Never invent files, functions, or behavior that isn't shown.
- Respond with ONLY a JSON object matching this shape, no markdown, no commentary:
{
  "feedback": [ { "category": string, "observation": string, "impact": string, "recommendation": string, "evidenceRef": string } ],
  "categoryScoreAdjustments": { "code_quality": number, "architecture": number, "documentation": number }
}
categoryScoreAdjustments may ONLY include the keys code_quality, architecture, documentation (0-100 each) — never functionality, testing, or security, which are scored deterministically elsewhere.`;

/**
 * @param {{ project: import('../types').ProjectDefinition, submissionFiles: Record<string,string> }} args
 */
export function buildCodeReviewUserPrompt({ project, submissionFiles }) {
  const fileBlock = Object.entries(submissionFiles)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join('\n\n');
  return `PROJECT: ${project.title}\nREQUIREMENTS: ${JSON.stringify(project.requirements)}\n\nSUBMISSION FILES:\n${fileBlock}`;
}

export const REQUIREMENT_REVIEW_SYSTEM_PROMPT = `You are evaluating a student's requirement-analysis write-up against a business requirement, for a software engineering training platform.
Score coverage, clarity, assumption quality, edge-case identification, and constraint understanding (Phase 7).
Respond with ONLY JSON: { "categoryScoreAdjustments": { "requirement_quality": number }, "feedback": [ { "category": string, "observation": string, "impact": string, "recommendation": string } ] }`;

/**
 * @param {{ project: import('../types').ProjectDefinition, studentAnalysis: string }} args
 */
export function buildRequirementReviewUserPrompt({ project, studentAnalysis }) {
  return `BUSINESS REQUIREMENT:\n${JSON.stringify(project.requirements)}\n\nSTUDENT'S ANALYSIS:\n${studentAnalysis}`;
}
