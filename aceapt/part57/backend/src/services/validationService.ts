import { evalExpr } from '../utils/mathEval';
import { mulberry32 } from '../utils/random';
import type { ValidationDomain } from '../domain/types';
import * as validationRepo from '../repositories/validationRepository';
import * as shortcutRepo from '../repositories/shortcutRepository';
import * as analytics from '../repositories/analyticsRepository';
import { logger } from '../utils/logger';

const DEFAULT_SAMPLE_COUNT = 200;
const DEFAULT_EPSILON = 1e-6;

export interface PropertyTestFailure {
  input: Record<string, number>;
  shortcutValue: number | null;
  canonicalValue: number | null;
}

export interface PropertyTestResult {
  status: 'PASS' | 'FAIL';
  samplesTested: number;
  epsilon: number;
  failures: PropertyTestFailure[];
}

function randomSample(domain: ValidationDomain, rng: () => number): Record<string, number> {
  const sample: Record<string, number> = {};
  for (const [name, spec] of Object.entries(domain.variables)) {
    let v = spec.min + rng() * (spec.max - spec.min);
    if (spec.integer) v = Math.round(v);
    if (spec.exclude?.includes(v)) v += 1e-3;
    sample[name] = v;
  }
  return sample;
}

/** Min/max/zero/one corner cases for every variable, capped so the cartesian product can't explode. */
function boundarySamples(domain: ValidationDomain): Record<string, number>[] {
  const names = Object.keys(domain.variables);
  if (names.length === 0) return [];
  const options = names.map((name) => {
    const spec = domain.variables[name]!;
    const opts = new Set<number>([spec.min, spec.max]);
    if (spec.min <= 0 && spec.max >= 0) opts.add(0);
    if (spec.min <= 1 && spec.max >= 1) opts.add(1);
    return Array.from(opts);
  });
  let combos: Record<string, number>[] = [{}];
  names.forEach((name, i) => {
    const next: Record<string, number>[] = [];
    for (const combo of combos) {
      for (const val of options[i]!) next.push({ ...combo, [name]: val });
    }
    combos = next;
  });
  return combos.slice(0, 64);
}

/**
 * The mathematical heart of Feature 57 (secs. 22-28, 245-250, 279-280).
 * Compares a shortcut's expression against the canonical expression over
 * random samples plus boundary cases within the declared domain. A shortcut
 * only PASSes if every sample agrees within epsilon - one mismatch is
 * enough to FAIL and record a counterexample.
 */
export function runPropertyBasedValidation(
  shortcutExpression: string,
  canonicalExpression: string,
  domain: ValidationDomain,
  opts: { sampleCount?: number; epsilon?: number; seed?: number } = {}
): PropertyTestResult {
  const sampleCount = opts.sampleCount ?? DEFAULT_SAMPLE_COUNT;
  const epsilon = opts.epsilon ?? DEFAULT_EPSILON;
  const rng = mulberry32(opts.seed ?? 42);

  const inputs = [...boundarySamples(domain), ...Array.from({ length: sampleCount }, () => randomSample(domain, rng))];

  const failures: PropertyTestFailure[] = [];
  let tested = 0;

  for (const input of inputs) {
    tested += 1;
    let shortcutValue: number | null = null;
    let canonicalValue: number | null = null;
    try {
      shortcutValue = evalExpr(shortcutExpression, input);
    } catch {
      /* recorded as null below */
    }
    try {
      canonicalValue = evalExpr(canonicalExpression, input);
    } catch {
      /* recorded as null below */
    }

    const mismatch =
      shortcutValue === null ||
      canonicalValue === null ||
      Math.abs(shortcutValue - canonicalValue) > epsilon * Math.max(1, Math.abs(canonicalValue));

    if (mismatch) {
      failures.push({ input, shortcutValue, canonicalValue });
      if (failures.length >= 10) break; // cap recorded counterexamples - the first few make the point
    }
  }

  return { status: failures.length === 0 ? 'PASS' : 'FAIL', samplesTested: tested, epsilon, failures };
}

/**
 * Confirms a shortcut correctly *diverges* from the canonical method outside
 * its declared domain (secs. 25, 28, 30) - proof the non-applicability
 * condition is real, not just asserted.
 */
export function checkCounterexamples(
  shortcutExpression: string,
  canonicalExpression: string,
  outsideDomainSamples: Record<string, number>[],
  epsilon = DEFAULT_EPSILON
): { confirmedDivergent: Record<string, number>[]; unexpectedlyAgreed: Record<string, number>[] } {
  const confirmedDivergent: Record<string, number>[] = [];
  const unexpectedlyAgreed: Record<string, number>[] = [];

  for (const input of outsideDomainSamples) {
    const shortcutValue = (() => {
      try {
        return evalExpr(shortcutExpression, input);
      } catch {
        return null;
      }
    })();
    const canonicalValue = (() => {
      try {
        return evalExpr(canonicalExpression, input);
      } catch {
        return null;
      }
    })();
    const diverges =
      shortcutValue === null || canonicalValue === null || Math.abs(shortcutValue - canonicalValue) > epsilon * Math.max(1, Math.abs(canonicalValue ?? 0));
    (diverges ? confirmedDivergent : unexpectedlyAgreed).push(input);
  }

  return { confirmedDivergent, unexpectedlyAgreed };
}

export interface ValidateShortcutResult {
  overallStatus: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  propertyTest?: PropertyTestResult;
  exampleResults: Array<{ exampleId: string; isCounterexample: boolean; passed: boolean; expected: number | null; actual: number | null }>;
}

/**
 * Runs every applicable deterministic check for a shortcut version and
 * records the results (sec. 172, "Shortcut validation dashboard"). On a
 * clean PASS for a shortcut still early in its content lifecycle, promotes
 * shortcuts.status to VERIFIED - this is a statement about the *definition*
 * being mathematically sound, not about any individual student's mastery of
 * it (see README "Design decisions" for why those are tracked separately).
 */
export function validateShortcut(shortcutId: string, version: number): ValidateShortcutResult {
  const shortcut = shortcutRepo.getShortcutById(shortcutId);
  if (!shortcut) throw new Error(`Unknown shortcut ${shortcutId}`);
  const versionRow = shortcutRepo.getVersion(shortcutId, version);
  if (!versionRow) throw new Error(`Unknown version ${version} for shortcut ${shortcutId}`);

  const examples = shortcutRepo.listExamples(shortcutId, version);
  const exampleResults: ValidateShortcutResult['exampleResults'] = [];
  let anyExampleFailed = false;

  if (versionRow.expression) {
    for (const ex of examples) {
      const input = JSON.parse(ex.input) as Record<string, number>;
      let actual: number | null = null;
      try {
        actual = evalExpr(versionRow.expression, input);
      } catch {
        actual = null;
      }
      const expected = ex.expected_output;
      const passed = ex.is_counterexample
        ? true // counterexamples document *why* the shortcut shouldn't be used here, not a pass/fail of the expression
        : expected !== null && actual !== null && Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(expected));
      if (!ex.is_counterexample && !passed) anyExampleFailed = true;
      exampleResults.push({ exampleId: ex.id, isCounterexample: Boolean(ex.is_counterexample), passed, expected, actual });
    }
  }

  let propertyTest: PropertyTestResult | undefined;
  if (versionRow.expression && versionRow.canonical_expression && versionRow.validation_domain) {
    const domain = JSON.parse(versionRow.validation_domain) as ValidationDomain;
    propertyTest = runPropertyBasedValidation(versionRow.expression, versionRow.canonical_expression, domain);
    validationRepo.insertValidation({
      shortcutId,
      version,
      validationType: 'PROPERTY_BASED',
      status: propertyTest.status,
      evidence: propertyTest,
    });
  }

  if (examples.length > 0) {
    validationRepo.insertValidation({
      shortcutId,
      version,
      validationType: 'EXAMPLE_SET',
      status: anyExampleFailed ? 'FAIL' : 'PASS',
      evidence: { exampleResults },
    });
  }

  const hasAnyDeterministicCheck = Boolean(propertyTest) || examples.length > 0;
  const overallStatus: ValidateShortcutResult['overallStatus'] = !hasAnyDeterministicCheck
    ? 'INCONCLUSIVE'
    : (propertyTest?.status ?? 'PASS') === 'PASS' && !anyExampleFailed
      ? 'PASS'
      : 'FAIL';

  if (overallStatus === 'PASS' && ['DISCOVERED', 'UNVERIFIED', 'TESTING'].includes(shortcut.status)) {
    shortcutRepo.updateShortcutStatus(shortcutId, 'VERIFIED');
    analytics.logEvent({ tenantId: shortcut.tenant_id, studentId: shortcut.owner_student_id, eventType: 'shortcut_verified', payload: { shortcutId, version } });
  } else if (overallStatus === 'FAIL') {
    shortcutRepo.updateShortcutStatus(shortcutId, 'NEEDS_REVIEW');
    analytics.logEvent({ tenantId: shortcut.tenant_id, studentId: shortcut.owner_student_id, eventType: 'shortcut_review_required', payload: { shortcutId, version, reason: 'validation_failed' } });
  }

  logger.info('shortcut_validated', { shortcutId, version, overallStatus });

  return { overallStatus, propertyTest, exampleResults };
}
