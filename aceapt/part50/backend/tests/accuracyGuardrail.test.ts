import { checkAccuracyGuardrail } from '../src/core/accuracyGuardrail';

describe('checkAccuracyGuardrail', () => {
  it('reports not breached with a positive margin when accuracy is above guardrail', () => {
    const result = checkAccuracyGuardrail([true, true, true, false, true], 0.7);
    expect(result.rollingAccuracy).toBe(0.8);
    expect(result.breached).toBe(false);
    expect(result.marginPct).toBeGreaterThan(0);
  });

  it('reports breached with a negative margin when accuracy is below guardrail', () => {
    const result = checkAccuracyGuardrail([true, false, false, false], 0.85);
    expect(result.rollingAccuracy).toBe(0.25);
    expect(result.breached).toBe(true);
    expect(result.marginPct).toBeLessThan(0);
  });

  it('handles the empty-history edge case without throwing', () => {
    const result = checkAccuracyGuardrail([], 0.85);
    expect(result.breached).toBe(false);
    expect(result.rollingAccuracy).toBe(0);
  });
});
