import { afterEach, describe, expect, it, vi } from 'vitest';
import { mentorInput } from '@/ai/schemas';
import { askGemini } from '@/ai/provider';

const input = mentorInput.parse({ mode: 'hint', question: 'Why does this loop skip the last item?' });
const answer = { message: 'Inspect the final index.', nextStep: 'Trace a one-item array.' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('hosted Gemini configuration', () => {
  it.each([
    ['gemini-2.5-flash', 'gemini-2.5-flash'],
    [' models/gemini-2.5-flash\n', 'gemini-2.5-flash'],
    [' "models/gemini-2.5-flash" ', 'gemini-2.5-flash'],
    ["'gemini-2.5-pro'", 'gemini-2.5-pro'],
    ['gemini-3.5-flash', 'gemini-3.5-flash'],
    ['', 'gemini-2.5-flash'],
    [' \n ', 'gemini-2.5-flash'],
  ])('sends a valid request for model setting %j', async (configured, model) => {
    vi.stubEnv('GEMINI_API_KEY', ' "test-only-placeholder"\n');
    vi.stubEnv('GEMINI_MODEL', configured);
    const fetch = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
    vi.stubGlobal('fetch', fetch);
    await expect(askGemini(input)).resolves.toEqual(answer);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'test-only-placeholder' },
    }));
  });
  it.each(['models/', 'models/models/gemini-2.5-flash', 'gemini 2.5 flash', 'https://example.com/model', '../models/gemini', 'gemini?key=private', 'gemini#fragment', 'GEMINI_MODEL=gemini-2.5-flash'])('rejects malformed model %j before any network call', async model => {
    vi.stubEnv('GEMINI_API_KEY', 'test-only-placeholder'); vi.stubEnv('GEMINI_MODEL', model);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(askGemini(input)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('invalid model setting') });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([' ', '\n', '""', "''"])('treats blank credentials as missing', async key => {
    vi.stubEnv('GEMINI_API_KEY', key); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(askGemini(input)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('not configured') });
    expect(fetch).not.toHaveBeenCalled();
  });
});
