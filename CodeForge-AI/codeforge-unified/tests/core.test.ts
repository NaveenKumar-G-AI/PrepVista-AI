import { describe, it, expect } from 'vitest';
import { decodeState, freshState } from '@/lib/state';
import { deepEqual } from '@/engines/challenges/execution/deepEqual';
import { challenges } from '@/lib/challenges';
import { reviewSource } from '@/lib/quality';
import { progressFor } from '@/lib/progress';
import { applyAction, ConfirmationRequiredError } from '@/engines/incidents/actions';
import { PF2048_TEMPLATE as template } from '@/content/incidents/pf-2048';
import type { IncidentInstance } from '@/engines/incidents/types';
describe('persistent state', () => {
  it('starts with no fictional activity', () => { const state = decodeState(null); expect(state.attempts).toEqual([]); expect(state.learned).toEqual([]); expect(state.incidentActions).toEqual([]); });
  it('validates corrupted and oversized imports', () => { expect(() => decodeState('{')).toThrow(); expect(() => decodeState(JSON.stringify({ ...freshState(), version: 2 }))).toThrow(); expect(() => decodeState(JSON.stringify({ ...freshState(), drafts: { code: 'x'.repeat(20001) } }))).toThrow(); });
  it('round trips drafts without erasing an empty draft', () => { const state = freshState(); state.drafts.example = ''; expect(decodeState(JSON.stringify(state))).toEqual(state); });
});
describe('authored challenge integrity', () => {
  it('contains unique integrated challenges and runnable examples', () => { expect(challenges.length).toBe(19); expect(new Set(challenges.map(c => c.challengeId)).size).toBe(19); for (const c of challenges) { expect(c.starterCode.javascript).toBeTruthy(); expect(c.publicTests.length).toBeGreaterThan(0); expect(c.solutionMetadata.referenceSolution.javascript).toBeTruthy(); } });
  it('compares nested JSON without object key order, but preserves array order', () => { expect(deepEqual({ b: 2, a: [1] }, { a: [1], b: 2 })).toBe(true); expect(deepEqual([1, 2], [2, 1])).toBe(false); expect(deepEqual(null, {})).toBe(false); expect(deepEqual([1, 1], [1, 2], 'unordered_collection')).toBe(false); });
  it('does not invent growth for an empty history', () => { const p = progressFor(challenges[0].challengeId, []); expect(p.estimate.evidenceCount).toBe(0); expect(p.growth).toBeNull(); });
  it('requires sufficient comparable history before reporting a trend', () => {
    const challengeId = challenges[0].challengeId;
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: String(i), challengeId, at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), passed: i < 3 ? 1 : 2, total: 2, assisted: false, languageIssue: false, code: 'function sample() {}' }));
    expect(progressFor(challengeId, rows.slice(0, 5)).growth).toBeNull();
    expect(progressFor(challengeId, rows).growth).toMatchObject({ absoluteChange: 50 });
    expect(progressFor(challengeId, rows.map((r, i) => ({ ...r, assisted: i > 2 }))).growth).toBeNull();
  });
});
describe('static review', () => {
  it('finds swallowed exceptions from the original AST rules', async () => { const result = await reviewSource('function processInput(value) { try { return JSON.parse(value); } catch (error) {} }'); expect(result.some(r => r.ruleId === 'SWALLOWED_EXCEPTION')).toBe(true); });
  it('handles incomplete syntax without crashing', async () => { await expect(reviewSource('function broken(')).resolves.toBeInstanceOf(Array); });
  it('does not equate no findings with test success', async () => { const result = await reviewSource('function sum(a, b) { return a - b; }'); expect(Array.isArray(result)).toBe(true); });
});
describe('incident safeguards', () => {
  const instance: IncidentInstance = { id: 'test', templateId: template.id, ownerId: 'local', code: 'CF', state: 'ACTIVE', simStartedAt: null, simMinutesElapsed: 0, escalationLevel: 0, mitigated: false, permanentFixApplied: false, verified: false, createdAt: '', updatedAt: '' };
  it('does not resolve by verification without mitigation', () => { const def = template.actionDefs.find(a => a.actionType === 'VERIFY_SERVICE')!; const result = applyAction({ template, instance, ...def, confirmed: true }); expect(result.instancePatch.state).toBeUndefined(); expect(result.narrative).toContain('still degraded'); });
  it('requires confirmation for dangerous actions', () => { const def = template.actionDefs.find(a => a.requiresConfirmation)!; expect(() => applyAction({ template, instance, ...def, confirmed: false })).toThrow(ConfirmationRequiredError); });
  it('does not report a passing performance test before a permanent fix', () => { const def = template.actionDefs.find(a => a.actionType === 'RUN_TESTS')!; const result = applyAction({ template, instance, ...def, confirmed: true }); expect(result.narrative).toContain('still detects'); expect(result.instancePatch.state).toBeUndefined(); });
  it('completes investigation, fix, and verification with valid state transitions', () => { let current = instance; for (const type of ['INSPECT_LOGS', 'DEPLOY_FIX', 'VERIFY_SERVICE']) { const def = template.actionDefs.find(a => a.actionType === type)!; current = { ...current, ...applyAction({ template, instance: current, ...def, confirmed: true }).instancePatch }; } expect(current.state).toBe('RESOLVED'); expect(current.verified).toBe(true); });
});
