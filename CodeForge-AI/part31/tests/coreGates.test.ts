import { describe, expect, it } from 'vitest';
import { evaluateCoreGates } from '../src/domain/coreGates';
import { aggregateSkillEvidence } from '../src/domain/evidenceAggregation';
import { BACKEND_DEVELOPER_ROLE, NOW, adequateEvidence, strongEvidence } from './fixtures/roleModels';
import type { SkillSignal } from '../src/domain/types';

function buildSignals(evidenceBySkill: Record<string, ReturnType<typeof strongEvidence>>): Map<string, SkillSignal> {
  const map = new Map<string, SkillSignal>();
  for (const req of BACKEND_DEVELOPER_ROLE.skills) {
    const evidence = evidenceBySkill[req.skillId] ?? [];
    map.set(req.skillId, aggregateSkillEvidence(req.skillId, evidence, req.evidenceRequirement, { now: NOW }));
  }
  return map;
}

describe('evaluateCoreGates', () => {
  it('passes when both core skills (programming, debugging) meet their bar', () => {
    const signals = buildSignals({
      skill_programming: strongEvidence('skill_programming', 5, 88),
      skill_debugging: strongEvidence('skill_debugging', 5, 82),
      skill_sql: adequateEvidence('skill_sql'),
      skill_api_design: adequateEvidence('skill_api_design'),
    });
    const result = evaluateCoreGates(BACKEND_DEVELOPER_ROLE, signals);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('fails when a core skill is unassessed, even if everything else is strong', () => {
    const signals = buildSignals({
      skill_programming: strongEvidence('skill_programming', 5, 90),
      // skill_debugging: no evidence at all
      skill_sql: strongEvidence('skill_sql', 5, 90),
      skill_api_design: strongEvidence('skill_api_design', 5, 90),
    });
    const result = evaluateCoreGates(BACKEND_DEVELOPER_ROLE, signals);
    expect(result.passed).toBe(false);
    expect(result.failures).toContainEqual({ skillId: 'skill_debugging', reason: 'unassessed' });
  });

  it('fails when a core skill is assessed but below the required mastery — the Phase 12 example', () => {
    // Programming strong, SQL strong, but Debugging weak — this must NOT pass
    // just because the average across all skills looks high.
    const signals = buildSignals({
      skill_programming: strongEvidence('skill_programming', 5, 92),
      skill_debugging: strongEvidence('skill_debugging', 5, 25), // well below "competent"
      skill_sql: strongEvidence('skill_sql', 5, 92),
      skill_api_design: strongEvidence('skill_api_design', 5, 92),
    });
    const result = evaluateCoreGates(BACKEND_DEVELOPER_ROLE, signals);
    expect(result.passed).toBe(false);
    expect(result.failures).toContainEqual({ skillId: 'skill_debugging', reason: 'below_threshold' });
  });

  it('ignores non-core skills entirely, however weak', () => {
    const signals = buildSignals({
      skill_programming: strongEvidence('skill_programming', 5, 90),
      skill_debugging: strongEvidence('skill_debugging', 5, 85),
      // sql, api_design, system_design, graphql: no evidence
    });
    const result = evaluateCoreGates(BACKEND_DEVELOPER_ROLE, signals);
    expect(result.passed).toBe(true);
  });
});
