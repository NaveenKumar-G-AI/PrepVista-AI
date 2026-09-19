import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export function loadTs(path, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}), console, process: { env: {} },
    setTimeout, clearTimeout, Blob, FormData, AbortController, URL, ...globals });
  return exports;
}
