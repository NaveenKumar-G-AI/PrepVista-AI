import { describe, it, expect } from 'vitest';
import { parseAiGuidanceOutput } from '../src/domain/ai/outputSchema.js';

describe('parseAiGuidanceOutput (Sections 62, 110: malformed AI output must never crash or be trusted)', () => {
  it('parses a well-formed JSON object', () => {
    const raw = JSON.stringify({
      action: 'GIVE_HINT',
      stepId: 'calculate',
      message: 'Divide the distance by the speed.',
      helpLevel: 2,
      targetIssue: 'CALCULATION',
    });
    const result = parseAiGuidanceOutput(raw);
    expect(result).not.toBeNull();
    expect(result?.message).toBe('Divide the distance by the speed.');
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify({ action: 'GIVE_HINT', stepId: 's1', message: 'hi', helpLevel: 1 }) + '\n```';
    expect(parseAiGuidanceOutput(raw)).not.toBeNull();
  });

  it('tolerates a preamble sentence before the JSON object', () => {
    const raw = `Sure, here is the guidance: ${JSON.stringify({ action: 'GIVE_HINT', stepId: 's1', message: 'hi', helpLevel: 1 })}`;
    expect(parseAiGuidanceOutput(raw)).not.toBeNull();
  });

  it('rejects an object missing a required field', () => {
    const raw = JSON.stringify({ action: 'GIVE_HINT', message: 'hi', helpLevel: 1 }); // missing stepId
    expect(parseAiGuidanceOutput(raw)).toBeNull();
  });

  it('rejects an invalid enum value instead of coercing it', () => {
    const raw = JSON.stringify({ action: 'DO_SOMETHING_ELSE', stepId: 's1', message: 'hi', helpLevel: 1 });
    expect(parseAiGuidanceOutput(raw)).toBeNull();
  });

  it('rejects a help level outside the 0-7 range', () => {
    const raw = JSON.stringify({ action: 'GIVE_HINT', stepId: 's1', message: 'hi', helpLevel: 99 });
    expect(parseAiGuidanceOutput(raw)).toBeNull();
  });

  it('rejects plain non-JSON text without throwing', () => {
    expect(() => parseAiGuidanceOutput('I cannot help with that right now.')).not.toThrow();
    expect(parseAiGuidanceOutput('I cannot help with that right now.')).toBeNull();
  });

  it('rejects an attempted prompt-injection payload masquerading as the message field the same as any oversized string', () => {
    const raw = JSON.stringify({
      action: 'GIVE_HINT',
      stepId: 's1',
      message: 'x'.repeat(5000),
      helpLevel: 1,
    });
    // Oversized message is rejected by the schema's length bound rather than silently truncated,
    // so a caller always knows to fall back rather than display a mangled string.
    expect(parseAiGuidanceOutput(raw)).toBeNull();
  });
});
