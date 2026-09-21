import { CostCalculator } from '../src/cost/CostCalculator';
import { CostBasis, ModelDescriptor, ModelStatus, ModelCapability } from '../src/types';

const testModel: ModelDescriptor = {
  id: 'test:model',
  provider: 'test',
  modelKey: 'model',
  family: 'test',
  capabilities: [ModelCapability.GENERAL],
  contextWindow: 100_000,
  maxOutputTokens: 4096,
  status: ModelStatus.ACTIVE,
  pricing: { inputPricePerMTok: 2, outputPricePerMTok: 10, pricingVersion: 3, pricingAsOf: '2026-08-22', pricingSource: 'test' },
};

describe('CostCalculator', () => {
  it('computes actual cost correctly from exact provider-reported usage', () => {
    const calc = new CostCalculator();
    const result = calc.actual(testModel, { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 }, true);

    // 1000/1e6 * $2 + 500/1e6 * $10 = 0.002 + 0.005 = 0.007
    expect(result.usd).toBeCloseTo(0.007, 6);
    expect(result.basis).toBe(CostBasis.ACTUAL);
    expect(result.pricingVersion).toBe(3);
  });

  it('falls back to ESTIMATED basis when usage is not exact, even when actual() is called', () => {
    const calc = new CostCalculator();
    const result = calc.actual(testModel, { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 }, false);
    expect(result.basis).toBe(CostBasis.ESTIMATED);
  });

  it('estimated() always reports ESTIMATED basis', () => {
    const calc = new CostCalculator();
    const result = calc.estimated(testModel, { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(result.basis).toBe(CostBasis.ESTIMATED);
  });

  it('unavailable() reports zero cost and UNAVAILABLE basis rather than fabricating a number', () => {
    const calc = new CostCalculator();
    const result = calc.unavailable(testModel);
    expect(result.usd).toBe(0);
    expect(result.basis).toBe(CostBasis.UNAVAILABLE);
  });

  it('preflightEstimate uses the assumed output ceiling, not an actual output count', () => {
    const calc = new CostCalculator();
    const usd = calc.preflightEstimate(testModel, 1000, 500);
    expect(usd).toBeCloseTo(0.007, 6);
  });

  it('costPerSuccessfulTask returns null rather than dividing by zero', () => {
    const calc = new CostCalculator();
    expect(calc.costPerSuccessfulTask(10, 0)).toBeNull();
    expect(calc.costPerSuccessfulTask(10, 5)).toBe(2);
  });
});
