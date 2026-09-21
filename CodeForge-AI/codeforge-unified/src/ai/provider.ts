import { RequestError } from '@/lib/security';
import { parseMentorResponse, type MentorInput } from './schemas';
import { systemPrompt } from './prompts';
import { geminiConfig } from './config';
export async function askGemini(input: MentorInput, signal?: AbortSignal) {
  const { key, model } = geminiConfig();
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(input.mode) }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4096 } }),
      signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
    });
  } catch { throw new RequestError(504, 'PrepVista could not reach its AI mentor in time. Retry or continue working on your solution.'); }
  if (!response.ok) throw new RequestError(response.status === 429 ? 429 : 503, response.status === 429 ? 'The AI mentor is at its request limit. Wait a minute and retry.' : 'PrepVista could not generate this explanation right now. Retry or continue working on your solution.');
  try {
    const body: unknown = await response.json();
    const candidate = body as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = candidate.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    return parseMentorResponse(text);
  } catch { throw new RequestError(502, 'The AI mentor returned an incomplete explanation. Please retry.'); }
}
