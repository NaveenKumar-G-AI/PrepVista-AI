import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePriority } from '../../services/priority/priorityEngine';

test('spec example (section 12): 2-day deadline, 3 students -> MEDIUM', () => {
  const result = calculatePriority({
    baseSeverity: 'HIGH',
    hoursUntilDeadline: 48,
    studentsAffected: 3,
    confidence: 'HIGH_CONFIDENCE',
  });
  assert.equal(result.priorityBucket, 'MEDIUM');
});

test('spec example (section 12): 4-hour deadline, 400 students -> CRITICAL', () => {
  const result = calculatePriority({
    baseSeverity: 'HIGH',
    hoursUntilDeadline: 4,
    studentsAffected: 400,
    confidence: 'HIGH_CONFIDENCE',
  });
  assert.equal(result.priorityBucket, 'CRITICAL');
});

test('low confidence pulls the score down relative to high confidence', () => {
  const high = calculatePriority({ baseSeverity: 'HIGH', hoursUntilDeadline: 4, studentsAffected: 400, confidence: 'HIGH_CONFIDENCE' });
  const low = calculatePriority({ baseSeverity: 'HIGH', hoursUntilDeadline: 4, studentsAffected: 400, confidence: 'LOW_CONFIDENCE' });
  assert.ok(low.priorityScore < high.priorityScore);
});

test('more affected students never lowers priority, all else equal', () => {
  const few = calculatePriority({ baseSeverity: 'MEDIUM', hoursUntilDeadline: 24, studentsAffected: 5, confidence: 'HIGH_CONFIDENCE' });
  const many = calculatePriority({ baseSeverity: 'MEDIUM', hoursUntilDeadline: 24, studentsAffected: 500, confidence: 'HIGH_CONFIDENCE' });
  assert.ok(many.priorityScore >= few.priorityScore);
});

test('a closer deadline never lowers priority, all else equal', () => {
  const far = calculatePriority({ baseSeverity: 'MEDIUM', hoursUntilDeadline: 160, studentsAffected: 10, confidence: 'HIGH_CONFIDENCE' });
  const near = calculatePriority({ baseSeverity: 'MEDIUM', hoursUntilDeadline: 2, studentsAffected: 10, confidence: 'HIGH_CONFIDENCE' });
  assert.ok(near.priorityScore >= far.priorityScore);
});

test('score is always clamped to 0-100', () => {
  const result = calculatePriority({
    baseSeverity: 'CRITICAL',
    hoursUntilDeadline: 0,
    studentsAffected: 5000,
    confidence: 'HIGH_CONFIDENCE',
    institutionalSignificance: 1,
  });
  assert.ok(result.priorityScore <= 100 && result.priorityScore >= 0);
});
