import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createPendingEvidenceMock, evidenceAck, withEvidenceAck } from './pending-evidence-mock.mjs';
const root = path.resolve(import.meta.dirname, '..');
const drain = async () => { for (let i=0;i<25;i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };
function harness(server=true) {
  const timers=new Map(); let timerId=0,hookIndex=0,uuid=0;
  const hooks=[],recorders=[],sockets=[],routes=[],stops=[],effects=[]; const effectDeps=new Map();
  let connect=true;
  let fetchImpl=()=>{throw new Error('Live network forbidden');};
  const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};};
  const localStorage=storage(),sessionStorage=storage();
  sessionStorage.setItem('pv_interview_session', JSON.stringify({session_id:'00000000-0000-4000-8000-000000000001',access_token:'secret'}));
  const window=new EventTarget();
  const setTimer=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;};
  const clearTimer=id=>timers.delete(id);
  Object.assign(window,{setTimeout:setTimer,clearTimeout:clearTimer,setInterval:()=>0,clearInterval(){},
    location:{pathname:'/interview/test',origin:'http://test'},speechSynthesis:{cancel(){},getVoices:()=>[],speak:utterance=>queueMicrotask(()=>utterance.onend?.())}});
  class Recorder {
    static isTypeSupported(){return true;}
    constructor(){recorders.push(this);this.state='inactive';}
    start(){this.state='recording';}
    stop(){this.state='inactive';stops.push(this);}
    finish(bytes='last words audio'){this.ondataavailable?.({data:new Blob([bytes])});this.onstop?.();}
  }
  class Socket {
    static OPEN=1;
    constructor(url){this.url=url;sockets.push(this);this.readyState=1;this.sent=[];queueMicrotask(()=>connect ? this.onopen?.() : this.onerror?.());}
    send(value){this.sent.push(value);if(typeof value==='string'){const frame=JSON.parse(value);if(frame.type==='turn_start')this.turn=frame.turn_id;}}
    reply(text,extra={}){this.onmessage?.({data:JSON.stringify({type:'final',turn_id:this.turn,final_transcript:text,...extra})});}
    fail(){this.onmessage?.({data:JSON.stringify({type:'error',turn_id:this.turn,message:'internal provider error'})});}
    close(){this.readyState=3;this.onclose?.();}
  }
  window.WebSocket=Socket;
  const react={useState:initial=>{const i=hookIndex++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],v=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];},
    useRef:initial=>{const i=hookIndex++;return hooks[i]??(hooks[i]={current:initial});},useEffect(fn,deps){const i=hookIndex++;const old=effectDeps.get(i);
      if(!old || deps?.some((value,j)=>value!==old[j])){effectDeps.set(i,deps);effects.push(fn);}},useMemo:fn=>fn()};
  const context=vm.createContext({console,process:{env:{NEXT_PUBLIC_STT_SERVER_ENABLED:String(server),NEXT_PUBLIC_API_URL:'http://test'}},
    window,document:new EventTarget(),localStorage,sessionStorage,Event,EventTarget,Error,TypeError,DOMException,Response,AbortController,Blob,FormData,URL,
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops.push('track')}]})}},MediaRecorder:Recorder,WebSocket:Socket,
    crypto:{randomUUID:()=>`request-${++uuid}`},setTimeout:setTimer,clearTimeout:clearTimer,
    SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},fetch:async(...args)=>withEvidenceAck(await fetchImpl(...args),...args)});
  const modules=new Map();
  const evidenceStore = createPendingEvidenceMock();
  const router={push:p=>routes.push(p),replace:p=>routes.push(p)};
  const mocks={'@/components/auth-header':{AuthHeader:()=>null},react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    '@/lib/pending-interview-evidence':evidenceStore,'./pending-interview-evidence':evidenceStore,
    'next/link':()=>null,'next/navigation':{useParams:()=>({id:'00000000-0000-4000-8000-000000000001'}),useRouter:()=>router},
    '@/lib/auth-context':{useAuth:()=>({user:{id:'user',full_name:'Student',plan:'free',usage:{plan:'free',used:0,limit:5,remaining:5}},loading:false})}};
  function load(relative){
    let filename=path.resolve(root,relative);
    if (!fs.existsSync(filename) && filename.endsWith('.ts')) filename += 'x';
    if(modules.has(filename))return modules.get(filename).exports;
    if(filename.endsWith('.css'))return {default:{}};
    let source=fs.readFileSync(filename,'utf8');
    if(relative.includes('app/interview/setup/'))source=source.replace('  if (authLoading || !user)', '  globalThis.__setup = {handleSubmit,setFile,setGuidedAssistance,guidedAssistance};\n  if (authLoading || !user)');
    if(relative.includes('app/interview/'))source=source.replace('  const showLoading =',`  globalThis.__actions = { submitToBackend, handleConfirmEndInterview, handleManualSubmit, settleCapture, ensureRecognition,
      setCurrentTurn, setCurrentQuestionInstanceId, setBooting, transitionTo, sessionDataRef, serverSttRef, recognitionRef,
      currentTranscriptRef, accumulatedTranscriptRef, captureSpeechRef, captureFailedRef, pendingAnswerRef, uiStateRef, hardTerminate, startServerStt,
      handleAskMeAgain,setSessionData,setAssistancePanelOpen,assistanceInstanceRef,
      assistanceViewsRef,assistanceStatus,assistanceError,displayedAssistance,acknowledgeDisplayedAssistance,pendingRetryRef,currentTurnRef };
      const showLoading =`);
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};modules.set(filename,mod);
    const requireLocal=name=>mocks[name]??load(name.startsWith('@/')?`src/${name.slice(2)}.ts`:path.relative(root,path.resolve(path.dirname(filename),name+(path.extname(name)?'':'.ts'))));
    vm.runInContext(`(function(require,module,exports){${output}\n})`,context,{filename})(requireLocal,mod,mod.exports);
    return mod.exports;
  }
  const api=load('src/lib/api.ts').api;
  api.acceptAnswer=async(sessionId,body)=>({action:'accepted',processing_state:'PENDING',evidence_ack:evidenceAck(sessionId,body)});
  // Individual assistance tests begin with an already-restored active question.
  // Keep the unrelated initial restore pending; restore cases supply its response.
  api.getInterviewSession=()=>new Promise(()=>{});
  api.setTokens('aaa.bbb.ccc','refresh');sessionStorage.setItem('draft','unsaved');localStorage.setItem('workspace','keep');
  let authEvents=0;window.addEventListener('prepvista:auth-required',()=>authEvents++);
  return {load,api,recorders,sockets,routes,timers,stops,window,context,sessionStorage,localStorage,
    connectFailure:()=>{connect=false;},fetch:fn=>{fetchImpl=fn;},fire:async ms=>{for(const[id,timer]of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}await drain();},
    render:component=>{hookIndex=0;const node=component();for(const fn of effects.splice(0))fn();return node;},actions:()=>context.__actions,
    preserved:()=>{assert.ok(api.getToken());assert.equal(sessionStorage.getItem('draft'),'unsaved');assert.equal(localStorage.getItem('workspace'),'keep');assert.equal(authEvents,0);}};
}
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});

function text(node){if(node==null || typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join(' ');
  if(typeof node==='object')return typeof node.type==='function'?text(node.type(node.props)):text(node.props?.children);return String(node);}
function findButton(node, label) {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map(child => findButton(child, label)).find(Boolean) || null;
  if (node.type === 'button' && node.props['aria-label'] === label) return node;
  return findButton(node.props?.children, label);
}
const assistanceLabels = {hint: 'Get Hint', guided_approach: 'Guided Approach', answer_guidance: 'Sample Answer'};
function pageHarness(enabled=true){
  const h=harness(true),Page=h.load('src/app/interview/[id]/page.tsx').default;
  h.render(Page);let a=h.actions();a.setBooting(false);a.setCurrentTurn(1);a.setCurrentQuestionInstanceId('instance-1');
  a.currentTurnRef.current=1;
  a.setSessionData({session_id:'00000000-0000-4000-8000-000000000001',access_token:'interview-secret',assistance_enabled:enabled});a.transitionTo('USER_LISTENING');
  h.render(Page);h.render(Page);a=h.actions();
  a.serverSttRef.current={stop:async()=>({transcript:'My real captured answer',evidence:{audio_bytes:42},flush_status:'ok'})};
  return {...h,Page,a,refresh(){h.render(Page);this.a=h.actions();return this.a;},
    request(kind){const button=findButton(h.render(Page),assistanceLabels[kind]);return button && !button.props.disabled ? button.props.onClick() : Promise.resolve();}};
}
const finished={action:'finish',final_score:80,report_url:'/report/session',answered_questions:1,total_questions:1,strengths:[],weaknesses:[]};
for(const kind of ['hint','guided_approach','answer_guidance'])test(`actual page default OFF blocks ${kind}`,async()=>{
  const h=pageHarness(false);let calls=0;h.fetch(async()=>{calls++;return response(200,{});});
  await (h.request(kind));assert.equal(calls,0);assert.equal(h.a.displayedAssistance,null);h.preserved();
});
for(const kind of ['hint','guided_approach','answer_guidance'])test(`actual ${kind} duplicate click generates once, view only after render`,async()=>{
  const h=pageHarness();const wait=deferred();let generated=0,viewed=0,key;
  h.fetch(async(url,options)=>{if(url.endsWith('/viewed')){viewed++;return response(200,{status:'ok'});}generated++; key=JSON.parse(options.body).client_request_id;await wait.promise;return response(200,{content:'Valid provider content',event_id:'event',level:1,why_it_works:['Reason']});});
  const operation=h.request(kind);await drain();
  await (h.request(kind));assert.equal(generated,1);assert.equal(viewed,0);
  wait.resolve();await operation;assert.equal(viewed,0);assert.match(key,/instance-1/);
  const rendered=h.render(h.Page);assert.match(text(rendered), /Valid provider content/);
  await drain();h.refresh();assert.equal(viewed,1);assert.equal(h.a.assistanceStatus,kind==='answer_guidance'?'answer_guided':'hint_assisted');h.preserved();
});
for(const kind of ['hint','guided_approach','answer_guidance'])test(`generated ${kind} in collapsed panel is not viewed`,async()=>{
  const h=pageHarness(),wait=deferred();let views=0;h.fetch(async url=>{if(url.endsWith('/viewed')){views++;return response(200,{});}await wait.promise;return response(200,{content:'Guidance',event_id:'event',level:1});});
  const operation=h.request(kind);h.a.setAssistancePanelOpen(false);h.refresh();wait.resolve();await operation;h.refresh();await drain();assert.equal(views,0);
  h.a.setAssistancePanelOpen(true);h.refresh();await drain();assert.equal(views,1);
});
for(const failure of ['503','network','malformed'])for(const kind of ['hint','guided_approach','answer_guidance'])test(`actual ${kind} ${failure} has no fake guidance or view`,async()=>{
  const h=pageHarness();let views=0;h.fetch(async url=>{if(url.endsWith('/viewed'))views++;if(failure==='network')throw new TypeError('Network');return response(failure==='503'?503:200,{});});
  await (h.request(kind));h.refresh();assert.equal(views,0);assert.equal(h.a.displayedAssistance,null);
  assert.equal(h.a.assistanceStatus,'independent');assert.match(h.a.assistanceError,/temporarily unavailable/);
  h.fetch(async()=>response(200,finished));await h.a.handleManualSubmit();h.preserved();
});
for(const kind of ['hint','guided_approach','answer_guidance'])test(`late ${kind} response cannot affect new instance`,async()=>{
  const h=pageHarness(),wait=deferred();let views=0;h.fetch(async url=>{if(url.endsWith('/viewed')){views++;return response(200,{});}await wait.promise;return response(200,{content:'Old content',event_id:'old',level:1});});
  const operation=h.request(kind);h.a.setCurrentQuestionInstanceId('instance-2');h.a.setCurrentTurn(2);h.refresh();wait.resolve();await operation;h.refresh();await drain();
  assert.equal(h.a.displayedAssistance,null);assert.equal(views,0);
});
test('visible view acknowledgement completes before actual answer transmission',async()=>{
  const h=pageHarness(),ack=deferred();let answers=0;
  h.fetch(async url=>{if(url.endsWith('/viewed')){await ack.promise;return response(200,{});}if(url.endsWith('/answer')){answers++;return response(200,finished);}return response(200,{content:'Valid hint',event_id:'hint',level:1});});
  await h.request('hint');h.refresh();await drain();const answer=h.a.submitToBackend('', 'answer');await drain();assert.equal(answers,0);
  ack.resolve();await answer;assert.equal(answers,1);h.preserved();
});
test('view failure preserves answer and request ID, retry saves view then answer',async()=>{
  const h=pageHarness();let fail=true,answers=0,views=0;
  h.fetch(async url=>{if(url.endsWith('/viewed')){views++;return response(fail?503:200,{});}if(url.endsWith('/answer')){answers++;return response(200,finished);}return response(200,{content:'Valid hint',event_id:'hint',level:1});});
  await h.request('hint');h.refresh();await drain();h.refresh();assert.equal(h.a.assistanceStatus,'unknown');assert.match(h.a.assistanceError,/could not be saved/);
  await h.a.submitToBackend('', 'answer');assert.equal(answers,0);const saved=h.a.pendingAnswerRef.current;assert.ok(saved);h.preserved();
  fail=false;await h.a.submitToBackend(saved.text,saved.key,3);assert.equal(answers,1);assert.ok(views>=3);h.preserved();
});
test('acknowledged answer guidance takes precedence after a later viewed hint',async()=>{
  const h=pageHarness();h.fetch(async url=>response(200,url.endsWith('/viewed')?{}:{content:'Provider content',event_id:url.endsWith('/hint')?'hint':'guidance',level:1}));
  await h.request('answer_guidance');h.refresh();await drain();h.refresh();assert.equal(h.a.assistanceStatus,'answer_guided');
  await h.request('hint');h.refresh();await drain();h.refresh();assert.equal(h.a.assistanceStatus,'answer_guided');
});
for(const kind of ['hint','guided_approach','answer_guidance'])test(`pending ${kind} arriving during submission is not viewed`,async()=>{
  const h=pageHarness(),wait=deferred();let views=0;h.fetch(async url=>{if(url.endsWith('/viewed')){views++;return response(200,{});}if(url.endsWith('/answer'))return response(200,finished);await wait.promise;return response(200,{content:'late guidance',event_id:'event',level:1});});
  const generation=h.request(kind);await h.a.handleManualSubmit();wait.resolve();await generation;h.refresh();await drain();assert.equal(views,0);
});
test('actual Ask Me Again creates new instance and uses separate retry endpoint',async()=>{
  const h=pageHarness(false);let payload,calls=0;h.fetch(async(url,options)=>{calls++;assert.ok(url.endsWith('/retry-question'));payload=JSON.parse(options.body);return response(200,{question:'Same original question',turn:2,max_turns:5,question_instance_id:'retry-instance'});});
  const a=h.a.handleAskMeAgain(),b=h.a.handleAskMeAgain();await a;await b;h.refresh();
  assert.equal(calls,1);assert.equal(payload.active_question_instance_id,'instance-1');assert.equal(payload.question_instance_id,'instance-1');
  assert.equal(payload.captured_text,'My real captured answer');assert.equal(h.a.assistanceInstanceRef.current,'retry-instance');h.preserved();
});
test('Ask Me Again awaits viewed assistance acknowledgement before freezing accepted evidence',async()=>{
  const h=pageHarness(),ack=deferred(),order=[];
  h.api.acceptAnswer=async(sessionId,body)=>{
    order.push('accepted');
    return {action:'accepted',processing_state:'PENDING',evidence_ack:evidenceAck(sessionId,body)};
  };
  h.fetch(async url=>{
    if(url.endsWith('/viewed')){await ack.promise;order.push('viewed');return response(200,{});}
    if(url.endsWith('/retry-question')){order.push('retry');return response(200,{question:'Same original question',turn:2,max_turns:5,question_instance_id:'retry-instance'});}
    return response(200,{content:'Valid hint',event_id:'hint',level:1});
  });
  await h.request('hint');h.refresh();await drain();
  const repeat=h.a.handleAskMeAgain();await drain();
  assert.deepEqual(order,[]);
  ack.resolve();await repeat;
  assert.deepEqual(order,['viewed','accepted','retry']);h.preserved();
});
test('failed Ask Me Again retains stable retry request and capture',async()=>{
  const h=pageHarness();const payloads=[];let fail=true;h.fetch(async(_,options)=>{payloads.push(JSON.parse(options.body));return response(fail?503:200,{question:'Original question',turn:2,max_turns:5,question_instance_id:'new'});});
  await h.a.handleAskMeAgain();assert.ok(h.a.pendingRetryRef.current);fail=false;await h.a.handleAskMeAgain();assert.equal(payloads.length,2);assert.deepEqual(payloads[0],payloads[1]);h.preserved();
});
for(const [value,label]of [['independent','Independent Attempt'],['hint_assisted','Hint Assisted'],['answer_guided','Answer Guided'],['unknown','Unknown'],[null,'Unknown']])test(`actual label ${value}`,()=>{
  const h=harness();assert.equal(h.load('src/lib/assistance-views.ts').provenanceLabel(value),label);
});

function reportHarness(states = []) {
  let index = 0;
  const cache = new Map();
  const context = vm.createContext({ console, Date, JSON, Math });
  const jsx = (type, props) => ({ type, props });
  const empty = () => null;
  const mocks = {
    react: { useState: value => [index < states.length ? states[index++] : value, empty],
      useEffect: empty, useCallback: fn => fn, useRef: value => ({ current: value }), useMemo: fn => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': { default: ({ children }) => children },
    'next/navigation': { useRouter: () => ({ push: empty, replace: empty }), useParams: () => ({ id: 'session' }) },
    '@/lib/auth-context': { useAuth: () => ({ user: { org_student: true, plan: 'career', usage: { used: 1, limit: 20, remaining: 19 } }, loading: false }) },
    '@/lib/api': { api: new Proxy({}, { get: () => () => { throw Error('Unmocked network'); } }) },
    '@/lib/plan-usage': { getStartInterviewHref: () => '/interview/setup', hasRemainingUsage: () => true, isUnlimitedUsage: () => false },
    './_intel/dashboard': { IntelDashboard: empty },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    function requireLocal(name) {
      if (name in mocks) return mocks[name];
      if (name === '@/components/score-summary' || name === '@/lib/score-semantics' || name === '@/lib/assistance-views') {
        return load(`src/${name.slice(2)}.${name.includes('components') ? 'tsx' : 'ts'}`);
      }
      // Unrelated visual components are inert; page and score rendering stay real.
      if (name.includes('components') || name === 'lucide-react') return new Proxy({}, { get: () => empty });
      throw Error(`Unmocked import ${name}`);
    }
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(requireLocal, mod, mod.exports);
    return mod.exports;
  }
  return { load };
}

for(const [value,label]of [['independent','Independent Attempt'],['hint_assisted','Hint Assisted'],['answer_guided','Answer Guided'],['unknown','Unknown'],[null,'Unknown']])test(`actual owner report displays ${label} with disabled/missing policy`,()=>{
  const report={session:{id:'session',plan:'career',final_score:80,evaluation_state:'COMPLETE',total_turns:1,created_at:'2026-10-04',strengths:[],weaknesses:[],rubric_scores:{}},
    evaluations:[{turn_number:1,score:8,classification:'strong',question_text:'A real question',raw_answer:'A real answer',assistance_provenance:value}],user_plan:'career',has_premium_access:false,assistance_summary:{enabled:false}};
  const h=reportHarness([report,false,'',false,false,'','']);const output=text(h.load('src/app/report/[id]/page.tsx').default());
  assert.ok(output.includes(label),output);assert.ok(!output.includes('mastery'));assert.ok(!output.includes('Hint Used'));
});
test('actual setup toggle starts OFF and creates no generation request',()=>{
  const h=harness();let requests=0;h.fetch(async()=>{requests++;throw Error('No render request permitted');});
  const Page=h.load('src/app/interview/setup/page.tsx').default;const output=text(h.render(Page));
  assert.match(output,/OFF.+independent attempt interview/);assert.equal(requests,0);
});

for(const enabled of [false,true])test(`actual setup posts opt-in ${enabled} and trusts returned policy`,async()=>{
  const h=harness();const Page=h.load('src/app/interview/setup/page.tsx').default;h.render(Page);
  h.context.__setup.setFile(new Blob(['%PDF'],{type:'application/pdf'}));h.context.__setup.setGuidedAssistance(enabled);h.render(Page);let requested;
  h.fetch(async(_,options)=>{requested=options.body.get('guided_assistance');return response(200,{session_id:'session',access_token:'secret',assistance_enabled:false});});
  await h.context.__setup.handleSubmit({preventDefault(){}});
  assert.equal(requested,String(enabled));assert.equal(JSON.parse(h.sessionStorage.getItem('pv_interview_session')).assistance_enabled,false);
});

for (const kind of ['hint', 'guided_approach', 'answer_guidance']) test(`opening ${kind} preserves the live recorder, socket, timer and captured chunks`, async () => {
  const h = pageHarness();
  h.a.serverSttRef.current = null;
  h.a.startServerStt();
  await drain();
  const recorder = h.recorders[0], socket = h.sockets[0];
  recorder.ondataavailable({data: new Blob(['before-guidance'])});
  const captureTimers = [...h.timers.keys()];
  let answers = 0;
  h.fetch(async url => {
    if (url.endsWith('/answer')) answers++;
    return response(200, url.endsWith('/viewed') ? {} : {content: 'Useful guidance', event_id: kind, level: 1});
  });
  await h.request(kind);
  h.refresh(); await drain(); h.refresh();
  assert.equal(h.recorders.length, 1);
  assert.equal(recorder.state, 'recording');
  assert.equal(h.sockets[0], socket);
  assert.equal(socket.readyState, 1);
  assert.equal(h.stops.length, 0);
  assert.equal(answers, 0);
  assert.equal(h.a.uiStateRef.current, 'USER_LISTENING');
  assert.ok(captureTimers.every(id => h.timers.has(id)));
  const stopped = h.a.serverSttRef.current.stop();
  await drain(); recorder.finish('after-guidance'); await drain();
  const bytes = socket.sent.find(value => Object.prototype.toString.call(value) === '[object ArrayBuffer]');
  assert.equal(new TextDecoder().decode(bytes), 'before-guidanceafter-guidance');
  socket.reply('Complete answer before and after guidance');
  assert.equal((await stopped).transcript, 'Complete answer before and after guidance');
});

for (const [provenance, expected] of [['independent', 'Hint Assisted'], ['hint_assisted', 'Hint Assisted'], ['answer_guided', 'Answer Guided'], [null, 'Unknown']]) test(`restored ${provenance} stays truthful after viewing a hint on the saved question`, async () => {
  const h = harness();
  const session = {session_id: '00000000-0000-4000-8000-000000000001', access_token: 'saved-secret', assistance_enabled: true,
    state: 'ACTIVE', plan: 'free', turn: 3, max_turns: 5, question_instance_id: 'saved-question-3', current_question_text: 'Saved third question',
    current_assistance_provenance: provenance};
  h.api.getInterviewSession = async () => session;
  const Page = h.load('src/app/interview/[id]/page.tsx').default;
  h.render(Page); await drain(); h.render(Page);
  h.actions().transitionTo('USER_LISTENING');
  h.render(Page);
  let generated;
  h.fetch(async (url, options) => {
    if (url.endsWith('/viewed')) return response(200, {});
    generated = JSON.parse(options.body);
    return response(200, {content: 'Restored question hint', event_id: 'hint-after-restore', level: 1});
  });
  const button = findButton(h.render(Page), 'Get Hint');
  assert.ok(button);
  await button.props.onClick();
  h.render(Page); await drain();
  assert.equal(generated.question_instance_id, 'saved-question-3');
  assert.match(text(h.render(Page)), new RegExp(expected));
  assert.match(text(h.render(Page)), /Saved third question/);
  assert.equal(JSON.parse(h.sessionStorage.getItem('pv_interview_session')).plan, 'free');
});
