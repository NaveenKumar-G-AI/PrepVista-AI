import fs from 'node:fs';
import path from 'node:path';
import { db } from './client';
import * as shortcutRepo from '../repositories/shortcutRepository';
import { validateShortcut } from '../services/validationService';
import { env } from '../config/env';

/**
 * Seeds a handful of GLOBAL (owner_student_id = NULL), content-team-sourced
 * shortcuts - the same three the spec itself uses as examples (sec. 119):
 * Quarter Method (25%), Half Method (50%), Decimal Shift (10%). Each one is
 * actually run through ShortcutValidationService below, so "VERIFIED" here
 * is a real property-based-test PASS, not a hardcoded label (sec. 294,
 * "never fabricate reliability").
 *
 * On purpose, this script does NOT create any student_shortcut_states or
 * shortcut_usages rows - there is no real student history yet, and the spec
 * is explicit that shortcut evidence must never be fabricated (secs. 174,
 * 294). For a populated demo of the trust lifecycle, run `npm run
 * demo:simulate` separately (see src/scripts/demo-simulate.ts) - that
 * script is clearly a dev-only fixture generator, not part of seeding.
 */

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

const tenantId = env.DEFAULT_TENANT_ID;

function seedPercentShortcut(opts: {
  name: string;
  percentage: number;
  expression: string;
  description: string;
  underlyingReason: string;
}) {
  const shortcut = shortcutRepo.insertShortcut({
    tenantId,
    ownerStudentId: null,
    canonicalName: opts.name,
    description: opts.description,
    category: 'Quantitative',
    domain: 'Percentages',
    strategyType: 'PERCENTAGE_TRICK',
    classification: 'CONDITIONAL',
    source: 'CONTENT_TEAM',
    status: 'UNVERIFIED',
  });

  shortcutRepo.insertVersion({
    shortcutId: shortcut.shortcut_id,
    version: 1,
    description: opts.description,
    steps: [`Take the quantity x.`, `Compute ${opts.expression} directly instead of x * ${opts.percentage} / 100.`],
    conditions: [{ field: 'percentage', op: 'eq', value: opts.percentage, label: `The question asks for exactly ${opts.percentage}%.` }],
    nonApplicability: [{ field: 'percentage', op: 'neq', value: opts.percentage, label: `Any percentage other than ${opts.percentage}%.` }],
    underlyingReason: opts.underlyingReason,
    expression: opts.expression,
    canonicalExpression: `x * ${opts.percentage} / 100`,
    validationDomain: { variables: { x: { min: 0, max: 1_000_000 } } },
  });

  shortcutRepo.insertExample({
    shortcutId: shortcut.shortcut_id,
    version: 1,
    isCounterexample: false,
    input: { x: 240 },
    expectedOutput: (240 * opts.percentage) / 100,
    note: `${opts.percentage}% of 240`,
  });
  shortcutRepo.insertExample({
    shortcutId: shortcut.shortcut_id,
    version: 1,
    isCounterexample: true,
    input: { x: 240 },
    expectedOutput: null,
    note: `Does not apply as-is to a different percentage of the same base (would need a different shortcut).`,
  });

  const result = validateShortcut(shortcut.shortcut_id, 1);
  // eslint-disable-next-line no-console
  console.log(`[seed] ${opts.name}: ${result.overallStatus}`);
  return shortcut;
}

seedPercentShortcut({
  name: 'Quarter Method',
  percentage: 25,
  expression: 'x / 4',
  description: '25% of a quantity is the same as one quarter of it.',
  underlyingReason: '25% = 25/100 = 1/4, so dividing by 4 gives the same result as multiplying by 25 and dividing by 100 - just fewer, easier steps.',
});

seedPercentShortcut({
  name: 'Half Method',
  percentage: 50,
  expression: 'x / 2',
  description: '50% of a quantity is the same as half of it.',
  underlyingReason: '50% = 50/100 = 1/2, so dividing by 2 gives the same result as the full percentage formula.',
});

seedPercentShortcut({
  name: 'Decimal Shift',
  percentage: 10,
  expression: 'x / 10',
  description: '10% of a quantity is the same as shifting the decimal point one place left.',
  underlyingReason: '10% = 10/100 = 1/10, so dividing by 10 (shifting the decimal point) matches the full percentage formula.',
});

// eslint-disable-next-line no-console
console.log('[seed] done.');
