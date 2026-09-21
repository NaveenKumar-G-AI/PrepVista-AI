import { pythonAdapter } from '../src/parsers/python_adapter';
import { jsAdapter } from '../src/parsers/js_adapter';
import { extractFunctions, detectUnreachableCode, detectUnusedImports, detectUnusedVariables } from '../src/analysis/structural';
import { detectDuplication } from '../src/analysis/duplication';
import { detectMagicValues } from '../src/analysis/magic_values';
import { detectNamingIssues } from '../src/analysis/naming';
import { detectSwallowedExceptions, detectResourceLeaks } from '../src/analysis/error_handling';
import { runRules } from '../src/rules/engine';
import { RuleContext } from '../src/rules/types';
import { THRESHOLDS, RULE_SET_VERSION } from '../src/config';

async function buildContext(source: string, language: 'python' | 'typescript'): Promise<RuleContext> {
  const adapter = language === 'python' ? pythonAdapter : jsAdapter;
  const parsed = await adapter.parse(source);
  const functions = extractFunctions(parsed.root);
  return {
    language,
    root: parsed.root,
    functions,
    duplication: detectDuplication(functions, THRESHOLDS.DUPLICATION_MIN_STATEMENTS, THRESHOLDS.NEAR_DUP_SIMILARITY),
    magicValues: detectMagicValues(parsed.root),
    namingIssues: detectNamingIssues(functions.map((f) => ({ name: f.name, node: f.node }))),
    swallowedExceptions: detectSwallowedExceptions(parsed.root),
    resourceLeaks: detectResourceLeaks(parsed.root),
    deadCode: detectUnreachableCode(parsed.root),
    unusedVariables: detectUnusedVariables(functions),
    unusedImports: detectUnusedImports(parsed.root),
    comments: parsed.comments,
    thresholds: THRESHOLDS,
    ruleVersion: RULE_SET_VERSION,
  };
}

describe('rule engine — Python', () => {
  test('flags a bare except that swallows errors', async () => {
    const src = `
def risky():
    try:
        do_something()
    except:
        pass
`;
    const findings = runRules(await buildContext(src, 'python'));
    expect(findings.some((f) => f.ruleId === 'SWALLOWED_EXCEPTION')).toBe(true);
  });

  test('does not flag a well-scoped, well-handled try/except', async () => {
    const src = `
def safe_divide(numerator, denominator):
    try:
        return numerator / denominator
    except ZeroDivisionError:
        logger.warning("division by zero")
        return None
`;
    const findings = runRules(await buildContext(src, 'python'));
    expect(findings.some((f) => f.ruleId === 'SWALLOWED_EXCEPTION')).toBe(false);
  });

  test('flags deep nesting', async () => {
    const src = `
def process(items):
    for item in items:
        if item.active:
            for tag in item.tags:
                if tag.enabled:
                    if tag.priority:
                        print(tag)
`;
    const findings = runRules(await buildContext(src, 'python'));
    expect(findings.some((f) => f.ruleId === 'DEEP_NESTING')).toBe(true);
  });

  test('flags a resource opened without a with-block', async () => {
    const src = `
def read_config():
    f = open("config.txt")
    data = f.read()
    return data
`;
    const findings = runRules(await buildContext(src, 'python'));
    expect(findings.some((f) => f.ruleId === 'RESOURCE_LEAK')).toBe(true);
  });

  test('does not flag a resource opened inside a with-block', async () => {
    const src = `
def read_config():
    with open("config.txt") as f:
        return f.read()
`;
    const findings = runRules(await buildContext(src, 'python'));
    expect(findings.some((f) => f.ruleId === 'RESOURCE_LEAK')).toBe(false);
  });

  test('detects structurally duplicated functions even with renamed variables', async () => {
    const src = `
def compute_total_price(items):
    total = 0
    for item in items:
        total = total + item.price
    return total

def compute_total_weight(products):
    sum_value = 0
    for product in products:
        sum_value = sum_value + product.price
    return sum_value

def unrelated_helper(a, b, c, d):
    return a
`;
    const ctx = await buildContext(src, 'python');
    expect(ctx.duplication.some((d) => d.kind === 'EXACT_STRUCTURAL')).toBe(true);
    const findings = runRules(ctx);
    expect(findings.some((f) => f.ruleId === 'DUPLICATED_LOGIC')).toBe(true);
  });

  test('flags unreachable code after a return', async () => {
    const src = `
def check(x):
    if x > 0:
        return True
        print("never runs")
    return False
`;
    const findings = runRules(await buildContext(src, 'python'));
    expect(findings.some((f) => f.ruleId === 'DEAD_CODE')).toBe(true);
  });

  test('flags an unused import but not one that is actually used', async () => {
    const src = `
import os
import sys

def main():
    print(sys.argv)
`;
    const findings = runRules(await buildContext(src, 'python'));
    const unused = findings.filter((f) => f.ruleId === 'UNUSED_IMPORT');
    expect(unused.some((f) => f.evidence.includes('name=os'))).toBe(true);
    expect(unused.some((f) => f.evidence.includes('name=sys'))).toBe(false);
  });

  test('flags a magic number', async () => {
    const src = `
def retry(fn):
    for attempt in range(10):
        try:
            return fn()
        except Exception:
            wait_for(7)
    raise RuntimeError("giving up")
`;
    const findings = runRules(await buildContext(src, 'python'));
    expect(findings.some((f) => f.ruleId === 'MAGIC_NUMBER')).toBe(true);
  });

  test('does not flag a natural-language error message as a magic string', async () => {
    const src = `
def calculate_average(values):
    if not values:
        raise ValueError("values must not be empty")
    return sum(values) / len(values)
`;
    const findings = runRules(await buildContext(src, 'python'));
    expect(findings.some((f) => f.ruleId === 'MAGIC_STRING')).toBe(false);
  });
});

describe('rule engine — TypeScript/JavaScript', () => {
  test('flags an empty catch block', async () => {
    const src = `
function risky() {
  try {
    doSomething();
  } catch (e) {
  }
}
`;
    const findings = runRules(await buildContext(src, 'typescript'));
    expect(findings.some((f) => f.ruleId === 'SWALLOWED_EXCEPTION')).toBe(true);
  });

  test('flags a function with too many parameters', async () => {
    const src = `
function createUser(name, email, age, address, phone, role, department) {
  return { name, email, age, address, phone, role, department };
}
`;
    const findings = runRules(await buildContext(src, 'typescript'));
    expect(findings.some((f) => f.ruleId === 'EXCESSIVE_PARAMETERS')).toBe(true);
  });

  test('does not flag i/j inside a conventional nested loop', async () => {
    const src = `
function sumMatrix(matrix) {
  let total = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      total += matrix[i][j];
    }
  }
  return total;
}
`;
    const findings = runRules(await buildContext(src, 'typescript'));
    const flaggedLoopVars = findings.some((f) => f.ruleId === 'POOR_NAMING' && (f.evidence.includes('name=i') || f.evidence.includes('name=j')));
    expect(flaggedLoopVars).toBe(false);
  });
});
