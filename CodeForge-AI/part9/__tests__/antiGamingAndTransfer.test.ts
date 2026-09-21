import { describe, expect, it } from 'vitest';
import { detectSuspiciousPattern } from '../src/domain/antiGaming.js';
import { isTransferEvidence } from '../src/domain/transferClassification.js';

describe('detectSuspiciousPattern — PHASE 16', () => {
  it('flags a burst of same-problem submissions without accusing on a single retry', () => {
    const now = new Date();
    const recent = Array.from({ length: 4 }, (_, i) => ({
      problemId: 'p1',
      createdAt: new Date(now.getTime() - i * 60 * 1000).toISOString(),
    }));
    expect(detectSuspiciousPattern({ problemId: 'p1', createdAt: now.toISOString() }, recent).suspicious).toBe(true);
  });

  it('does not flag a single normal attempt', () => {
    expect(detectSuspiciousPattern({ problemId: 'p1', createdAt: new Date().toISOString() }, []).suspicious).toBe(false);
  });

  it('does not flag two spaced-out attempts on the same problem', () => {
    const now = new Date();
    const recent = [{ problemId: 'p1', createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() }];
    expect(detectSuspiciousPattern({ problemId: 'p1', createdAt: now.toISOString() }, recent).suspicious).toBe(false);
  });
});

describe('isTransferEvidence — PHASE 14', () => {
  it('is NOT transfer when the skill was the pattern shown to the student', () => {
    const result = isTransferEvidence('sliding-window', 'p1', [{ problemId: 'p1', skillId: 'sliding-window', isPrimaryTag: true }], 'TRANSFER');
    expect(result).toBe(false);
  });

  it('IS transfer when the skill was hidden and the session was a transfer session', () => {
    const result = isTransferEvidence('sliding-window', 'p1', [{ problemId: 'p1', skillId: 'sliding-window', isPrimaryTag: false }], 'TRANSFER');
    expect(result).toBe(true);
  });

  it('is NOT transfer during ordinary independent practice, even with a hidden tag', () => {
    const result = isTransferEvidence('sliding-window', 'p1', [{ problemId: 'p1', skillId: 'sliding-window', isPrimaryTag: false }], 'INDEPENDENT');
    expect(result).toBe(false);
  });
});
