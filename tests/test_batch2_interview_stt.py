"""Offline actual answer/orchestration/finalization SQL and provider regressions.
SQLite adapts only PostgreSQL locking/casts, with a transaction/row-lock model.
No external connection is available in this suite.
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import timedelta
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException
from test_batch0_history_safety import StoredHistory, NOW, OWNER, user
from app.services import interviewer, interviewer_session as sessions, analytics, plan_access, stt_service as stt
from app.services.interview_terminal import classify, register_question, terminalize, terminal_records
from app.routers import interviews_answer as answers, interviews_helpers as helpers, interviews_session as session_routes, reports, stt_ws


class InterviewStore(StoredHistory):
    def __init__(self):
        super().__init__()
        self.lock = asyncio.Lock()
        self.db.execute("ALTER TABLE conversation_messages ADD COLUMN id INTEGER")
        for column, kind in {"difficulty_mode":"TEXT", "resume_text":"TEXT", "silence_count":"INT", "consecutive_followups":"INT",
                             "skip_topics":"TEXT", "active_question_signature":"TEXT", "active_question_turn":"INT", "question_retry_count":"INT",
                             "last_answer_status":"TEXT", "last_client_request_id":"TEXT", "last_client_response":"TEXT", "termination_reason":"TEXT"}.items():
            existing = {row[1] for row in self.db.execute("PRAGMA table_info(interview_sessions)")}
            if column not in existing:
                self.db.execute(f"ALTER TABLE interview_sessions ADD COLUMN {column} {kind}")
        self.db.execute("CREATE UNIQUE INDEX evaluations_turn ON question_evaluations(session_id,turn_number)")
        # Enforce the authentic NOT NULL / allowed rubric/classification contract.
        self.db.execute("""CREATE TRIGGER evaluation_contract BEFORE INSERT ON question_evaluations
            WHEN NEW.score IS NULL OR NEW.rubric_category NOT IN ('communication','technical_depth','problem_solving','confidence','structure_star','vocabulary','vocal_delivery','leadership','teamwork','adaptability','reasoning','conciseness','professionalism','role_fit')
              OR NEW.classification NOT IN ('strong','partial','vague','wrong','silent')
            BEGIN SELECT RAISE(ABORT,'invalid evaluation contract'); END""")
        self.session = str(uuid4())
        self.add_session(self.session, NOW, state="ACTIVE")
        self.db.execute("""UPDATE interview_sessions SET access_token=?, difficulty_mode='auto', resume_text='A Python engineering student', silence_count=0,
                         consecutive_followups=0, skip_topics='[]', question_retry_count=0,
                         runtime_state=?, question_plan=? WHERE id=?""",
                        ('a'*40, json.dumps({"terminal_contract_version":1,"question_records":{}}),
                         json.dumps([{"turn":n,"category":"communication","question":"Tell me about your work"} for n in range(1,4)]), self.session))

    def run(self, sql, args):
        return super().run(sql.replace(" FOR UPDATE", "").replace("::jsonb", ""), args)

    @asynccontextmanager
    async def transaction(self):
        async with self.lock:
            self.db.execute("SAVEPOINT interview_operation")
            try:
                yield
            except BaseException:
                self.db.execute("ROLLBACK TO interview_operation")
                raise
            finally:
                self.db.execute("RELEASE interview_operation")

    def runtime(self):
        return json.loads(self.db.execute("SELECT runtime_state FROM interview_sessions WHERE id=?",(self.session,)).fetchone()[0])

    async def submit(self, text, key, turn, instance=None, **kwargs):
        return await answers.submit_answer(self.session, answers.AnswerRequest(user_text=text,access_token='a'*40,
             expected_turn=turn,question_instance_id=instance,client_request_id=key,**kwargs),None,BackgroundTasks(),user())

    async def start(self):
        return await self.submit('[START_INTERVIEW]', 'start', 0)


@pytest.fixture
def store(monkeypatch):
    store = InterviewStore()
    for module in (sessions,answers,helpers,reports,session_routes):
        monkeypatch.setattr(module,'DatabaseConnection',store.connection)
    monkeypatch.setattr(answers,'rate_limit_session',AsyncMock())
    monkeypatch.setattr(answers,'track_funnel_event',AsyncMock())
    monkeypatch.setattr(sessions,'load_recent_session_question_memory_cached',AsyncMock(return_value={}))
    monkeypatch.setattr(sessions,'generate_live_followup_with_dedup',AsyncMock(return_value='What did you learn from testing your Python application?'))
    monkeypatch.setattr(analytics,'sync_session_skill_scores',AsyncMock())
    monkeypatch.setattr(plan_access,'sync_profile_plan_state',AsyncMock())
    monkeypatch.setattr(answers,'evaluate_single_question',AsyncMock(return_value={"classification":"strong","score":8,"communication_score":8,"answer_status":"Answered"}))
    return store


@pytest.mark.parametrize('text,evidence,requested,outcome', [
    ('An answer',{},None,'EVALUATED'), ('',{},None,'NO_ANSWER'),
    ('partial words',{'failed':True},None,'TRANSCRIPTION_FAILED'),
    ('',{'audio_bytes':40,'failed':True},None,'TRANSCRIPTION_FAILED'),
    ('',{'flush_status':'timeout'},None,'TRANSCRIPTION_FAILED'),
    ('',{'audio_bytes':40},None,'UNINTELLIGIBLE'),
    ('',{'speech_detected':True},None,'UNINTELLIGIBLE'),
    ('',{'unintelligible':True},None,'UNINTELLIGIBLE'),
    ('',{},'SKIPPED','SKIPPED'), ('',{},'ABORTED','ABORTED')])
def test_capture_classification(text,evidence,requested,outcome):
    assert classify(text,requested,evidence) == outcome


@pytest.mark.parametrize('outcome,text,evidence', [
    ('EVALUATED','I tested the Python application with unit tests and measured its latency.',{}),
    ('NO_ANSWER','',{}), ('TRANSCRIPTION_FAILED','',{'failed':True,'audio_bytes':42}),
    ('TRANSCRIPTION_FAILED','partial answer',{'flush_status':'timeout'}),
    ('UNINTELLIGIBLE','',{'audio_bytes':42}), ('SKIPPED','',{}), ('ABORTED','',{})])
def test_actual_final_answer_is_terminal_and_failure_never_scored(store,monkeypatch,outcome,text,evidence):
    before = store.snapshot()
    async def run():
        first = await store.start()
        result = await store.submit(text,'final-answer',first['turn'],first['question_instance_id'],
                    terminal_outcome=None if outcome=='EVALUATED' else outcome,capture_evidence=evidence,end_after_answer=True)
        assert result['action']=='finish'
        records=terminal_records(store.runtime())
        assert len(records)==1 and records[0]['outcome']==outcome
        assert records[0]['raw_answer']==text
        rows=store.db.execute('SELECT * FROM question_evaluations WHERE session_id=?',(store.session,)).fetchall()
        assert len(rows)==(1 if outcome=='EVALUATED' else 0)
        if outcome in {'TRANSCRIPTION_FAILED','UNINTELLIGIBLE','ABORTED'}:
            assert result['final_score'] is None
        if outcome in {'NO_ANSWER','SKIPPED'}:
            assert result['final_score']==0
        payload=await reports.get_report(store.session,user())
        assert len(payload['terminal_answer_records'])==1
        assert payload['session']['final_score']==result['final_score']
    asyncio.run(run())
    after=store.snapshot()
    for table,rows in before.items():
        for row in rows:
            if table=='interview_sessions' and row[0]==store.session:
                continue
            assert row in after[table], table


def test_duplicate_concurrent_submit_and_old_retry_do_not_advance(store):
    async def run():
        first=await store.start()
        async def answer():
            return await store.submit('I tested the application with unit tests.','answer',1,first['question_instance_id'])
        a,b=await asyncio.gather(answer(),answer())
        assert a==b and a['turn']==2
        assert len(store.runtime()['question_records'])==2
        assert sum(bool(r.get('outcome')) for r in terminal_records(store.runtime()))==1
        assert store.db.execute("SELECT COUNT(*) FROM conversation_messages WHERE session_id=? AND role='user'",(store.session,)).fetchone()[0]==1
        with pytest.raises(HTTPException) as rejected:
            await store.submit('A late different transcript','other-key',1,first['question_instance_id'])
        assert rejected.value.status_code==409
        assert await answer()==a
    asyncio.run(run())


def test_three_asked_questions_have_three_terminal_records(store):
    async def run():
        response=await store.start()
        for number,outcome in enumerate(('TRANSCRIPTION_FAILED','NO_ANSWER','EVALUATED'),1):
            response=await store.submit('I built and tested a Python application.' if outcome=='EVALUATED' else '',f'answer-{number}',
                number,response['question_instance_id'],terminal_outcome=None if outcome=='EVALUATED' else outcome,
                capture_evidence={'failed':True} if outcome=='TRANSCRIPTION_FAILED' else {},end_after_answer=number==3)
        records=terminal_records(store.runtime())
        assert len(records)==3 and all(r.get('outcome') for r in records)
        assert len({r['question_instance_id'] for r in records})==3
        asked=store.db.execute("SELECT COUNT(*) FROM conversation_messages WHERE session_id=? AND role='assistant' AND turn_number>0",(store.session,)).fetchone()[0]
        assert asked==len(records)==3
    asyncio.run(run())


def test_concurrent_finish_returns_same_response_and_one_completion_event(store):
    async def run():
        await store.start()
        a,b=await asyncio.gather(sessions.finish_session(store.session,'a'*40),sessions.finish_session(store.session,'a'*40))
        assert a==b and a['final_score'] is None
        assert terminal_records(store.runtime())[0]['outcome']=='ABORTED'
        assert store.db.execute("SELECT COUNT(*) FROM usage_events WHERE event_type='interview_completed' AND metadata LIKE ?",('%'+store.session+'%',)).fetchone()[0]==1
    asyncio.run(run())


def test_evaluation_write_failure_rolls_back_answer_and_advance(store,monkeypatch):
    async def run():
        first=await store.start()
        before=store.snapshot()
        monkeypatch.setattr(answers,'evaluate_single_question',AsyncMock(side_effect=TimeoutError('provider unavailable')))
        with pytest.raises(TimeoutError):
            await store.submit('I built a Python application.','answer',1,first['question_instance_id'])
        assert store.snapshot()==before
    asyncio.run(run())


def test_late_terminal_result_cannot_replace_committed_outcome():
    runtime={}
    instance=register_question(runtime,str(uuid4()),1,'A question?')
    terminalize(runtime,instance,'TRANSCRIPTION_FAILED')
    with pytest.raises(ValueError): terminalize(runtime,instance,'EVALUATED','late words')
    assert terminal_records(runtime)[0]['outcome']=='TRANSCRIPTION_FAILED'


def test_normal_guided_answer_preserves_actual_attribution(store):
    async def run():
        first=await store.start()
        store.insert('interview_assistance_event',id=str(uuid4()),session_id=store.session,question_instance_id=first['question_instance_id'],
                     assistance_type='answer_guidance',assistance_level=1,user_id=OWNER, generated_content='A concrete example', model_provider='test',
                     generated_at=(NOW-timedelta(seconds=2)).isoformat(),viewed_at=(NOW-timedelta(seconds=1)).isoformat())
        await store.submit('I tested the Python application with unit tests.','answer',1,first['question_instance_id'])
        row=store.db.execute('SELECT assistance_provenance FROM question_evaluations WHERE session_id=?',(store.session,)).fetchone()
        assert row[0]=='answer_guided'
    asyncio.run(run())


@pytest.mark.parametrize('primary,secondary,provider',[ (('good transcript',.8),None,'groq'), (None,('fallback transcript',.7),'deepgram'),(None,None,'none'),((' ',.8),None,'groq')])
def test_actual_stt_provider_chain(monkeypatch,primary,secondary,provider):
    groq=AsyncMock(return_value=primary); deepgram=AsyncMock(return_value=secondary)
    monkeypatch.setattr(stt,'_transcribe_groq',groq);monkeypatch.setattr(stt,'_transcribe_deepgram',deepgram)
    result=asyncio.run(stt.transcribe_audio(b'audio'))
    assert result['provider']==provider
    assert deepgram.await_count==(1 if primary is None else 0)
    assert result['transcript']==('' if provider=='none' or primary==(' ',.8) else (primary or secondary)[0])


def test_provider_timeout_uses_real_fallback(monkeypatch):
    monkeypatch.setattr(stt,'_transcribe_groq',AsyncMock(side_effect=TimeoutError()))
    monkeypatch.setattr(stt,'_transcribe_deepgram',AsyncMock(return_value=('recovered',.8)))
    assert asyncio.run(stt.transcribe_audio(b'audio'))['transcript']=='recovered'


@pytest.mark.parametrize('text',[None,42,{},[]])
def test_malformed_groq_response_is_failure(monkeypatch,text):
    monkeypatch.setattr(stt,'get_settings',lambda:SimpleNamespace(GROQ_API_KEY='test',GROQ_WHISPER_MODEL='whisper'))
    monkeypatch.setattr(stt,'_get_groq',lambda:SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=AsyncMock(return_value=SimpleNamespace(text=text))))))
    assert asyncio.run(stt._transcribe_groq(b'audio','en')) is None


def test_actual_termination_is_atomic_idempotent_and_preserves_captured_text(store):
    async def run():
        first=await store.start()
        req=session_routes.TerminateRequest(access_token='a'*40,reason='explicit abort',user_text='Words before abort',
                     question_instance_id=first['question_instance_id'],capture_evidence={'audio_bytes':20})
        a,b=await asyncio.gather(session_routes.terminate_interview(store.session,req,user()),session_routes.terminate_interview(store.session,req,user()))
        assert a==b and a['action']=='terminated' and a['final_score'] is None
        record=terminal_records(store.runtime())[0]
        assert record['outcome']=='ABORTED' and record['raw_answer']=='Words before abort'
        assert store.db.execute("SELECT COUNT(*) FROM conversation_messages WHERE session_id=? AND role='user' AND turn_number=1",(store.session,)).fetchone()[0]==1
        assert len(json.loads(store.db.execute('SELECT proctoring_violations FROM interview_sessions WHERE id=?',(store.session,)).fetchone()[0]))==1
    asyncio.run(run())


def test_final_answer_never_generates_an_extra_question(store):
    async def run():
        first=await store.start()
        await store.submit('My final complete answer.','end',1,first['question_instance_id'],end_after_answer=True)
        assert len(terminal_records(store.runtime()))==1
        assert sessions.generate_live_followup_with_dedup.await_count==1
    asyncio.run(run())


def test_infrastructure_failure_is_not_reported_as_candidate_timeout(store):
    async def run():
        first=await store.start()
        result=await store.submit('','failed',1,first['question_instance_id'],capture_evidence={'failed':True},end_after_answer=True)
        assert result['summary']['timeout_count']==0
        assert 'answer_quality_hint' not in result
    asyncio.run(run())


@pytest.mark.parametrize('route',['answer','finish','terminate'])
def test_owner_filter_for_mutating_interview_operations(store,route):
    async def run():
        await store.start()
        foreign=user();foreign.id=str(uuid4())
        with pytest.raises(HTTPException) as rejected:
            if route=='answer':
                await answers.submit_answer(store.session,answers.AnswerRequest(access_token='a'*40,expected_turn=1,client_request_id='foreign'),None,BackgroundTasks(),foreign)
            elif route=='finish':
                await session_routes.end_interview(store.session,session_routes.FinishRequest(access_token='a'*40),foreign)
            else:
                await session_routes.terminate_interview(store.session,session_routes.TerminateRequest(access_token='a'*40),foreign)
        assert rejected.value.status_code==404
    asyncio.run(run())


@pytest.mark.parametrize('provider',['none','groq'])
def test_actual_rest_retains_audio_and_audit_even_when_transcription_fails(store,monkeypatch,provider):
    from io import BytesIO
    from starlette.datastructures import UploadFile
    monkeypatch.setattr(stt_ws,'get_settings',lambda:SimpleNamespace(STT_SERVER_ENABLED=True))
    monkeypatch.setattr(stt_ws,'DatabaseConnection',store.connection)
    monkeypatch.setattr(stt_ws,'transcribe_audio',AsyncMock(return_value=dict(provider=provider,transcript='',raw_transcript='',confidence=0,audio_id='audio')))
    storage=AsyncMock(return_value='saved/audio');audit=AsyncMock()
    monkeypatch.setattr(stt_ws,'store_audio_chunk',storage);monkeypatch.setattr(stt_ws,'record_audio_turn',audit)
    monkeypatch.setattr(stt_ws,'create_signed_url',AsyncMock(return_value='signed'))
    async def run():
        upload=UploadFile(BytesIO(b'audio'))
        if provider=='none':
            with pytest.raises(HTTPException) as rejected:
                await stt_ws.stt_transcribe_rest(upload,store.session,'1-window','en-IN',None,user())
            assert rejected.value.status_code==502
        else:
            result=await stt_ws.stt_transcribe_rest(upload,store.session,'1-window','en-IN',None,user())
            assert result['final_transcript']==''
    asyncio.run(run())
    assert storage.await_args.args[-1]==b'audio'
    assert audit.await_args.kwargs['transcription_status']==('failed' if provider=='none' else 'success')


def test_actual_ws_correlates_failure_with_window(monkeypatch):
    monkeypatch.setattr(stt_ws,'transcribe_audio',AsyncMock(return_value=dict(provider='none',confidence=0)))
    monkeypatch.setattr(stt_ws,'store_audio_chunk',AsyncMock(return_value='saved/audio'))
    monkeypatch.setattr(stt_ws,'create_signed_url',AsyncMock(return_value='signed'))
    monkeypatch.setattr(stt_ws,'record_audio_turn',AsyncMock())
    socket=SimpleNamespace(send_json=AsyncMock())
    asyncio.run(stt_ws._finalize_turn(socket,str(uuid4()),'1-window',[b'audio'],'en-IN',None))
    assert socket.send_json.await_args.args[0]['turn_id']=='1-window'
    assert socket.send_json.await_args.args[0]['type']=='error'


def test_ws_database_outage_is_temporary_not_forbidden(monkeypatch):
    monkeypatch.setattr(stt_ws,'get_settings',lambda:SimpleNamespace(STT_SERVER_ENABLED=True))
    monkeypatch.setattr(stt_ws,'_decode_token_identity',lambda *_:dict(auth_user_id=OWNER,email=''))
    monkeypatch.setattr(stt_ws,'_resolve_session_owner',AsyncMock(side_effect=TimeoutError()))
    socket=SimpleNamespace(query_params={'token':'jwt'},close=AsyncMock(),accept=AsyncMock())
    asyncio.run(stt_ws.stt_websocket(socket,str(uuid4())))
    assert socket.close.await_args.kwargs['code']==1013
    socket.accept.assert_not_awaited()


def test_evaluation_provider_outage_never_becomes_heuristic_candidate_failure(monkeypatch):
    from app.services import evaluator_scoring
    from app.services.interview_terminal import intent
    monkeypatch.setattr(evaluator_scoring,'call_llm_json',AsyncMock(side_effect=TimeoutError()))
    async def run():
        marker=intent.set({'outcome':'EVALUATED'})
        try:
            with pytest.raises(TimeoutError):
                await evaluator_scoring.evaluate_single_question('Tell me about your work','I built and tested a Python project','{}','communication','free')
        finally:intent.reset(marker)
    asyncio.run(run())


def test_pdf_never_labels_unmeasured_session_zero(monkeypatch):
    from app.services import report_generator
    renderer=Mock(return_value=b'%PDF-test')
    monkeypatch.setattr(report_generator,'_build_professional_fpdf_report',renderer)
    asyncio.run(report_generator.generate_pdf_report({'final_score':None,'plan':'pro'},[],'test@example.test'))
    assert renderer.call_args.kwargs['score'] is None
    from app.services.report_helpers import _minimal_pdf_report
    assert b'Score: Unmeasured' in _minimal_pdf_report(None,'pro','test@example.test',[])


def test_primary_pdf_includes_unmeasured_question_and_never_fabricates_zero():
    from io import BytesIO
    from pypdf import PdfReader
    from app.services.report_generator import _build_professional_fpdf_report
    data=_build_professional_fpdf_report(None,{},[],[],[],'test@example.test','04 Oct 2026',plan='pro',duration_seconds=30,finished_at=None,
         session_summary={'planned_questions':1,'closed_questions':1,'terminal_answer_records':[{'turn':1,'outcome':'TRANSCRIPTION_FAILED','question_text':'Explain your project.'}]})
    text=' '.join(page.extract_text() for page in PdfReader(BytesIO(data)).pages)
    assert 'UNMEASURED' in text and 'TRANSCRIPTION_FAILED' in text and 'Explain your project.' in text
    assert '0/100' not in text


def test_inconsistent_asked_question_ledger_fails_closed_without_finishing(store):
    async def run():
        await store.start()
        store.insert('conversation_messages',session_id=store.session,role='assistant',content='Untracked question?',turn_number=2)
        with pytest.raises(RuntimeError):
            await sessions.finish_session(store.session,'a'*40)
        assert store.db.execute('SELECT state FROM interview_sessions WHERE id=?',(store.session,)).fetchone()[0]=='ACTIVE'
    asyncio.run(run())


def test_closed_session_rest_stt_rejects_before_audio_or_provider_writes(store,monkeypatch):
    from io import BytesIO
    from starlette.datastructures import UploadFile
    store.db.execute("UPDATE interview_sessions SET state='FINISHED' WHERE id=?",(store.session,))
    monkeypatch.setattr(stt_ws,'get_settings',lambda:SimpleNamespace(STT_SERVER_ENABLED=True))
    monkeypatch.setattr(stt_ws,'DatabaseConnection',store.connection)
    provider=AsyncMock();storage=AsyncMock()
    monkeypatch.setattr(stt_ws,'transcribe_audio',provider);monkeypatch.setattr(stt_ws,'store_audio_chunk',storage)
    with pytest.raises(HTTPException) as rejected:
        asyncio.run(stt_ws.stt_transcribe_rest(UploadFile(BytesIO(b'audio')),store.session,'1-window','en-IN',None,user()))
    assert rejected.value.status_code==409
    provider.assert_not_awaited();storage.assert_not_awaited()


@pytest.mark.parametrize('legacy_answer,existing_zero,expected',[('',False,'ABORTED'),('I built and tested a Python project.',False,'EVALUATED'),('',True,'ABORTED')])
def test_legacy_active_finish_is_safe_without_rewriting_historical_answers(store,legacy_answer,existing_zero,expected):
    async def run():
        await store.start()
        runtime=store.runtime();runtime.pop('terminal_contract_version');runtime.pop('question_records')
        store.db.execute('UPDATE interview_sessions SET runtime_state=? WHERE id=?',(json.dumps(runtime),store.session))
        if legacy_answer:
            store.insert('conversation_messages',session_id=store.session,role='user',content=legacy_answer,turn_number=1)
        if existing_zero:
            store.insert('question_evaluations',id=str(uuid4()),session_id=store.session,turn_number=1,score=0,rubric_category='communication',classification='silent',raw_answer='')
        before=store.snapshot()
        result=await sessions.finish_session(store.session,'a'*40)
        record=terminal_records(store.runtime())[0]
        assert record['outcome']==expected
        assert result['final_score']==(80 if expected=='EVALUATED' else None)
        for table,rows in before.items():
            for row in rows:
                if table=='interview_sessions' and row[0]==store.session:continue
                assert row in store.snapshot()[table]
        report=await reports.get_report(store.session,user())
        assert len(report['evaluations'])==(1 if expected=='EVALUATED' else 0)
    asyncio.run(run())


def test_legacy_active_answer_acquires_terminal_contract_before_advancing(store):
    async def run():
        first=await store.start()
        runtime=store.runtime();runtime.pop('terminal_contract_version');runtime.pop('question_records')
        store.db.execute('UPDATE interview_sessions SET runtime_state=? WHERE id=?',(json.dumps(runtime),store.session))
        result=await store.submit('','failed-answer',1,first['question_instance_id'],capture_evidence={'failed':True},end_after_answer=True)
        assert result['final_score'] is None
        assert terminal_records(store.runtime())[0]['outcome']=='TRANSCRIPTION_FAILED'
    asyncio.run(run())


def test_legacy_active_abort_preserves_final_capture(store):
    async def run():
        first=await store.start()
        runtime=store.runtime();runtime.pop('terminal_contract_version');runtime.pop('question_records')
        store.db.execute('UPDATE interview_sessions SET runtime_state=? WHERE id=?',(json.dumps(runtime),store.session))
        await session_routes.terminate_interview(store.session,session_routes.TerminateRequest(access_token='a'*40,user_text='captured final words',question_instance_id=first['question_instance_id']),user())
        record=terminal_records(store.runtime())[0]
        assert record['outcome']=='ABORTED' and record['raw_answer']=='captured final words'
    asyncio.run(run())


def test_legacy_partial_question_write_with_zero_counter_cannot_be_scored_zero(store):
    async def run():
        store.db.execute("UPDATE interview_sessions SET runtime_state='{}', total_turns=0 WHERE id=?",(store.session,))
        store.insert('conversation_messages',session_id=store.session,role='assistant',content='A question inserted before a counter update?',turn_number=1)
        result=await sessions.finish_session(store.session,'a'*40)
        assert result['final_score'] is None
        assert len(terminal_records(store.runtime()))==1
        assert terminal_records(store.runtime())[0]['outcome']=='ABORTED'
    asyncio.run(run())
