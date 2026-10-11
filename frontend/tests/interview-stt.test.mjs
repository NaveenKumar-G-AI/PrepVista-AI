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
  const hooks=[],recorders=[],sockets=[],routes=[],stops=[];
  let connect=true;
  let fetchImpl=()=>{throw new Error('Live network forbidden');};
  const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};};
  const localStorage=storage(),sessionStorage=storage();
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
    useRef:initial=>{const i=hookIndex++;return hooks[i]??(hooks[i]={current:initial});},useEffect(){},useMemo:fn=>fn()};
  const context=vm.createContext({console,process:{env:{NEXT_PUBLIC_STT_SERVER_ENABLED:String(server),NEXT_PUBLIC_API_URL:'http://test'}},
    window,localStorage,sessionStorage,Event,EventTarget,Error,TypeError,DOMException,Response,AbortController,Blob,FormData,URL,
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops.push('track')}]})}},MediaRecorder:Recorder,WebSocket:Socket,
    crypto:{randomUUID:()=>`request-${++uuid}`},setTimeout:setTimer,clearTimeout:clearTimer,
    SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},fetch:async(...args)=>withEvidenceAck(await fetchImpl(...args),...args)});
  const modules=new Map();
  const evidenceStore = createPendingEvidenceMock();
  const mocks={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    '@/lib/pending-interview-evidence':evidenceStore,'./pending-interview-evidence':evidenceStore,
    'next/link':()=>null,'next/navigation':{useParams:()=>({id:'00000000-0000-4000-8000-000000000001'}),useRouter:()=>({push:p=>routes.push(p)})},
    '@/lib/auth-context':{useAuth:()=>({user:{id:'user',full_name:'Student'},loading:false})}};
  function load(relative){
    let filename=path.resolve(root,relative);
    if (!fs.existsSync(filename) && filename.endsWith('.ts')) filename += 'x';
    if(modules.has(filename))return modules.get(filename).exports;
    if(filename.endsWith('.css'))return {default:{}};
    let source=fs.readFileSync(filename,'utf8');
    if(relative.includes('app/interview/'))source=source.replace('  const showLoading =',`  globalThis.__actions = { submitToBackend, handleConfirmEndInterview, handleManualSubmit, settleCapture, ensureRecognition,
      setCurrentTurn, setCurrentQuestionInstanceId, setBooting, transitionTo, sessionDataRef, serverSttRef, recognitionRef,
      currentTranscriptRef, accumulatedTranscriptRef, captureSpeechRef, captureFailedRef, pendingAnswerRef, uiStateRef, hardTerminate, startServerStt, startListeningLoop, currentTurnRef, assistanceInstanceRef };
      const showLoading =`);
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};modules.set(filename,mod);
    const requireLocal=name=>mocks[name]??load(name.startsWith('@/')?`src/${name.slice(2)}.ts`:path.relative(root,path.resolve(path.dirname(filename),name+(path.extname(name)?'':'.ts'))));
    vm.runInContext(`(function(require,module,exports){${output}\n})`,context,{filename})(requireLocal,mod,mod.exports);
    return mod.exports;
  }
  const api=load('src/lib/api.ts').api;
  api.acceptAnswer=async(sessionId,body)=>({action:'accepted',processing_state:'PENDING',evidence_ack:evidenceAck(sessionId,body)});
  api.setTokens('aaa.bbb.ccc','refresh');sessionStorage.setItem('draft','unsaved');localStorage.setItem('workspace','keep');
  let authEvents=0;window.addEventListener('prepvista:auth-required',()=>authEvents++);
  return {load,api,recorders,sockets,routes,timers,stops,window,context,sessionStorage,localStorage,evidenceStore,
    connectFailure:()=>{connect=false;},fetch:fn=>{fetchImpl=fn;},fire:async ms=>{for(const[id,timer]of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}await drain();},
    render:component=>{hookIndex=0;return component();},actions:()=>context.__actions,
    preserved:()=>{assert.ok(api.getToken());assert.equal(sessionStorage.getItem('draft'),'unsaved');assert.equal(localStorage.getItem('workspace'),'keep');assert.equal(authEvents,0);}};
}
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function createSession(h){return new (h.load('src/lib/serverStt.ts').ServerSttSession)({sessionId:'session',token:'user-jwt',backendUrl:'http://test',turnNumber:1,onTranscript:text=>h.transcript=text});}

for(const [result,outcome] of [
  [{transcript:'spoken answer',evidence:{audio_bytes:12}},'EVALUATED'],
  [{transcript:'',evidence:{audio_bytes:0}},'NO_ANSWER'],
  [{transcript:'partial',evidence:{failed:true}},'TRANSCRIPTION_FAILED'],
  [{transcript:'',evidence:{flush_status:'timeout'}},'TRANSCRIPTION_FAILED'],
  [{transcript:'',evidence:{audio_bytes:12}},'UNINTELLIGIBLE'],
  [{transcript:'',evidence:{speech_detected:true}},'UNINTELLIGIBLE']])test(`capture outcome ${outcome} ${JSON.stringify(result)}`,()=>{
  const h=harness();assert.equal(h.load('src/lib/interview-capture.ts').outcomeForCapture(result),outcome);
});
for(const action of ['SKIPPED','ABORTED'])test(`explicit ${action}`,()=>{const h=harness();assert.equal(h.load('src/lib/interview-capture.ts').outcomeForCapture({transcript:'',evidence:{}},action),action);});

test('stop awaits delayed final dataavailable, transmission and correlated final result',async()=>{
  const h=harness(),session=createSession(h);await session.start();let settled=false;
  const stopped=session.stop().then(result=>{settled=true;return result;});await drain();assert.equal(settled,false);assert.equal(h.sockets[0].readyState,1);
  h.recorders[0].finish('final words');await drain();assert.equal(settled,false);
  const bytes=h.sockets[0].sent.find(value=>value instanceof ArrayBuffer || Object.prototype.toString.call(value)==='[object ArrayBuffer]');
  assert.equal(new TextDecoder().decode(bytes),'final words');
  h.sockets[0].reply('last words included');const result=await stopped;
  assert.equal(result.transcript,'last words included');assert.equal(result.evidence.failed,false);assert.equal(h.sockets[0].readyState,3);
});
test('quick stop/no audio is NO_ANSWER, not an invisible turn',async()=>{
  const h=harness(),session=createSession(h);await session.start();const stopped=session.stop();await drain();h.recorders[0].finish('');
  const result=await stopped;assert.equal(result.evidence.audio_bytes,0);assert.equal(h.load('src/lib/interview-capture.ts').outcomeForCapture(result),'NO_ANSWER');
});
test('capture continues while earlier complete window is transcribed; stop drains both',async()=>{
  const h=harness(),session=createSession(h);await session.start();h.recorders[0].stop();h.recorders[0].finish('first');await drain();
  assert.equal(h.recorders.length,2);assert.equal(h.recorders[1].state,'recording');
  const stopped=session.stop();await drain();h.recorders[1].finish('last');await drain();h.sockets[0].reply('first words');await drain();h.sockets[0].reply('last words');
  const result=await stopped;assert.equal(result.transcript,'first words last words');assert.equal(result.evidence.audio_bytes,9);
});
for(const failure of ['error','socket-drop','timeout','malformed','partial'])test(`WS ${failure} invokes exactly one REST fallback`,async()=>{
  const h=harness(),session=createSession(h);let calls=0;h.fetch(async(url,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer user-jwt');assert.match(options.body.get('turn_id'),/^1-/);return response(200,{final_transcript:'REST recovered'});});
  await session.start();const stopped=session.stop();await drain();h.recorders[0].finish();await drain();
  if(failure==='error')h.sockets[0].fail();else if(failure==='socket-drop')h.sockets[0].close();else if(failure==='timeout')await h.fire(55000);
  else if(failure==='partial')h.sockets[0].reply('partial words',{transcription_status:'partial_max_buffer'});
  else h.sockets[0].reply(42);
  const result=await stopped;assert.equal(calls,1);assert.equal(result.transcript,'REST recovered');assert.equal(result.evidence.failed,false);
});
test('WS connect failure still starts recording and uses REST',async()=>{
  const h=harness(),session=createSession(h);h.fetch(async()=>response(200,{final_transcript:'fallback'}));h.connectFailure();await session.start();
  const stopped=session.stop();await drain();h.recorders[0].finish();assert.equal((await stopped).transcript,'fallback');
});
for(const failure of ['network','503','malformed','abort'])test(`both STT paths fail (${failure}) => TRANSCRIPTION_FAILED`,async()=>{
  const h=harness(),session=createSession(h);h.fetch(async(_,options)=>{
    if(failure==='network')throw new TypeError('network');if(failure==='503')return response(503,{});if(failure==='malformed')return response(200,{});
    return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));
  });
  await session.start();const stopped=session.stop();await drain();h.recorders[0].finish();await drain();h.sockets[0].fail();await drain();if(failure==='abort')await h.fire(55000);
  const result=await stopped;assert.equal(h.load('src/lib/interview-capture.ts').outcomeForCapture(result),'TRANSCRIPTION_FAILED');h.preserved();
});
test('valid empty provider result is UNINTELLIGIBLE, no fabricated words',async()=>{
  const h=harness(),session=createSession(h);await session.start();const stopped=session.stop();await drain();h.recorders[0].finish();await drain();h.sockets[0].reply('');
  const result=await stopped;assert.equal(result.transcript,'');assert.equal(h.load('src/lib/interview-capture.ts').outcomeForCapture(result),'UNINTELLIGIBLE');
});
test('missing final media event has bounded failure, and late words cannot replace terminal result',async()=>{
  const h=harness(),session=createSession(h);await session.start();const stopped=session.stop();await drain();await h.fire(65000);
  const result=await stopped;assert.equal(result.flush_status,'timeout');assert.equal(result.evidence.failed,true);
  h.recorders[0].finish('late audio');await drain();h.sockets[0].reply('late words');assert.equal(session.transcript,'');assert.equal(result.transcript,'');
});
test('late WS after fallback is ignored and cannot duplicate rolling text',async()=>{
  const h=harness(),session=createSession(h);h.fetch(async()=>response(200,{final_transcript:'fallback'}));await session.start();const stopped=session.stop();await drain();h.recorders[0].finish();await drain();h.sockets[0].fail();
  assert.equal((await stopped).transcript,'fallback');h.sockets[0].reply('WS late words');assert.equal(session.transcript,'fallback');
});
test('double stop shares the same promise and closes each microphone once',async()=>{
  const h=harness(),session=createSession(h);await session.start();const a=session.stop(),b=session.stop();assert.equal(a,b);await drain();h.recorders[0].finish();await drain();h.sockets[0].reply('answer');await a;
  assert.equal(h.stops.filter(value=>value==='track').length,1);
});

function pageHarness(server=true){
  const h=harness(server),Page=h.load('src/app/interview/[id]/page.tsx').default;
  h.render(Page);let a=h.actions();a.setBooting(false);a.setCurrentTurn(1);a.setCurrentQuestionInstanceId('00000000-0000-4000-8000-000000000002');h.render(Page);a=h.actions();
  a.currentTurnRef.current=1;a.assistanceInstanceRef.current='00000000-0000-4000-8000-000000000002';
  a.sessionDataRef.current={session_id:'00000000-0000-4000-8000-000000000001',access_token:'interview-secret'};a.transitionTo('USER_LISTENING');
  return {...h,Page,a};
}
const evidence={audio_bytes:20,speech_detected:true,failed:false,unintelligible:false,flush_status:'ok'};
const completed={action:'finish',final_score:80,report_url:'/report/session',answered_questions:1,total_questions:1,strengths:[],weaknesses:[]};
test('actual end handler freezes input, awaits flush, sends final words then finishes once',async()=>{
  const h=pageHarness(),flush=deferred();let calls=0,payload;
  h.a.serverSttRef.current={stop:()=>flush.promise};h.fetch(async(_,options)=>{calls++;payload=JSON.parse(options.body);return response(200,completed);});
  const operation=h.a.handleConfirmEndInterview();const duplicate=h.a.handleConfirmEndInterview();await drain();
  assert.equal(calls,0);assert.equal(h.a.uiStateRef.current,'TRANSCRIBING');
  flush.resolve({transcript:'Final answer words',flush_status:'ok',evidence});await operation;await duplicate;
  assert.equal(calls,1);assert.equal(payload.user_text,'Final answer words');assert.equal(payload.end_after_answer,true);assert.equal(payload.expected_turn,1);h.preserved();
});
for(const result of [{transcript:'',flush_status:'timeout',evidence:{...evidence,failed:true,flush_status:'timeout'}},
  {transcript:'',flush_status:'ok',evidence:{...evidence,audio_bytes:0,speech_detected:false}}])test(`actual empty end handler persists ${result.flush_status==='timeout'?'TRANSCRIPTION_FAILED':'NO_ANSWER'}`,async()=>{
  const h=pageHarness();let payload;h.a.serverSttRef.current={stop:async()=>result};h.fetch(async(_,options)=>{payload=JSON.parse(options.body);return response(200,completed);});
  await h.a.handleConfirmEndInterview();assert.equal(payload.terminal_outcome,result.flush_status==='timeout'?'TRANSCRIPTION_FAILED':'NO_ANSWER');assert.equal(payload.user_text,'');
});
test('actual browser stop waits for onend and uses final results instead of interim text',async()=>{
  const h=pageHarness(false);const recognition={stop(){},onend:null,onresult:null};h.a.recognitionRef.current=recognition;
  h.a.currentTranscriptRef.current='interim text';h.a.accumulatedTranscriptRef.current='';let settled=false;
  const result=h.a.settleCapture().then(value=>{settled=true;return value;});await drain();assert.equal(settled,false);
  h.a.accumulatedTranscriptRef.current='final browser words';recognition.onend();assert.equal((await result).transcript,'final browser words');
});
test('actual browser recognition journals final segments before submit and drains the last segment on stop',async()=>{
  const h=pageHarness(false);
  h.window.SpeechRecognition=class {
    start(){this.onstart?.();}
    stop(){}
  };
  await h.a.startListeningLoop();
  const recognition=h.a.recognitionRef.current;
  const segment=(text,isFinal)=>Object.assign([{transcript:text}],{isFinal});
  recognition.onresult({resultIndex:0,results:[segment('interim words',false)]});
  await drain();
  const record=[...h.evidenceStore.records.values()][0];
  assert.equal(record.transcriptSegments.length,0);
  assert.equal(record.scope.questionInstanceId,'00000000-0000-4000-8000-000000000002');
  recognition.onresult({resultIndex:0,results:[segment('Original first words',true)]});
  recognition.onresult({resultIndex:0,results:[segment('Original first words',true)]});
  await drain();
  assert.deepEqual(record.transcriptSegments.map(value=>value.text),['Original first words']);
  assert.equal(record.answer,null);
  const stopped=h.a.settleCapture();
  recognition.onresult({resultIndex:1,results:[segment('Original first words',true),segment('and final words',true)]});
  recognition.onend();
  const result=await stopped;
  assert.equal(result.transcript,'Original first words and final words');
  assert.deepEqual(record.transcriptSegments.map(value=>value.text),['Original first words','and final words']);
  assert.equal(new Set(record.transcriptSegments.map(value=>value.id)).size,2);
  assert.equal(record.answer,null);
});
test('actual recovery-storage denial blocks recording and remains unmeasured when settled',async()=>{
  const h=pageHarness(false);
  let recognitionCalls=0;
  h.window.SpeechRecognition=class { constructor(){recognitionCalls++;} };
  h.evidenceStore.ensurePendingAttempt=async()=>{throw new DOMException('Storage denied','SecurityError');};
  await h.a.startListeningLoop();
  assert.equal(recognitionCalls,0);
  assert.equal(h.a.captureFailedRef.current,true);
  const result=await h.a.settleCapture();
  assert.equal(h.load('src/lib/interview-capture.ts').outcomeForCapture(result),'TRANSCRIPTION_FAILED');
  assert.equal(result.transcript,'');
});
test('actual UI hides input/finish actions while transcribing and shows finalizing',async()=>{
  const h=pageHarness(),flush=deferred();h.a.serverSttRef.current={stop:()=>flush.promise};const request=deferred();h.fetch(()=>request.promise);
  const operation=h.a.handleConfirmEndInterview();await drain();
  const tree=h.render(h.Page),strings=JSON.stringify(tree);assert.ok(!strings.includes('"children":"End Interview"'));assert.ok(strings.includes('Completing transcription'));
  flush.resolve({transcript:'answer',flush_status:'ok',evidence});await drain();assert.equal(h.a.uiStateRef.current,'FINALIZING');
  request.resolve(response(200,completed));await operation;
});
test('actual manual skip persists SKIPPED and concurrent manual click cannot submit twice',async()=>{
  const h=pageHarness(),flush=deferred();let calls=0,payload;h.a.serverSttRef.current={stop:()=>flush.promise};h.fetch(async(_,options)=>{calls++;payload=JSON.parse(options.body);return response(200,completed);});
  const operation=h.a.submitToBackend('',undefined,0,false,'SKIPPED');h.a.handleManualSubmit();await drain();assert.equal(calls,0);
  flush.resolve({transcript:'',flush_status:'ok',evidence});await operation;assert.equal(calls,1);assert.equal(payload.terminal_outcome,'SKIPPED');
});
test('actual temporary end API failure retains captured answer, request ID, session and drafts for retry',async()=>{
  const h=pageHarness();h.a.serverSttRef.current={stop:async()=>({transcript:'saved words',flush_status:'ok',evidence})};h.fetch(async()=>response(503,{detail:'temporarily unavailable'}));
  await h.a.handleConfirmEndInterview();await drain();assert.equal(h.routes.length,0);assert.equal(h.a.pendingAnswerRef.current.text,'saved words');assert.equal(h.a.pendingAnswerRef.current.terminal.end_after_answer,true);h.preserved();
});

test('actual page starts STT with authenticated JWT, not interview secret, and ends through real media settlement',async()=>{
  const h=pageHarness();let payload;h.fetch(async(_,options)=>{payload=JSON.parse(options.body);return response(200,completed);});
  h.a.startServerStt();await drain();assert.equal(new URL(h.sockets[0].url).searchParams.get('token'),'aaa.bbb.ccc');
  const ending=h.a.handleConfirmEndInterview();await drain();assert.equal(payload,undefined);h.recorders[0].finish('final audio');await drain();h.sockets[0].reply('actual final spoken words',{raw_transcript:'  actual  original words\n'});await ending;
  assert.equal(payload.user_text,'actual final spoken words');assert.equal(payload.capture_evidence.failed,false);
  assert.equal(payload.capture_evidence.audio_windows[0].transcript,'actual final spoken words');
  assert.equal(payload.capture_evidence.audio_windows[0].raw_transcript,'  actual  original words\n');
});
test('actual normal submit freezes capture before posting and preserves final question identity',async()=>{
  const h=pageHarness(),flush=deferred();let payload;h.a.serverSttRef.current={stop:()=>flush.promise};h.fetch(async(_,options)=>{payload=JSON.parse(options.body);return response(200,completed);});
  const submitting=h.a.submitToBackend('old partial text');await drain();assert.equal(payload,undefined);
  flush.resolve({transcript:'Final complete answer',flush_status:'ok',evidence});await submitting;
  assert.equal(payload.user_text,'Final complete answer');assert.equal(payload.question_instance_id,'00000000-0000-4000-8000-000000000002');assert.equal(payload.end_after_answer,false);
});
test('actual browser final-media deadline becomes TRANSCRIPTION_FAILED',async()=>{
  const h=pageHarness(false);h.a.recognitionRef.current={stop(){}};const operation=h.a.settleCapture();await drain();await h.fire(5000);
  const result=await operation;assert.equal(h.load('src/lib/interview-capture.ts').outcomeForCapture(result),'TRANSCRIPTION_FAILED');
});
test('actual abort settles capture and persists captured transcript before termination',async()=>{
  const h=pageHarness(),flush=deferred();let payload;h.a.serverSttRef.current={stop:()=>flush.promise};h.fetch(async(_,options)=>{payload=JSON.parse(options.body);return response(200,{...completed,action:'terminated'});});
  const operation=h.a.hardTerminate('explicit abort');await drain();assert.equal(payload,undefined);
  flush.resolve({transcript:'Words before abort',flush_status:'ok',evidence});await operation;
  assert.equal(payload.user_text,'Words before abort');assert.equal(payload.reason,'explicit abort');
});
test('actual abort outage preserves the session and exposes retry instead of claiming closure',async()=>{
  const h=pageHarness();h.a.serverSttRef.current={stop:async()=>({transcript:'saved words',flush_status:'ok',evidence})};h.sessionStorage.setItem('pv_interview_session_session','keep');
  h.fetch(async()=>response(503,{}));await h.a.hardTerminate('explicit abort');assert.equal(h.a.uiStateRef.current,'FINALIZING');
  assert.ok(JSON.stringify(h.render(h.Page)).includes('Retry session closure'));assert.equal(h.routes.length,0);h.preserved();
});
test('session closure retry reuses accepted original evidence after the first termination request fails',async()=>{
  const h=pageHarness(),accepted=[],closures=[];
  h.a.serverSttRef.current={stop:async()=>({transcript:'Original words before closure',flush_status:'ok',evidence})};
  h.api.acceptAnswer=async(sessionId,body)=>{accepted.push(body);return {action:'accepted',processing_state:'PENDING',evidence_ack:evidenceAck(sessionId,body)};};
  h.fetch(async(_,options)=>{closures.push(JSON.parse(options.body));return response(closures.length===1?503:200,{...completed,action:'terminated'});});
  await h.a.hardTerminate('explicit abort');
  assert.equal(accepted.length,1);assert.equal(closures.length,1);
  const find=node=>{
    if(Array.isArray(node))return node.map(find).find(Boolean);
    if(!node || typeof node!=='object')return null;
    if(node.type==='button' && node.props.children==='Retry session closure')return node;
    return find(node.props?.children);
  };
  const button=find(h.render(h.Page));assert.ok(button);button.props.onClick();
  for(let i=0;i<5;i++)await drain();
  assert.equal(accepted.length,1);assert.equal(closures.length,2);
  assert.equal(closures[1].user_text,'Original words before closure');
  assert.deepEqual(closures[1].capture_evidence,closures[0].capture_evidence);
  assert.equal(closures[1].question_instance_id,closures[0].question_instance_id);
  assert.equal(h.routes.length,1);h.preserved();
});
for (const boundary of ['acceptance', 'termination']) test(`scheduled answer retry cannot race session ${boundary}`,async()=>{
  const h=pageHarness(),accept=deferred(),terminate=deferred(),answers=[],closures=[];
  h.a.serverSttRef.current={stop:async()=>({transcript:'Original answer before closure',flush_status:'ok',evidence})};
  h.fetch(async(url,options)=>{
    const body=JSON.parse(options.body);
    if(url.endsWith('/answer')){answers.push(body);return response(503,{});}
    assert.ok(url.endsWith('/terminate'));closures.push(body);return terminate.promise;
  });
  await h.a.submitToBackend('Original answer before closure');
  assert.equal(answers.length,1);
  const retry=[...h.timers].find(([,timer])=>timer.ms>=500 && timer.ms<800);
  assert.ok(retry,'the failed answer schedules an actual retry callback');
  h.api.acceptAnswer=async(sessionId,body)=>{
    await accept.promise;
    return {action:'accepted',processing_state:'PENDING',evidence_ack:evidenceAck(sessionId,body)};
  };
  const closing=h.a.hardTerminate('explicit abort');await drain();
  if(boundary==='termination'){accept.resolve();await drain();assert.equal(closures.length,1);}
  else assert.equal(closures.length,0);
  h.timers.delete(retry[0]);retry[1].fn();await drain();
  assert.equal(answers.length,1,'queued answer retry must not submit during session closure');
  if(boundary==='acceptance'){accept.resolve();await drain();}
  assert.equal(closures.length,1);
  assert.equal(closures[0].user_text,answers[0].user_text);
  terminate.resolve(response(200,{...completed,action:'terminated'}));await closing;
  assert.equal(h.routes.length,1);h.preserved();
});
test('actual saved final-answer retry reuses the same request ID, transcript and expected turn',async()=>{
  const h=pageHarness();h.a.serverSttRef.current={stop:async()=>({transcript:'saved words',flush_status:'ok',evidence})};const payloads=[];
  h.fetch(async(_,options)=>{payloads.push(JSON.parse(options.body));return response(payloads.length===1?503:200,payloads.length===1?{}:completed);});
  await h.a.handleConfirmEndInterview();const retry=[...h.timers].find(([,t])=>t.ms>=500 && t.ms<800);assert.ok(retry);h.timers.delete(retry[0]);retry[1].fn();await drain();
  assert.equal(payloads.length,2);assert.deepEqual(payloads[0],payloads[1]);assert.equal(h.a.pendingAnswerRef.current,null);h.preserved();
});
for(const ackFailure of ['missing','wrong-question','wrong-request'])test(`actual answer 2xx with ${ackFailure} durable ACK retains original evidence`,async()=>{
  const h=pageHarness();h.a.serverSttRef.current={stop:async()=>({transcript:'Original candidate words',flush_status:'ok',evidence})};
  h.fetch(async(url,options)=>{
    const request=JSON.parse(options.body);
    const ack=evidenceAck('00000000-0000-4000-8000-000000000001',request);
    if(ackFailure==='wrong-question')ack.question_instance_id='another-question';
    if(ackFailure==='wrong-request')ack.client_request_id='another-request';
    return response(200,{...completed,evidence_ack:ackFailure==='missing'?null:ack});
  });
  await h.a.handleConfirmEndInterview();
  assert.equal(h.a.pendingAnswerRef.current.text,'Original candidate words');
  assert.equal(h.evidenceStore.records.size,1);assert.equal(h.routes.length,0);h.preserved();
});
