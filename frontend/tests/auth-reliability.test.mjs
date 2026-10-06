import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const __dirname = import.meta.dirname;

// Execute the actual TS/TSX modules offline. Fetch has no live-network fallback.
// Hook tests exercise provider state transitions, not browser DOM rendering.
function harness() {
  const storage = () => {
    const data = new Map();
    return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
  };
  const localStorage = storage(), sessionStorage = storage();
  const window = new EventTarget();
  window.location = { pathname: '/interview/test', origin: 'http://test', href: 'http://test/interview/test' };
  let fetchImpl = () => { throw new Error('Unmocked fetch: live network is forbidden.'); };
  let hookIndex = 0;
  const hooks = [], effects = [], routes = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => ({}),
    useState: initial => {
      const i = hookIndex++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useRef: value => { const i = hookIndex++; return hooks[i] ?? (hooks[i] = { current: value }); },
    useCallback: fn => fn,
    useEffect: fn => { effects.push(fn); },
    Suspense: 'Suspense',
  };
  const sb = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  const context = vm.createContext({
    process: { env: { NODE_ENV: 'test', NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy' } }, console, URL, Error, TypeError, DOMException,
    Response, AbortController, Event, window, localStorage, sessionStorage,
    crypto: { randomUUID: () => 'test-request-id' },
    fetch: (...args) => fetchImpl(...args),
    setTimeout: (fn, ms) => { if (ms < 8000) queueMicrotask(fn); return 1; }, clearTimeout() {},
  });
  const modules = new Map();
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: p => routes.push(p), replace: p => routes.push(p) }) },
    '@/lib/supabase': { getSupabase: () => sb, exchangeGoogleCode: code => sb.auth.exchangeCodeForSession(code) },
    '@/lib/plan-usage': { deriveUsageForPlan: usage => usage },
  };
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = { exports: {} };
    modules.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const requireLocal = name => {
      if (mocks[name]) return mocks[name];
      let resolved = name.startsWith('@/') ? `src/${name.slice(2)}` : path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name));
      if (!path.extname(resolved)) resolved += '.ts';
      return load(resolved);
    };
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename })(requireLocal, mod, mod.exports);
    return mod.exports;
  }
  const api = load('src/lib/api.ts').api;
  const access = 'aaa.bbb.ccc';
  api.setTokens(access, 'original-refresh');
  localStorage.setItem('coding-draft', 'unsaved code');
  sessionStorage.setItem('workspace', 'active interview');
  let events = 0;
  window.addEventListener('prepvista:auth-required', () => events++);
  const preserved = () => {
    assert.ok(api.getToken());
    assert.ok(localStorage.getItem('pv_refresh_token'));
    assert.equal(localStorage.getItem('coding-draft'), 'unsaved code');
    assert.equal(sessionStorage.getItem('workspace'), 'active interview');
    assert.equal(events, 0);
  };
  return { api, load, sb, routes, effects, hooks, mocks, window, localStorage, sessionStorage, preserved,
    render: component => { hookIndex = 0; return component({ children: null }); },
    fetch: fn => { fetchImpl = fn; }, events: () => events,
  };
}

const response = (status, data = { detail: 'test failure' }) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const refreshed = () => response(200, { access_token: 'new.token.signature', refresh_token: 'rotated-refresh' });
const failures = {
  500: () => response(500), 502: () => response(502), 503: () => response(503),
  network: () => { throw new TypeError('Failed to fetch'); },
  timeout: () => { throw new DOMException('Timed out', 'AbortError'); },
};

for (const [name, fail] of Object.entries(failures)) {
  test(`${name}: no logout and drafts preserved`, async () => {
    const h = harness();
    h.fetch(fail);
    await assert.rejects(h.api.request('/protected', { retries: 0 }));
    h.preserved();
  });
  test(`${name} -> retry -> 401 -> one refresh -> success`, async () => {
    const h = harness();
    let calls = 0, refreshes = 0;
    const requestIds = [];
    h.fetch((url, options) => {
      if (url.endsWith('/auth/refresh')) { refreshes++; return refreshed(); }
      requestIds.push(options.headers['X-Request-ID']);
      calls++;
      if (calls === 1) return fail();
      return calls === 2 ? response(401) : response(200, { ok: true });
    });
    assert.equal((await h.api.request('/protected')).ok, true);
    assert.equal(refreshes, 1);
    assert.equal(calls, 3);
    assert.equal(new Set(requestIds).size, 1);
    h.preserved();
  });
  test(`401 -> refresh ${name}: retain recoverability`, async () => {
    const h = harness();
    let refreshes = 0;
    h.fetch(url => {
      if (url.endsWith('/auth/refresh')) { refreshes++; return fail(); }
      return response(401);
    });
    await assert.rejects(h.api.request('/protected'), error => error.authRefreshTemporary === true && error.status !== 401);
    assert.equal(refreshes, 1);
    assert.equal(h.localStorage.getItem('pv_refresh_token'), 'original-refresh');
    h.preserved();
    h.fetch(url => url.endsWith('/auth/refresh') ? refreshed() : response(401));
    // A later logical request retains its independent chance to recover.
    let count = 0;
    h.fetch(url => url.endsWith('/auth/refresh') ? refreshed() : response(++count === 1 ? 401 : 200, { ok: true }));
    assert.equal((await h.api.request('/protected')).ok, true);
    h.preserved();
  });
}

test('403 is forbidden without logout or refresh', async () => {
  const h = harness();
  let calls = 0;
  h.fetch(() => { calls++; return response(403); });
  await assert.rejects(h.api.request('/protected'), error => error.status === 403);
  assert.equal(calls, 1);
  h.preserved();
});

test('first 401 refreshes once and succeeds even with no transport retries', async () => {
  const h = harness();
  let calls = 0, refreshes = 0;
  h.fetch(url => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return refreshed(); }
    return response(++calls === 1 ? 401 : 200, { ok: true });
  });
  assert.equal((await h.api.request('/protected', { retries: 0 })).ok, true);
  assert.equal(refreshes, 1);
  h.preserved();
});

test('refresh success then genuine replay 401 ends auth without looping', async () => {
  const h = harness();
  let refreshes = 0, calls = 0;
  h.fetch(url => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return refreshed(); }
    calls++;
    return response(401);
  });
  await assert.rejects(h.api.request('/protected'), error => error.status === 401);
  assert.equal(refreshes, 1);
  assert.equal(calls, 2);
  assert.equal(h.api.getToken(), null);
  assert.equal(h.events(), 1);
});

test('confirmed invalid refresh ends authentication', async () => {
  const h = harness();
  let refreshes = 0;
  h.fetch(url => { if (url.endsWith('/auth/refresh')) refreshes++; return response(401); });
  await assert.rejects(h.api.request('/protected'), error => error.status === 401);
  assert.equal(refreshes, 1);
  assert.equal(h.api.getToken(), null);
  assert.equal(h.events(), 1);
});

test('concurrent 401s share one refresh', async () => {
  const h = harness();
  let refreshes = 0;
  h.fetch((url, options) => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return Promise.resolve(refreshed()); }
    return Promise.resolve(response(options.headers.Authorization === 'Bearer aaa.bbb.ccc' ? 401 : 200, { ok: true }));
  });
  await Promise.all([h.api.request('/first'), h.api.request('/second')]);
  assert.equal(refreshes, 1);
  h.preserved();
});

test('non-GET transport failure is not replayed automatically', async () => {
  const h = harness();
  let calls = 0;
  h.fetch(() => { calls++; return response(503); });
  await assert.rejects(h.api.request('/write', { method: 'POST' }));
  assert.equal(calls, 1);
  h.preserved();
});

for (const [name, fail] of Object.entries(failures)) {
  test(`AuthProvider ${name}: keep known college roles`, async () => {
    const h = harness();
    const { AuthProvider } = h.load('src/lib/auth-context.tsx');
    const known = { id: 'student', org_student: true, is_org_admin: true };
    h.fetch(() => response(200, known));
    await h.render(AuthProvider).props.value.refreshUser();
    // Clear only response cache to exercise a real subsequent profile request.
    h.api.invalidateCache();
    h.fetch(fail);
    await assert.rejects(h.render(AuthProvider).props.value.refreshUser());
    const state = h.render(AuthProvider).props.value;
    assert.equal(state.user.org_student, true);
    assert.equal(state.user.is_org_admin, true);
    assert.equal(state.authState, 'authenticated');
    h.preserved();
  });
}

test('AuthProvider cold-start outage keeps page guards waiting and exposes retry', async () => {
  const h = harness();
  const { AuthProvider } = h.load('src/lib/auth-context.tsx');
  h.fetch(() => response(503));
  await assert.rejects(h.render(AuthProvider).props.value.refreshUser());
  const tree = h.render(AuthProvider);
  assert.equal(tree.props.value.user, null);
  assert.equal(tree.props.value.loading, true);
  assert.equal(tree.props.value.authState, 'loading');
  assert.equal(tree.props.children[0].props.role, 'alert');
  h.preserved();
});

test('new-tab restore outage preserves stored refresh token', async () => {
  const h = harness();
  h.sessionStorage.removeItem('pv_access_token');
  h.fetch(() => response(503));
  await assert.rejects(h.api.restoreSession());
  assert.equal(h.localStorage.getItem('pv_refresh_token'), 'original-refresh');
  assert.equal(h.events(), 0);
});

function callback(h, overrides = {}) {
  const { createGoogleCallback } = h.load('src/lib/oauth-callback.ts');
  return createGoogleCallback({
    code: 'test-code',
    exchangeCode: async () => ({ data: { session: { access_token: 'oauth.token.signature', refresh_token: 'oauth-refresh' } } }),
    getSession: async () => ({ data: { session: null } }),
    setTokens: (a, r) => h.api.setTokens(a, r),
    completeLogin: () => h.api.completeOAuthLogin(), refreshUser: async () => {},
    getMe: () => h.api.getMe(), ...overrides,
  });
}

for (const [role, profile, expected] of [
  ['normal student', { org_student: false, is_org_admin: false }, '/dashboard'],
  ['college student', { org_student: true, is_org_admin: false }, '/student-dashboard'],
  ['college admin', { org_student: false, is_org_admin: true }, '/org-admin'],
]) {
  test(`Google success preserves ${role} routing`, async () => {
    const h = harness();
    h.fetch(url => response(200, url.endsWith('/auth/me') ? profile : { status: 'ok' }));
    const result = await callback(h)();
    assert.equal(result.kind, 'success');
    assert.equal(result.path, expected);
    h.preserved();
  });
}

for (const error of [
  { name: 'AuthPKCECodeVerifierMissingError', status: 400 },
  { code: 'flow_state_expired', status: 400 },
  { code: 'flow_state_not_found', status: 400 },
  { code: 'bad_code_verifier', status: 400 },
  { code: 'invalid_grant', status: 400 },
]) {
  test(`Google terminal ${error.name || error.code}: fresh sign-in, no same-code loop`, async () => {
    const h = harness();
    let exchanges = 0;
    const run = callback(h, { exchangeCode: async () => { exchanges++; throw error; } });
    assert.equal((await run()).kind, 'fresh-sign-in');
    assert.equal((await run()).kind, 'fresh-sign-in');
    assert.equal(exchanges, 1);
    h.preserved();
  });
}

for (const [name, error] of [
  ['500', { status: 500 }], ['502', { status: 502 }], ['503', { status: 503 }],
  ['network', new TypeError('Failed to fetch')], ['timeout', new DOMException('Timed out', 'AbortError')],
  ['retryable provider', { name: 'AuthRetryableFetchError', status: 429 }],
]) {
  test(`Google ${name}: explicit retry remains available without logout`, async () => {
    const h = harness();
    let exchanges = 0;
    h.fetch(() => response(200, { org_student: true }));
    const run = callback(h, { exchangeCode: async () => {
      if (++exchanges === 1) throw error;
      return { data: { session: { access_token: 'oauth.token.signature', refresh_token: 'oauth-refresh' } } };
    } });
    assert.equal((await run()).kind, 'retry');
    h.preserved();
    assert.equal((await run()).path, '/student-dashboard');
    assert.equal(exchanges, 2);
    h.preserved();
  });
}

test('Google backend outage after exchange retries using saved session, not consumed code', async () => {
  const h = harness();
  let exchanges = 0, completions = 0;
  h.fetch(url => {
    if (url.endsWith('/auth/oauth/complete') && ++completions === 1) return response(503);
    return response(200, { org_student: true });
  });
  const run = callback(h, { exchangeCode: async () => { exchanges++; return { data: { session: { access_token: 'oauth.token.signature', refresh_token: 'oauth-refresh' } } }; } });
  assert.equal((await run()).kind, 'retry');
  // Simulate a refresh that rotated credentials between callback attempts.
  h.api.setTokens('rotated.oauth.signature', 'rotated-oauth-refresh');
  assert.equal((await run()).path, '/student-dashboard');
  assert.equal(exchanges, 1);
  assert.equal(h.localStorage.getItem('pv_refresh_token'), 'rotated-oauth-refresh');
  h.preserved();
});

test('Google callback concurrent/StrictMode attempts exchange once', async () => {
  const h = harness();
  let exchanges = 0;
  h.fetch(() => response(200, {}));
  const run = callback(h, { exchangeCode: async () => { exchanges++; return { data: { session: { access_token: 'oauth.token.signature', refresh_token: 'oauth-refresh' } } }; } });
  await Promise.all([run(), run()]);
  assert.equal(exchanges, 1);
});

for (const error of [{ status: 503 }, new TypeError('offline'), new DOMException('timeout', 'AbortError')]) {
  test(`SDK code-verifier deletion on ${error.status || error.name} is repaired only for temporary failure`, async () => {
    const h = harness();
    const key = 'sb-project-auth-token-code-verifier';
    const saved = '"private-verifier"';
    h.localStorage.setItem(key, saved);
    let config;
    h.window.location = { pathname: '/auth/callback', href: 'http://test/auth/callback?code=test-code' };
    h.mocks['@supabase/supabase-js'] = { createClient: (_url, _key, options) => {
      config = options;
      return { auth: { exchangeCodeForSession: async () => {
        h.localStorage.removeItem(key);
        return { data: { session: null }, error };
      } } };
    } };
    const real = h.load('src/lib/supabase.ts');
    await assert.rejects(real.exchangeGoogleCode('test-code'));
    assert.equal(config.auth.detectSessionInUrl, false);
    assert.equal(h.localStorage.getItem(key), saved);
    h.preserved();
  });
}

test('missing verifier exits before exchanging and does not invent verifier material', async () => {
  const h = harness();
  let exchanges = 0;
  h.mocks['@supabase/supabase-js'] = { createClient: () => ({ auth: { exchangeCodeForSession: async () => { exchanges++; } } }) };
  const real = h.load('src/lib/supabase.ts');
  await assert.rejects(real.exchangeGoogleCode('test-code'), error => error.name === 'AuthPKCECodeVerifierMissingError');
  assert.equal(exchanges, 0);
  h.preserved();
});

test('SDK terminal error does not restore rejected verifier', async () => {
  const h = harness();
  const key = 'sb-project-auth-token-code-verifier';
  h.localStorage.setItem(key, '"private-verifier"');
  h.mocks['@supabase/supabase-js'] = { createClient: () => ({ auth: { exchangeCodeForSession: async () => {
    h.localStorage.removeItem(key);
    return { data: { session: null }, error: { code: 'bad_code_verifier', status: 400 } };
  } } }) };
  const real = h.load('src/lib/supabase.ts');
  await assert.rejects(real.exchangeGoogleCode('test-code'));
  assert.equal(h.localStorage.getItem(key), null);
});

test('real request timeout signal aborts, then preserves refresh eligibility', async () => {
  const h = harness();
  let calls = 0, refreshes = 0;
  h.fetch((url, options) => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return refreshed(); }
    if (++calls === 1) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError'))));
    return response(calls === 2 ? 401 : 200, { ok: true });
  });
  assert.equal((await h.api.request('/protected', { timeoutMs: 1 })).ok, true);
  assert.equal(refreshes, 1);
  h.preserved();
});

test('login profile outage waits for authoritative roles instead of inventing a free student', async () => {
  const h = harness();
  const { AuthProvider } = h.load('src/lib/auth-context.tsx');
  h.fetch(url => url.endsWith('/auth/login') ? response(200, { access_token: 'new.token.signature', refresh_token: 'new-refresh', user: { id: 'college', email: 'college@example.test' } }) : response(503));
  await assert.rejects(h.render(AuthProvider).props.value.login('college@example.test', 'test-password'));
  const state = h.render(AuthProvider).props.value;
  assert.equal(state.user, null);
  assert.equal(state.loading, true);
  assert.equal(h.routes.length, 0);
  h.preserved();
});

test('callback page exposes retry after backend outage and then routes to college workspace', async () => {
  const h = harness();
  h.mocks['@/lib/auth-context'] = { useAuth: () => ({ refreshUser: async () => {} }) };
  h.mocks['next/navigation'].useSearchParams = () => new URLSearchParams('code=test-code');
  h.sb.auth.exchangeCodeForSession = async () => ({ data: { session: { access_token: 'oauth.token.signature', refresh_token: 'oauth-refresh' } } });
  const { default: Page } = h.load('src/app/auth/callback/page.tsx');
  const Logic = h.render(Page).props.children[0].props.children.type;
  h.fetch(() => response(503));
  h.render(Logic);
  h.effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  const retry = h.render(Logic);
  assert.equal(retry.props.role, 'alert');
  assert.equal(h.routes.length, 0);
  h.preserved();
  h.fetch(() => response(200, { org_student: true }));
  retry.props.children.find(child => child?.type === 'button').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.routes.at(-1), '/student-dashboard');
  h.preserved();
});

test('AuthProvider callback bootstrap leaves OAuth exchange to callback handler', async () => {
  const h = harness();
  h.window.location.pathname = '/auth/callback';
  let reads = 0;
  h.sb.auth.getSession = async () => { reads++; throw new Error('Should not run during callback bootstrap'); };
  const { AuthProvider } = h.load('src/lib/auth-context.tsx');
  h.render(AuthProvider);
  h.effects[2]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0);
  assert.equal(h.routes.length, 0);
  h.preserved();
});

for (const [profile, expected] of [
  [{ org_student: false, is_org_admin: false }, '/dashboard'],
  [{ org_student: true, is_org_admin: false }, '/student-dashboard'],
  [{ org_student: false, is_org_admin: true }, '/org-admin'],
]) {
  test(`password login routes only after authoritative profile: ${expected}`, async () => {
    const h = harness();
    const { AuthProvider } = h.load('src/lib/auth-context.tsx');
    h.fetch(url => url.endsWith('/auth/login') ? response(200, { access_token: 'new.token.signature', refresh_token: 'new-refresh' }) : response(200, profile));
    await h.render(AuthProvider).props.value.login('student@example.test', 'test-password');
    assert.equal(h.routes.at(-1), expected);
    assert.equal(h.render(AuthProvider).props.value.user.org_student, profile.org_student);
    h.preserved();
  });
}
