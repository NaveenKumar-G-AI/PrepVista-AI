import { ContextManager, Message, TokenEstimator } from '../src/context/ContextManager';

// A trivial estimator (1 token per character) makes token math exact and
// the tests easy to reason about, instead of depending on the ~4
// chars/token heuristic used in production.
class ExactEstimator implements TokenEstimator {
  estimate(text: string): number {
    return text.length;
  }
}

describe('ContextManager', () => {
  it('keeps everything when it fits comfortably under budget', () => {
    const cm = new ContextManager(new ExactEstimator());
    const messages: Message[] = [
      { role: 'system', content: 'sys' }, // 3
      { role: 'user', content: 'hi' }, // 2
    ];
    const result = cm.prepare(messages, 100);
    expect(result.rejected).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.messages).toHaveLength(2);
  });

  it('truncates the oldest turns first, always preserving system messages and the most recent turns', () => {
    const cm = new ContextManager(new ExactEstimator());
    const messages: Message[] = [
      { role: 'system', content: 'S'.repeat(5) }, // 5 tokens
      { role: 'user', content: 'A'.repeat(10) }, // 10 tokens — oldest, should be dropped
      { role: 'assistant', content: 'B'.repeat(10) }, // 10 tokens — should also be dropped
      { role: 'user', content: 'newest-xyz' }, // exactly 10 chars/tokens — most recent, must survive
    ];
    // Budget fits system (5) + only the single most recent turn (10) = 15 exactly.
    const result = cm.prepare(messages, 15, 'TRUNCATE_OLDEST');

    expect(result.rejected).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(result.messages[1].content).toBe('newest-xyz');
  });

  it('rejects rather than silently truncating when system instructions alone exceed the budget', () => {
    const cm = new ContextManager(new ExactEstimator());
    const messages: Message[] = [{ role: 'system', content: 'S'.repeat(200) }];
    const result = cm.prepare(messages, 50);
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/system instructions/i);
  });

  it('REJECT strategy refuses to truncate at all — any overflow is a hard rejection', () => {
    const cm = new ContextManager(new ExactEstimator());
    const messages: Message[] = [
      { role: 'system', content: 'S'.repeat(5) },
      { role: 'user', content: 'U'.repeat(10) },
      { role: 'user', content: 'U'.repeat(10) },
    ];
    // Fits everything except the oldest user turn -> would need to truncate.
    const result = cm.prepare(messages, 20, 'REJECT');
    expect(result.rejected).toBe(true);
  });

  it('handles a system-only conversation with no user/assistant turns', () => {
    const cm = new ContextManager(new ExactEstimator());
    const result = cm.prepare([{ role: 'system', content: 'S'.repeat(5) }], 100);
    expect(result.rejected).toBe(false);
    expect(result.messages).toHaveLength(1);
  });
});
