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
  const swrState = {};
  let swrStarted = false;
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => ({}),
    useState: initial => {
      const i = hookIndex++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useMemo: fn => fn(),
    useRef: value => { const i = hookIndex++; return hooks[i] ?? (hooks[i] = { current: value }); },
    useCallback: fn => fn,
    useEffect: fn => { effects.push(fn); },
    Suspense: 'Suspense',
  };
  const sb = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  const context = vm.createContext({
    process: { env: { NODE_ENV: 'test', NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy' } }, console, URL, Error, TypeError, DOMException,
    Response, AbortController, Event, URLSearchParams, Blob, ArrayBuffer, window, localStorage, sessionStorage,
    document: { addEventListener() {}, removeEventListener() {} },
    crypto: { randomUUID: () => 'test-request-id' },
    fetch: (...args) => fetchImpl(...args),
    setTimeout: (fn, ms) => { if (ms < 2000) queueMicrotask(fn); return 1; }, clearTimeout() {},
  });
  const modules = new Map();
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: p => routes.push(p), replace: p => routes.push(p) }), useParams: () => ({ id: '00000000-0000-4000-8000-000000000001' }), usePathname: () => '/org-admin/analytics', useSearchParams: () => new URLSearchParams() },
    '@/lib/auth-context': { useAuth: () => ({ user: { is_org_admin: true }, loading: false }) },
    'swr': { default: (key, fetcher, options) => {
      if (key && !swrStarted) { swrStarted = true; effects.push(() => fetcher().then(data => { swrState.data = data; }).catch(error => { swrState.error = error; options.onError?.(error); })); }
      return { ...swrState, isLoading: false, mutate: async () => {} };
    } },
    'next/link': { default: 'a' },
    'next/dynamic': { default: () => () => null },
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
      if (name.includes('/components/') || name === 'lucide-react') {
        if (name === '@/components/score-summary') return load('src/components/score-summary.tsx');
        return new Proxy({}, { get: () => () => null });
      }
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
  return { api, load, sb, swrState, routes, effects, hooks, mocks, window, localStorage, sessionStorage, preserved,
    render: component => { hookIndex = 0; return component({ children: null }); },
    fetch: fn => { fetchImpl = fn; }, events: () => events,
  };
}


const tick = async () => { for (let i=0;i<20;i++) await new Promise(resolve => setImmediate(resolve)); };
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'object') return typeof node.type === 'function' ? text(node.type(node.props)) : text(node.props?.children);
  return String(node);
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map(n => find(n, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
const response = (status, data) => new Response(JSON.stringify(data ?? { detail: 'Access unavailable' }), { status, headers: { 'content-type': 'application/json' } });
const pages = [
  'src/app/org-admin/page.tsx', 'src/app/org-admin/students/page.tsx',
  'src/app/org-admin/students/[id]/page.tsx', 'src/app/org-admin/reports/page.tsx',
  'src/app/org-admin/analytics/[[...slug]]/page.tsx', 'src/app/org-admin/billing/page.tsx',
  'src/app/org-admin/drives/page.tsx',
];
for (const page of pages) for (const status of [403,503]) {
  test(`actual ${page}: ${status} preserves session and displays failure`, async () => {
    const h = harness(); h.fetch(() => response(status));
    const component = h.load(page).default;
    h.render(component); for (const effect of h.effects.splice(0)) effect();
    await tick(); const output = text(h.render(component));
    h.preserved(); assert.ok(!h.routes.includes('/login'));
    assert.ok(/unavailable|failed|try again|could not|couldn't|error|unable|access|unexpected/i.test(output), output);
  });
}
for (const [profile, path] of [[{},'/dashboard'],[{org_student:true},'/student-dashboard'],[{is_org_admin:true},'/org-admin'],[{is_admin:true,org_student:true,is_org_admin:true},'/admin']]) {
  test(`actual OAuth completion role destination ${path}`, async () => {
    const h = harness();
    const run = h.load('src/lib/oauth-callback.ts').createGoogleCallback({ code:'mock-code',
      exchangeCode: async () => ({ data:{session:{access_token:'access',refresh_token:'refresh'}} }),
      getSession: async () => ({data:{session:null}}), setTokens(){}, completeLogin:async()=>{}, refreshUser:async()=>{}, getMe:async()=>profile });
    assert.equal((await run()).path,path);
  });
  test(`actual login page waits for authoritative role ${path}`, () => {
    const h = harness(); h.mocks['@/lib/auth-context'].useAuth = () => ({user:profile,loading:false});
    const root = h.load('src/app/login/page.tsx').default();
    // The default wraps its actual LoginForm in Suspense.
    text(root); h.effects.forEach(effect => effect());
    assert.equal(h.routes[0],path);
  });
}
test('actual analytics sends cohort to its opaque-origin iframe only', async () => {
  const h = harness(); h.fetch(()=>response(200,{students:[],history:{labels:[],readiness:[],interviews:[],atRisk:[]}}));
  const component = h.load(pages[4]).default;
  const tree = h.render(component); const frame = find(tree,n=>n.type==='iframe');
  assert.equal(frame.props.sandbox,'allow-scripts allow-downloads');
  const calls=[]; const frameWindow={postMessage:(payload,target)=>calls.push({payload,target})};
  frame.props.ref.current={contentWindow:frameWindow};
  h.effects.forEach(effect=>effect()); await tick();
  const wrong = new Event('message'); Object.assign(wrong,{origin:'null',source:{},data:{__pvcc:'ready'}});h.window.dispatchEvent(wrong);
  assert.equal(calls.length,0);
  const ready = new Event('message');Object.assign(ready,{origin:'null',source:frameWindow,data:{__pvcc:'ready'}});h.window.dispatchEvent(ready);
  assert.equal(calls.length,1);assert.equal(calls[0].target,'*');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].payload.payload.students)),[]);
  assert.ok(!JSON.stringify(calls).includes('original-refresh'));h.preserved();
});
test('actual drive form retains one request and payload across failed save retry', async()=>{
  const h=harness();let attempts=0;const payloads=[];
  h.fetch((url,options)=>{
    if(options.method==='POST'){payloads.push(options.body);return response(++attempts===1?503:200,{id:'created'});}
    return response(200,{items:[]});
  });
  const component=h.load(pages[6]).default;
  h.render(component);h.hooks[9]=true;h.hooks[10]='Drive';h.hooks[11]='Company';h.hooks[12]='Developer';
  let form=find(h.render(component),n=>n.type==='form');assert.ok(form);
  await form.props.onSubmit({preventDefault(){}});h.preserved();
  form=find(h.render(component),n=>n.type==='form');await form.props.onSubmit({preventDefault(){}});
  assert.equal(payloads.length,2);assert.equal(payloads[0],payloads[1]);assert.ok(JSON.parse(payloads[0]).client_request_id);
});

for (const page of [pages[0],pages[1],pages[3]]) {
  test(`actual ${page}: empty college has a neutral view`, async()=>{
    const h=harness();h.fetch(url=>response(200,String(url).includes('departments')?{departments:[]}:String(url).includes('years')?{years:[]}:String(url).includes('batches')?{batches:[]}:{students:[],total:0,total_students:0,organization:{name:'Empty College'},recent_students:[],performance_summary:{cohort_avg_score:null,students_with_sessions:0,readiness_tier_counts:{ready:0,almost_ready:0,developing:0,at_risk:0},zero_offer_risk_count:0,weakest_3_categories:[]}}));
    const component=h.load(page).default;h.render(component);h.effects.splice(0).forEach(effect=>effect());await tick();
    // Reports page requires clicking Preview to load data; trigger it if present.
    let tree=h.render(component);const preview=find(tree,n=>n.type==='button'&&text(n).includes('Preview'));
    if(preview){await preview.props.onClick();await tick();tree=h.render(component);}
    const output=text(tree);assert.match(output,/no students|no student data|not measured|no report|no students match/i);h.preserved();
  });
}
for (const [score,state,label] of [[null,'NOT_MEASURED','Not measured'],[0,'COMPLETE','Measured'],[80,'PARTIALLY_COMPLETE','Partially measured']]) {
  test(`actual college report preview retains ${label} and genuine zero`,async()=>{
    const h=harness();const row={full_name:'A Student',email:'a@example.test',student_code:'A1',status:'active',total_interviews:1,avg_score:score,best_score:score,latest_score:score,first_score:score,evaluation_state:state,measurement_label:label,measurement_coverage:{asked:3,measured:state==='COMPLETE'?3:state==='PARTIALLY_COMPLETE'?1:0,measured_pct:state==='COMPLETE'?100:state==='PARTIALLY_COMPLETE'?33.3:0},category_scores:{}};
    h.fetch(url=>response(200,String(url).includes('departments')?{departments:[]}:String(url).includes('years')?{years:[]}:String(url).includes('batches')?{batches:[]}:{students:[row],total:1}));
    const component=h.load(pages[3]).default;h.render(component);h.effects.splice(0).forEach(effect=>effect());await tick();
    // Trigger manual preview load.
    let tree=h.render(component);const preview=find(tree,n=>n.type==='button'&&text(n).includes('Preview'));
    if(preview){await preview.props.onClick();await tick();}
    const output=text(h.render(component));
    // COMPLETE state: ScoreSummary omits redundant 'Measured' label; verify score + coverage instead.
    if(state==='COMPLETE'){assert.ok(output.includes('3 / 3')&&output.includes('assessed'),output);}
    else{assert.ok(output.includes(label),output);}
    if(score===0)assert.match(output,/0\.0|0\/100/);h.preserved();
  });
}
test('actual export API sends the backend JSON and CSV contract',async()=>{
  const h=harness(),urls=[];h.fetch(url=>{urls.push(String(url));return String(url).includes('export_format=csv')?new Response('Name,Email\n',{headers:{'content-type':'text/csv'}}):response(200,{students:[]});});
  await h.api.exportCollegeReports('format=csv&department_id=department');
  const blob=await h.api.exportCollegeReportsCSV('format=json&department_id=department');
  assert.equal(await blob.text(),'Name,Email\n');
  assert.ok(urls[0].includes('export_format=json')&&!urls[0].includes('?format='));assert.ok(urls[1].includes('export_format=csv'));h.preserved();
});
test('failed membership removal keeps the student in the actual roster',async()=>{
  const h=harness();const row={id:'00000000-0000-4000-8000-000000000001',user_id:'student',full_name:'Preserved Student',email:'a@example.test',student_code:'A1',status:'active',added_at:'2026-01-01'};
  h.fetch((url,options)=>options.method==='DELETE'?response(503):response(200,String(url).includes('departments')?{departments:[]}:String(url).includes('years')?{years:[]}:String(url).includes('batches')?{batches:[]}:{students:[row],total:1}));
  const component=h.load(pages[1]).default;h.render(component);h.effects.splice(0).forEach(effect=>effect());await tick();
  let tree=h.render(component);const remove=find(tree,n=>n.type==='button'&&(text(n)==='Remove'||n.props?.title==='Remove student'));assert.ok(remove);remove.props.onClick();
  tree=h.render(component);const yes=find(tree,n=>n.type==='button'&&text(n)==='Yes');await yes.props.onClick();await tick();
  assert.ok(text(h.render(component)).includes('Preserved Student'));h.preserved();
});
