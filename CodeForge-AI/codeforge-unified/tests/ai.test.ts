import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mentorInput, parseMentorResponse } from '@/ai/schemas';
import { askGemini } from '@/ai/provider';
import { systemPrompt } from '@/ai/prompts';
import { readInput } from '@/lib/security';
const input = mentorInput.parse({ mode: 'hint', question: 'Why does this loop skip the last item?' });
beforeEach(() => { vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('GEMINI_MODEL', ''); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('mentor validation', () => {
  it.each(['', ' ', 'x'.repeat(6001)])('rejects invalid questions', question => { expect(mentorInput.safeParse({ mode: 'hint', question }).success).toBe(false); });
  it('rejects oversized code and unexpected fields', () => { expect(mentorInput.safeParse({ ...input, code: 'x'.repeat(20001) }).success).toBe(false); expect(mentorInput.safeParse({ ...input, key: 'not-a-real-key' }).success).toBe(false); });
  it('parses fenced JSON, rejects missing or empty fields', () => { expect(parseMentorResponse('```json\n{"message":"Check the boundary.","nextStep":"Try an empty array."}\n```').message).toContain('boundary'); expect(() => parseMentorResponse('{"message":""}')).toThrow(); });
  it('keeps hint-first and explicit solution requests distinct', () => { expect(systemPrompt('hint')).toContain('Do not reveal'); expect(systemPrompt('solution')).toContain('complete solution'); });
});
describe('provider failures are honest and safe', () => {
  it('reports missing configuration without a fake answer', async () => { vi.stubEnv('GEMINI_API_KEY', ''); await expect(askGemini(input)).rejects.toMatchObject({ status: 503 }); });
  it.each([401, 403, 429, 500])('handles provider status %i', async status => { vi.stubEnv('GEMINI_API_KEY', 'test-only-placeholder'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider details', { status }))); await expect(askGemini(input)).rejects.toMatchObject({ status: status === 429 ? 429 : 503 }); });
  it('handles network timeout', async () => { vi.stubEnv('GEMINI_API_KEY', 'test-only-placeholder'); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'))); await expect(askGemini(input)).rejects.toMatchObject({ status: 504 }); });
  it.each(['', 'not-json', '{"message":"ok"}'])('handles malformed model output', async text => { vi.stubEnv('GEMINI_API_KEY', 'test-only-placeholder'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text }] } }] }))); await expect(askGemini(input)).rejects.toMatchObject({ status: 502 }); });
  it('accepts a validated model answer', async () => { vi.stubEnv('GEMINI_API_KEY', 'test-only-placeholder'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: '{"message":"Inspect the final index.","nextStep":"Trace a one-item array."}' }] } }] }))); expect((await askGemini(input)).nextStep).toContain('one-item'); });
});
describe('API boundary', () => {
  function req(origin: string, body = '{}') { return new Request('http://localhost:3000/api/mentor', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body }); }
  it('rejects cross-site requests', async () => { await expect(readInput(req('https://untrusted.example'), 'origin')).rejects.toMatchObject({ status: 403 }); });
  it('handles the actual local request authority after framework URL normalization', async () => { const request = req('http://127.0.0.1:3220'); request.headers.set('host', '127.0.0.1:3220'); await expect(readInput(request, 'local-authority')).resolves.toEqual({}); });
  it('does not trust a forwarded host', async () => { const request = req('https://untrusted.example'); request.headers.set('host', 'localhost:3000'); request.headers.set('x-forwarded-host', 'untrusted.example'); await expect(readInput(request, 'forwarded')).rejects.toMatchObject({ status: 403 }); });
  it('accepts the configured Render address without trusting forwarded-host', async () => { vi.stubEnv('RENDER_EXTERNAL_URL', 'https://codeforge-example.onrender.com'); await expect(readInput(req('https://codeforge-example.onrender.com'), 'render')).resolves.toEqual({}); });
  it('bounds request size even without a Content-Length header', async () => { await expect(readInput(req('http://localhost:3000', 'x'.repeat(64001)), 'size')).rejects.toMatchObject({ status: 413 }); });
  it('rejects malformed JSON', async () => { await expect(readInput(req('http://localhost:3000', '{'), 'json')).rejects.toMatchObject({ status: 400 }); });
  it('limits repeated public calls', async () => { await readInput(req('http://localhost:3000'), 'limited', 1); await expect(readInput(req('http://localhost:3000'), 'limited', 1)).rejects.toMatchObject({ status: 429 }); });
});
