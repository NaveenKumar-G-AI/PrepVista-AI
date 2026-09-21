import { AIProvider } from './provider';
import { AIInterpretationInput, AIInterpretationOutput } from '../types';
import { buildSystemPrompt, buildUserPayload, validateAIOutput } from './prompt';

// NOTE ON VERIFICATION STATUS:
// These two providers make real network calls to Groq / Gemini and are implemented against
// each provider's documented chat-completion API shape. They are UNVERIFIED LIVE in this
// build environment: the sandbox's network egress is restricted to package registries, and
// GROQ_API_KEY / GEMINI_API_KEY are intentionally left blank in .env.example per the request
// to leave keys out. Set the real keys in your environment and they should work as written —
// but test against the live APIs before relying on them in production.

export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private apiKey: string | undefined;
  private model: string;

  constructor(apiKey = process.env.GROQ_API_KEY, model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async interpret(input: AIInterpretationInput): Promise<AIInterpretationOutput> {
    if (!this.apiKey) throw new Error('GROQ_API_KEY not configured');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPayload(input) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq request failed: ${res.status}`);
    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq response missing content');
    const validated = validateAIOutput(JSON.parse(content));
    if (!validated) throw new Error('Groq response failed schema validation');
    return validated;
  }
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private apiKey: string | undefined;
  private model: string;

  constructor(apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async interpret(input: AIInterpretationInput): Promise<AIInterpretationOutput> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY not configured');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${buildSystemPrompt()}\n\n${buildUserPayload(input)}` }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini response missing content');
    const validated = validateAIOutput(JSON.parse(text));
    if (!validated) throw new Error('Gemini response failed schema validation');
    return validated;
  }
}
