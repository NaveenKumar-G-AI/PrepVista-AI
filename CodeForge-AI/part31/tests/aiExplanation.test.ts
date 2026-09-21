import { describe, expect, it } from 'vitest';
import { explainReadiness, templateExplanation, toStudentFacingView } from '../src/ai/explainReadiness';
import { computeRoleReadiness } from '../src/domain/readinessEngine';
import { BACKEND_DEVELOPER_ROLE, NOW, strongEvidence } from './fixtures/roleModels';

function sampleResult() {
  return computeRoleReadiness({
    studentId: 's1',
    organizationId: 'org1',
    roleModel: BACKEND_DEVELOPER_ROLE,
    evidence: [...strongEvidence('skill_programming', 5, 88), ...strongEvidence('skill_debugging', 5, 82)],
    now: NOW,
  });
}

describe('toStudentFacingView', () => {
  it('never exposes internal evidence ids or the algorithm version to the student view', () => {
    const view = toStudentFacingView(sampleResult()) as unknown as Record<string, unknown>;
    expect(view.evidenceTrace).toBeUndefined();
    expect(view.algorithmVersion).toBeUndefined();
  });
});

describe('templateExplanation', () => {
  it('always produces non-empty text purely from the structured view, with no network call', () => {
    const view = toStudentFacingView(sampleResult());
    const text = templateExplanation(view);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(view.roleName);
  });
});

describe('explainReadiness', () => {
  it('falls back to the template — and readiness is still returned — when no API key is configured', async () => {
    const result = sampleResult();
    const explanation = await explainReadiness(result, { apiKey: undefined });
    expect(explanation.source).toBe('template');
    expect(explanation.explanation.length).toBeGreaterThan(0);
    expect(explanation.warning).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('falls back to the template when the AI call throws', async () => {
    const result = sampleResult();
    const explanation = await explainReadiness(result, {
      apiKey: 'test-key',
      baseUrl: 'https://invalid.invalid/v1/messages', // guaranteed to fail to resolve/connect
    });
    expect(explanation.source).toBe('template');
    expect(explanation.explanation.length).toBeGreaterThan(0);
  });
});
