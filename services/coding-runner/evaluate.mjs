import variant from '@jitl/quickjs-singlefile-cjs-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import { isDeepStrictEqual } from 'node:util';

export function validateInput(value) {
  if (!value || typeof value.code !== 'string' || value.code.length > 20000 ||
      typeof value.entry !== 'string' || !/^[a-zA-Z_$][\w$]{0,80}$/.test(value.entry) ||
      !Array.isArray(value.tests) || !value.tests.length || value.tests.length > 30 ||
      Buffer.byteLength(JSON.stringify(value)) > 120000 ||
      value.tests.some(t => !t || !/^case-\d{1,2}$/.test(t.id) || !Array.isArray(t.args) || !Object.hasOwn(t, 'expected')) ||
      new Set(value.tests.map(t => t.id)).size !== value.tests.length) throw new Error('Invalid runner input');
}

// Invoked only inside the restricted per-job container in production. Local
// tests use authored fixtures. No guest host functions, modules or I/O bindings.
export async function evaluate(request) {
  validateInput(request);
  const engine = await newQuickJSWASMModuleFromVariant(variant);
  const checks = [];
  for (const test of request.tests) {
    const runtime = engine.newRuntime();
    runtime.setMemoryLimit(24 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    const deadline = Date.now() + 350;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const context = runtime.newContext();
    let status = 'RUNTIME_ERROR';
    try {
      // Retain the original serializer outside the guest's global namespace.
      // Submission code cannot replace the function used to read its result.
      const json = context.getProp(context.global, 'JSON');
      const serialize = context.getProp(json, 'stringify');
      try {
        const compiled = context.evalCode('"use strict";\n' + request.code, 'submission.js');
        if (compiled.error) { compiled.error.dispose(); }
        else {
          compiled.value.dispose();
          const called = context.evalCode(`${request.entry}(...${JSON.stringify(test.args)})`, 'invocation.js');
          if (called.error) { called.error.dispose(); }
          else {
            try {
              const encoded = context.callFunction(serialize, json, called.value);
              if (encoded.error) { encoded.error.dispose(); }
              else {
                try {
                  if (context.typeof(encoded.value) !== 'string') throw new Error('A JSON result is required');
                  const serialized = context.getString(encoded.value);
                  if (serialized.length > 64000) status = 'OUTPUT_LIMIT';
                  else status = isDeepStrictEqual(JSON.parse(serialized), test.expected) ? 'PASSED' : 'WRONG_ANSWER';
                } finally { encoded.value.dispose(); }
              }
            } finally { called.value.dispose(); }
          }
        }
      } finally { serialize.dispose(); json.dispose(); }
    } catch { /* Return bounded categories only, never guest output or stack. */ }
    finally {
      if (Date.now() > deadline) status = 'TIME_LIMIT';
      context.dispose(); runtime.dispose();
    }
    checks.push({ id: test.id, status });
  }
  return { checks, passed: checks.filter(c => c.status === 'PASSED').length };
}
