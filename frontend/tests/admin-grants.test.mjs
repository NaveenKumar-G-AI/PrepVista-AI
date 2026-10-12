import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual client component offline using the same hook style as
// the existing frontend regression harnesses. No fetch fallback is available.
function harness() {
  const hooks = [];
  let index = 0, serial = 0, send = async () => ({ message: 'done' });
  const calls = [];
  const react = {
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], v => { hooks[i] = v; }]; },
    useRef(initial) { const i = index++; return hooks[i] ?? (hooks[i] = { current: initial }); },
  };
  const api = { grantAdminAccess(...args) { calls.push(args); return send(...args); } };
  const context = vm.createContext({ console, Error, crypto: { randomUUID: () => `request-${++serial}` } });
  const source = fs.readFileSync(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8') + '\nexport { GrantsSection };';
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/lib/api': { api },
  };
  const require = name => mocks[name] ?? new Proxy({}, { get: () => () => null });
  vm.runInContext(`(function(require,module,exports){${output}\n})`, context)(require, mod, mod.exports);
  function nodes(tree, type) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(n => nodes(n, type));
    return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
  }
  function render() {
    index = 0;
    const tree = mod.exports.GrantsSection({ data: { users: [{ id: 'target', email: 'test@example.test' }] }, loadOverview: async () => {} });
    return { selects: nodes(tree, 'select'), submit: () => nodes(tree, 'form')[0].props.onSubmit({ preventDefault() {} }) };
  }
  render().selects[0].props.onChange({ target: { value: 'target' } });
  return { render, calls, send: fn => { send = fn; } };
}

test('ambiguous grant failure retains ID; successful next intent gets a new ID', async () => {
  const h = harness();
  h.send(async () => { throw new Error('network timeout'); });
  await h.render().submit();
  h.send(async () => ({ message: 'done' }));
  await h.render().submit();
  assert.equal(h.calls[0][4], h.calls[1][4]);
  await h.render().submit();
  assert.notEqual(h.calls[1][4], h.calls[2][4]);
});

test('synchronous double submit sends exactly one request', async () => {
  const h = harness();
  let finish;
  h.send(() => new Promise(resolve => { finish = resolve; }));
  const form = h.render();
  const first = form.submit();
  await form.submit();
  assert.equal(h.calls.length, 1);
  finish({ message: 'done' });
  await first;
});

test('changed payload after failure receives a different request ID', async () => {
  const h = harness();
  h.send(async () => { throw new Error('network timeout'); });
  await h.render().submit();
  h.render().selects[1].props.onChange({ target: { value: 'pro' } });
  await h.render().submit();
  assert.notEqual(h.calls[0][4], h.calls[1][4]);
  assert.equal(h.calls[1][1], 'pro');
});
