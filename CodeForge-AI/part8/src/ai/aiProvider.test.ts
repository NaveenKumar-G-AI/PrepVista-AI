import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { AIOrchestrator, AIProvider, AICompletionRequest, RawAIResult } from './aiProvider';

class ScriptedProvider implements AIProvider {
  name: string;
  private responses: (string | Error)[];
  private calls = 0;
  constructor(name: string, responses: (string | Error)[]) {
    this.name = name;
    this.responses = responses;
  }
  async complete(_req: AICompletionRequest): Promise<RawAIResult> {
    const next = this.responses[Math.min(this.calls, this.responses.length - 1)];
    this.calls++;
    if (next instanceof Error) throw next;
    return { provider: this.name, raw: next };
  }
  get callCount() { return this.calls; }
}

const schema = z.object({ intent: z.literal('X'), value: z.number() });
const fallback = () => ({ intent: 'X' as const, value: -1 });

test('returns AI result on first success', async () => {
  const provider = new ScriptedProvider('primary', ['{"intent":"X","value":1}']);
  const orchestrator = new AIOrchestrator({ providers: [provider] });
  const result = await orchestrator.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }, schema, fallback);
  assert.equal(result.source, 'AI');
  assert.equal(result.data.value, 1);
});

test('retries on malformed JSON before succeeding, without switching providers', async () => {
  const provider = new ScriptedProvider('primary', ['not json at all', '{"intent":"X","value":2}']);
  const orchestrator = new AIOrchestrator({ providers: [provider], maxAttemptsPerProvider: 2 });
  const result = await orchestrator.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }, schema, fallback);
  assert.equal(result.source, 'AI');
  assert.equal(result.provider, 'primary');
  assert.equal(result.data.value, 2);
  assert.equal(provider.callCount, 2);
});

test('strips a markdown json fence before parsing', async () => {
  const provider = new ScriptedProvider('primary', ['```json\n{"intent":"X","value":9}\n```']);
  const orchestrator = new AIOrchestrator({ providers: [provider] });
  const result = await orchestrator.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }, schema, fallback);
  assert.equal(result.data.value, 9);
});

test('falls back to the secondary provider when the primary is down', async () => {
  const orchestrator = new AIOrchestrator({
    providers: [
      new ScriptedProvider('primary', [new Error('timeout'), new Error('timeout')]),
      new ScriptedProvider('secondary', ['{"intent":"X","value":3}']),
    ],
  });
  const result = await orchestrator.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }, schema, fallback);
  assert.equal(result.provider, 'secondary');
  assert.equal(result.data.value, 3);
});

test('uses the deterministic fallback when every provider fails — never fabricates an AI success', async () => {
  const orchestrator = new AIOrchestrator({
    providers: [new ScriptedProvider('primary', [new Error('down'), new Error('down')])],
  });
  const result = await orchestrator.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }, schema, fallback);
  assert.equal(result.source, 'DETERMINISTIC_FALLBACK');
  assert.equal(result.provider, undefined);
  assert.equal(result.data.value, -1);
});
