/**
 * Minimal AI provider abstraction reusing the pattern CodeForge already has
 * for Groq/Gemini elsewhere in the app — wire this to the SAME provider
 * abstraction if one already exists in the real repository instead of using
 * this one. Credentials are read from env vars only; nothing is hardcoded.
 *
 * If no key is configured, selectProvider() returns MockProvider, which
 * returns an empty finding list rather than throwing — so the service still
 * runs end-to-end (deterministic findings only) with a completely blank
 * .env, exactly as requested. Fill in GROQ_API_KEY or GEMINI_API_KEY later
 * and no other code changes are needed.
 */

export interface AIProvider {
  name: string;
  complete(prompt: string): Promise<string>;
}

export class GroqProvider implements AIProvider {
  name = 'groq';
  constructor(private apiKey: string, private model = 'llama-3.1-70b-versatile') {}

  async complete(prompt: string): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`Groq request failed: ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  }
}

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  constructor(private apiKey: string, private model = 'gemini-1.5-flash') {}

  async complete(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}

export class MockProvider implements AIProvider {
  name = 'mock';
  constructor(private fixedResponse: string | (() => string) = '{"findings":[]}') {}

  async complete(): Promise<string> {
    return typeof this.fixedResponse === 'function' ? this.fixedResponse() : this.fixedResponse;
  }
}

export function selectProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  if (env.GROQ_API_KEY) return new GroqProvider(env.GROQ_API_KEY);
  if (env.GEMINI_API_KEY) return new GeminiProvider(env.GEMINI_API_KEY);
  return new MockProvider();
}

/**
 * Calls the provider and always returns a result, never throws — on timeout,
 * malformed output, or missing keys, deterministic findings remain the whole
 * story for this review. This is what "if AI fails, deterministic findings
 * stay available" means in code, not just in a doc.
 */
export async function tryAIEnrichment(provider: AIProvider, prompt: string): Promise<{ raw: string | null; error: string | null }> {
  try {
    const raw = await provider.complete(prompt);
    return { raw, error: null };
  } catch (err) {
    return { raw: null, error: err instanceof Error ? err.message : String(err) };
  }
}
