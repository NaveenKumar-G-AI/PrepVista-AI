import { describe, it, expect } from 'vitest';
import { nextAutoEscalationLevel, decayLevelAfterSuccess, helpLevelLabel, MAX_AUTO_ESCALATION_LEVEL } from '../src/domain/engine/helpLevels.js';

describe('help level escalation policy (Sections 22-24)', () => {
  it('does not escalate when there are no consecutive failures', () => {
    expect(nextAutoEscalationLevel(0, 0)).toBe(0);
  });
  it('escalates by exactly one level per additional failure', () => {
    expect(nextAutoEscalationLevel(0, 1)).toBe(1);
    expect(nextAutoEscalationLevel(1, 1)).toBe(2);
  });
  it('never auto-escalates to level 7 (full solution is manual-only, Section 28)', () => {
    expect(nextAutoEscalationLevel(6, 1)).toBe(MAX_AUTO_ESCALATION_LEVEL);
    expect(nextAutoEscalationLevel(6, 5)).toBe(MAX_AUTO_ESCALATION_LEVEL);
    expect(MAX_AUTO_ESCALATION_LEVEL).toBeLessThan(7);
  });
  it('decays by one level after a success (Section 78)', () => {
    expect(decayLevelAfterSuccess(3)).toBe(2);
    expect(decayLevelAfterSuccess(0)).toBe(0);
  });
  it('labels levels for display', () => {
    expect(helpLevelLabel(0)).toBe('NO_ASSISTANCE');
    expect(helpLevelLabel(7)).toBe('FULL_SOLUTION');
  });
});
