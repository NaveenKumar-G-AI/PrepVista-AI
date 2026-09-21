import { pythonAdapter } from '../src/parsers/python_adapter';
import { extractFunctions } from '../src/analysis/structural';
import { detectDuplication } from '../src/analysis/duplication';

test('detects exact structural duplication despite renamed identifiers and different literals', async () => {
  const src = `
def calc_area_square(side):
    result = side * side
    return result

def calc_area_tile(length):
    output = length * length
    return output
`;
  const parsed = await pythonAdapter.parse(src);
  const functions = extractFunctions(parsed.root);
  const dup = detectDuplication(functions, 2, 0.8);
  expect(dup.some((d) => d.kind === 'EXACT_STRUCTURAL')).toBe(true);
});

test('does not flag structurally different small functions as duplicates', async () => {
  const src = `
def add(a, b):
    return a + b

def greet(name):
    print("hello there " + name)
    log_event("greeted")
`;
  const parsed = await pythonAdapter.parse(src);
  const functions = extractFunctions(parsed.root);
  const dup = detectDuplication(functions, 1, 0.8);
  expect(dup.some((d) => d.kind === 'EXACT_STRUCTURAL')).toBe(false);
});
