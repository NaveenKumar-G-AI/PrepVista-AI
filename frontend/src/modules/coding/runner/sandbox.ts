import variant from '@jitl/quickjs-singlefile-browser-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import { deepEqual } from '@/modules/coding/engines/challenges/execution/deepEqual';
import type { TestCase } from '@/modules/coding/engines/challenges/domain/types';

export type CheckResult = { id: string; passed: boolean; status: 'Passed' | 'Wrong answer' | 'Runtime error' | 'Syntax error' | 'Timeout'; actual?: unknown; expected: unknown; note: string; error?: string };
export type RunRequest = { code: string; entry: string; tests: TestCase[]; comparison: 'exact' | 'unordered_collection' };
export async function evaluate(request: RunRequest): Promise<CheckResult[]> {
  if (request.code.length > 20000 || !/^[a-zA-Z_$][\w$]*$/.test(request.entry) || request.tests.length > 30) throw new Error('Invalid execution request');
  const engine = await newQuickJSWASMModuleFromVariant(variant);
  return request.tests.map(test => {
    const runtime = engine.newRuntime();
    runtime.setMemoryLimit(24 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    const deadline = Date.now() + 400;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const context = runtime.newContext();
    try {
      // Untrusted source runs only inside a WASM VM, without host functions or modules.
      // An independent worker termination deadline also contains parser/allocator stalls.
      const expression = request.entry === 'MyQueue'
        ? `(() => { const queue = new MyQueue(); return ${JSON.stringify(test.input[0])}.ops.map(({op, arg}) => { const result = op === 'push' ? queue.push(arg) : queue[op](); return result === undefined ? null : result; }); })()`
        : `${request.entry}(...${JSON.stringify(test.input)})`;
      const result = context.evalCode(`"use strict";\n${request.code}\n;JSON.stringify(${expression})`, 'solution.js');
      if (result.error) {
        const detail: unknown = context.dump(result.error);
        result.error.dispose();
        const e = typeof detail === 'object' && detail !== null ? detail as Record<string, unknown> : {};
        const timedOut = Date.now() > deadline || e.message === 'interrupted';
        return { id: test.id, passed: false, status: timedOut ? 'Timeout' : e.name === 'SyntaxError' ? 'Syntax error' : 'Runtime error', expected: test.expectedOutput, note: test.note ?? test.category, error: timedOut ? 'This check exceeded its time limit.' : String(e.message ?? 'The function could not return a result.').slice(0, 400) };
      }
      const serialized: unknown = context.dump(result.value);
      result.value.dispose();
      if (typeof serialized !== 'string' || serialized.length > 100000) throw new Error('Return a JSON-compatible result under 100 KB.');
      const actual: unknown = JSON.parse(serialized);
      const passed = deepEqual(actual, test.expectedOutput, request.comparison);
      return { id: test.id, passed, status: passed ? 'Passed' : 'Wrong answer', expected: test.expectedOutput, actual, note: test.note ?? test.category };
    } catch (error) {
      return { id: test.id, passed: false, status: 'Runtime error', expected: test.expectedOutput, note: test.note ?? test.category, error: error instanceof Error ? error.message.slice(0, 400) : 'Unable to read the result.' };
    } finally { context.dispose(); runtime.dispose(); }
  });
}
