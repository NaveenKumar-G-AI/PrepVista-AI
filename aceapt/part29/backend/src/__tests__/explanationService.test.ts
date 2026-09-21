import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateExplanation } from '../ai/explanationService';
import { AlignmentExplanationFacts } from '../domain/types';

test('template explanation never invents a score when fitScore/readinessScore are null', () => {
  const facts: AlignmentExplanationFacts = {
    targetName: 'Data Analyst',
    state: 'INSUFFICIENT_EVIDENCE',
    fitScore: null,
    readinessScore: null,
    confidence: 'LOW',
    topStrengths: [],
    criticalGapNames: [],
    supportingGapNames: [],
    nextBestActionCapability: null,
  };
  const text = templateExplanation(facts);
  assert.ok(!/\d/.test(text), `expected no digits in an insufficient-evidence explanation, got: ${text}`);
  assert.match(text, /enough evidence/i);
});

test('template explanation names the critical gap and never claims a guarantee', () => {
  const facts: AlignmentExplanationFacts = {
    targetName: 'Software Developer',
    state: 'DEVELOPING_ALIGNMENT',
    fitScore: 55,
    readinessScore: 38,
    confidence: 'HIGH',
    topStrengths: ['Problem Solving', 'Communication'],
    criticalGapNames: ['Programming'],
    supportingGapNames: [],
    nextBestActionCapability: 'Programming',
  };
  const text = templateExplanation(facts);
  assert.match(text, /55%/);
  assert.match(text, /38%/);
  assert.match(text, /Programming/);
  assert.doesNotMatch(text, /guarant/i);
  assert.doesNotMatch(text, /you'?ll get/i);
});
