import type { StructuredFieldSpec } from '../../problemBank/types.js';
import type { ValidationOutcome } from './numeric.js';
import { parseFlexibleNumber } from './numeric.js';

/**
 * Validates a step where the student fills in several named fields at once
 * (Section 14: "Distance = 360 km, Speed = 60 km/h, Time = ?"). Raw input is
 * a JSON object string of { fieldKey: value }. Reports PARTIALLY_CORRECT
 * when some but not all fields match, rather than a flat pass/fail, per
 * Section 17.
 */
export function validateStructuredFields(rawInput: string, spec: StructuredFieldSpec): ValidationOutcome {
  if (!rawInput || !rawInput.trim()) {
    return { result: 'INCOMPLETE', detail: 'Fill in the known values before submitting.' };
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    return { result: 'FORMAT_ERROR', detail: 'Could not read the fields you entered.' };
  }

  let correctCount = 0;
  const wrongLabels: string[] = [];
  const structuredValues: Record<string, number> = {};

  for (const field of spec.fields) {
    const raw = parsed[field.key];
    if (raw === undefined || raw === '') {
      wrongLabels.push(field.label);
      continue;
    }
    const numericRaw = parseFlexibleNumber(raw);
    if (numericRaw !== null) structuredValues[field.key] = numericRaw;

    const isMatch =
      typeof field.expected === 'number'
        ? numericRaw !== null && Math.abs(numericRaw - field.expected) <= 1e-6
        : raw.trim().toLowerCase() === String(field.expected).trim().toLowerCase();

    if (isMatch) correctCount += 1;
    else wrongLabels.push(field.label);
  }

  if (correctCount === spec.fields.length) return { result: 'CORRECT', structuredValues };
  if (correctCount === 0) {
    return {
      result: 'INCORRECT',
      structuredValues,
      detail: 'None of the values match yet - re-read the problem statement.',
    };
  }
  return {
    result: 'PARTIALLY_CORRECT',
    structuredValues,
    detail: `Check again: ${wrongLabels.join(', ')}.`,
  };
}
