"""Actual offline assistance, view, answer and retry operations; no live services."""
import asyncio
from datetime import timedelta
import json
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from app.dependencies import UserProfile
from test_batch0_history_safety import NOW, OWNER, OTHER, user
from test_batch2_interview_stt import store  # Existing actual SQL/transaction fixture.
from app.routers import interviews_assistance as assistance, interviews_session as routes, reports
from app.services import assistance as engine
from app.services.assistance_evidence import resolve_provenance

ANSWER = "I tested the Python application with realistic unit tests and measured its performance."

@pytest.fixture
def assisted(store, monkeypatch):
    monkeypatch.setattr(assistance, "DatabaseConnection", store.connection)
    monkeypatch.setattr(assistance, "generate_hint", AsyncMock(return_value={"content":"Use a specific example.", "model_provider":"test"}))
    monkeypatch.setattr(assistance, "generate_answer_guidance", AsyncMock(return_value={"content":"Explain your action and result.", "why_it_works":["Shows ownership"], "model_provider":"test"}))
    store.db.execute("CREATE UNIQUE INDEX request_identity ON interview_assistance_event(request_id)")
    store.clock = NOW
    store.db.create_function("clock_timestamp", 0, lambda: store.clock.isoformat())
    store.insert("interview_assistance_policy", session_id=store.session, enabled=True, hints_enabled=True, answer_guidance_enabled=True)
    return store

async def generate(s, instance, kind="hint", level=1, key=None, identity=None):
    kwargs=dict(client_request_id=key or f"{kind}-{instance}-{level}", question_text="UNTRUSTED QUESTION", question_instance_id=instance, access_token="a"*40)
    if kind=="hint":
        return await assistance.request_hint(s.session, assistance.AssistanceHintRequest(**kwargs, level=level), identity or user())
    return await assistance.request_answer_guidance(s.session, assistance.AssistanceGuidanceRequest(**kwargs), identity or user())

async def view(s,event,identity=None):
    return await assistance.mark_event_viewed(s.session,event["event_id"],assistance.AssistanceViewedRequest(access_token="a"*40),identity or user())

async def retry(s, active, source=None, key="retry"):
    return await routes.retry_question(s.session, routes.RetryQuestionRequest(access_token="a"*40, client_request_id=key,
        expected_turn=active["turn"], active_question_instance_id=active["question_instance_id"],
        question_instance_id=source or active["question_instance_id"]), user())

@pytest.mark.parametrize("kind", ["hint","answer_guidance"])
@pytest.mark.parametrize("flag", ["enabled","kind"])
def test_disabled_policy_and_kind_never_calls_provider(assisted,kind,flag):
    async def run():
        first=await assisted.start()
        column="enabled" if flag=="enabled" else "hints_enabled" if kind=="hint" else "answer_guidance_enabled"
        assisted.db.execute(f"UPDATE interview_assistance_policy SET {column}=0 WHERE session_id=?",(assisted.session,))
        with pytest.raises(HTTPException) as exc: await generate(assisted,first["question_instance_id"],kind)
        assert exc.value.status_code==403
        assert assisted.db.execute("SELECT count(*) FROM interview_assistance_event WHERE session_id=?",(assisted.session,)).fetchone()[0]==0
        result=await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True)
        assert result["assistance_provenance"]=="independent"
    asyncio.run(run())
    assistance.generate_hint.assert_not_awaited(); assistance.generate_answer_guidance.assert_not_awaited()

@pytest.mark.parametrize("kind,level", [("hint",1),("hint",2),("answer_guidance",1)])
def test_concurrent_generation_returns_identical_immutable_response_once(assisted,kind,level):
    async def run():
        first=await assisted.start(); instance=first["question_instance_id"]
        a,b=await asyncio.gather(generate(assisted,instance,kind,level),generate(assisted,instance,kind,level))
        assert a==b
        # Different transport ID cannot replace an already generated level.
        assert await generate(assisted,instance,kind,level,key="another-id")==a
        row=assisted.db.execute("SELECT * FROM interview_assistance_event WHERE session_id=?",(assisted.session,)).fetchone()
        assert row["question_text"]==first["text"] and row["turn_number"]==1
        assert row["viewed_at"] is None and row["used_before_answer"] is None
        assert assisted.db.execute("SELECT count(*) FROM interview_assistance_event WHERE session_id=?",(assisted.session,)).fetchone()[0]==1
    asyncio.run(run())
    (assistance.generate_hint if kind=="hint" else assistance.generate_answer_guidance).assert_awaited_once()

@pytest.mark.parametrize("kinds,viewed,offset,expected", [
    (["hint"],False,-1,"independent"), (["answer_guidance"],False,-1,"independent"),
    (["hint"],True,-1,"hint_assisted"), (["answer_guidance"],True,-1,"answer_guided"),
    (["hint","answer_guidance"],True,-1,"answer_guided"),
    (["answer_guidance","hint"],True,-1,"answer_guided"),
    (["hint"],True,0,"independent"), (["answer_guidance"],True,0,"independent"),
    (["hint"],True,1,"independent"), (["answer_guidance"],True,1,"independent")])
def test_actual_persisted_answer_uses_strict_view_evidence(assisted,kinds,viewed,offset,expected):
    async def run():
        first=await assisted.start(); events=[]
        for kind in kinds:
            event=await generate(assisted,first["question_instance_id"],kind);events.append(event)
            if viewed: await view(assisted,event)
        assisted.clock=NOW-timedelta(seconds=offset)
        result=await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True)
        assert result["assistance_provenance"]==expected
        row=assisted.db.execute("SELECT assistance_provenance FROM question_evaluations WHERE session_id=?",(assisted.session,)).fetchone()
        assert row[0]==expected
        record=assisted.runtime()["question_records"][first["question_instance_id"]]
        assert record["assistance_provenance"]==expected
        before=assisted.snapshot()
        assert await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True)==result
        assert assisted.snapshot()==before
        report=await reports.get_report(assisted.session,user())
        assert report["evaluations"][0]["assistance_provenance"]==expected
    asyncio.run(run())

@pytest.mark.parametrize("change,expected", [("invalidated","independent"),("other-instance","independent"),("other-owner","independent"),
    ("missing-generated","unknown"),("empty-content","unknown"),("fallback","unknown"),("missing-owner","unknown"),("missing-instance","unknown")])
def test_invalidated_scoped_and_incomplete_legacy_evidence(assisted,change,expected):
    async def run():
        first=await assisted.start(); instance=first["question_instance_id"]
        event=await generate(assisted,instance);await view(assisted,event)
        update={"invalidated":("invalidated",1),"other-instance":("question_instance_id",str(uuid4())),"other-owner":("user_id",OTHER),
          "missing-generated":("generated_at",None),"empty-content":("generated_content",""),"fallback":("model_provider","fallback"),"missing-owner":("user_id",None)}
        if change=="missing-instance":
            result=await resolve_provenance(assisted,assisted.session,None,OWNER,NOW+timedelta(seconds=1))
        else:
            column,value=update[change];assisted.db.execute(f"UPDATE interview_assistance_event SET {column}=? WHERE id=?",(value,event["event_id"]))
            assisted.clock=NOW+timedelta(seconds=1)
            result=(await assisted.submit(ANSWER,"answer",1,instance,end_after_answer=True))["assistance_provenance"]
        assert result==expected
    asyncio.run(run())

@pytest.mark.parametrize("kind",["hint","answer_guidance"])
@pytest.mark.parametrize("failure",["timeout","network","empty","malformed","partial","unsafe","fallback"])
def test_failed_generation_never_persists_or_blocks_independent_answer(assisted,monkeypatch,kind,failure):
    async def run():
        first=await assisted.start()
        provider=AsyncMock(side_effect=TimeoutError() if failure=="timeout" else OSError("private provider error") if failure=="network" else None,
            return_value={"content":""} if failure=="empty" else [] if failure=="malformed" else {"content":None} if failure=="partial" else
              {"content":"Provider text","safety_passed":False} if failure=="unsafe" else {"content":"Provider text","model_provider":"fallback"})
        monkeypatch.setattr(assistance,"generate_hint" if kind=="hint" else "generate_answer_guidance",provider)
        before=assisted.snapshot()
        with pytest.raises(HTTPException) as exc: await generate(assisted,first["question_instance_id"],kind)
        assert exc.value.status_code==503 and "private" not in str(exc.value.detail)
        assert assisted.snapshot()==before
        result=await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True)
        assert result["assistance_provenance"]=="independent"
    asyncio.run(run())

@pytest.mark.parametrize("kind",["hint","answer_guidance"])
def test_owner_stale_request_identity_and_finished_generation(assisted,kind):
    async def run():
        first=await assisted.start(); instance=first["question_instance_id"]
        with pytest.raises(HTTPException) as exc: await generate(assisted,instance,kind,identity=UserProfile(id=OTHER,email="",plan="pro"))
        assert exc.value.status_code==404
        event=await generate(assisted,instance,kind,key="stable")
        with pytest.raises(HTTPException) as exc: await generate(assisted,instance,"answer_guidance" if kind=="hint" else "hint",key="stable")
        assert exc.value.status_code==409
        second=await assisted.submit(ANSWER,"answer",1,instance)
        with pytest.raises(HTTPException) as exc: await view(assisted,event)
        assert exc.value.status_code==409
        with pytest.raises(HTTPException) as exc: await generate(assisted,instance,kind,key="new-stale")
        assert exc.value.status_code==409
        await assisted.submit("","finish",second["turn"],second["question_instance_id"],terminal_outcome="ABORTED",end_after_answer=True)
        before=assisted.snapshot()
        with pytest.raises(HTTPException) as exc: await generate(assisted,second["question_instance_id"],kind)
        assert exc.value.status_code==409
        await assistance.get_assistance_summary(assisted.session,"a"*40,user())
        assert assisted.snapshot()==before
    asyncio.run(run())

@pytest.mark.parametrize("original_kind,retry_kind",[(None,"hint"),("hint",None),("answer_guidance",None),("hint","answer_guidance")])
def test_retry_keeps_original_answer_score_and_provenance(assisted,original_kind,retry_kind):
    async def run():
        first=await assisted.start(); original_id=first["question_instance_id"]
        if original_kind: await view(assisted,await generate(assisted,original_id,original_kind))
        assisted.clock+=timedelta(seconds=1)
        second=await assisted.submit(ANSWER,"original",1,original_id)
        original=dict(assisted.runtime()["question_records"][original_id])
        evaluation=tuple(assisted.db.execute("SELECT * FROM question_evaluations WHERE session_id=? AND turn_number=1",(assisted.session,)).fetchone())
        new=await retry(assisted,second,original_id)
        assert new["question_instance_id"]!=original_id and new["turn"]==3
        assert await retry(assisted,second,original_id)==new
        assert assisted.runtime()["question_records"][original_id]==original
        assert tuple(assisted.db.execute("SELECT * FROM question_evaluations WHERE session_id=? AND turn_number=1",(assisted.session,)).fetchone())==evaluation
        if retry_kind: await view(assisted,await generate(assisted,new["question_instance_id"],retry_kind))
        assisted.clock+=timedelta(seconds=1)
        result=await assisted.submit(ANSWER,"retry-answer",3,new["question_instance_id"],end_after_answer=True)
        expected="independent" if retry_kind is None else "hint_assisted" if retry_kind=="hint" else "answer_guided"
        assert result["assistance_provenance"]==expected
        records=assisted.runtime()["question_records"]
        assert len(records)==3 and all(r.get("outcome") for r in records.values())
        assert records[new["question_instance_id"]]["retry_of_question_instance_id"]==original_id
        assert records[original_id]==original
        report=await reports.get_report(assisted.session,user())
        assert len(report["evaluations"])==2 and result["final_score"]==80
        assert "mastery" not in json.dumps(result).lower()
    asyncio.run(run())

@pytest.mark.parametrize("outcome,evidence",[("TRANSCRIPTION_FAILED",{"failed":True}),("UNINTELLIGIBLE",{"audio_bytes":40}),("ABORTED",{}),("SKIPPED",{}),("NO_ANSWER",{})])
def test_non_evaluated_outcome_has_audit_but_no_assisted_answer(assisted,outcome,evidence):
    async def run():
        first=await assisted.start();await view(assisted,await generate(assisted,first["question_instance_id"],"answer_guidance"))
        assisted.clock+=timedelta(seconds=1)
        result=await assisted.submit("","answer",1,first["question_instance_id"],terminal_outcome=outcome,capture_evidence=evidence,end_after_answer=True)
        record=assisted.runtime()["question_records"][first["question_instance_id"]]
        assert "assistance_provenance" not in record and "assistance_provenance" not in result
        assert assisted.db.execute("SELECT count(*) FROM question_evaluations WHERE session_id=?",(assisted.session,)).fetchone()[0]==0
        assert assisted.db.execute("SELECT viewed_at,used_before_answer FROM interview_assistance_event WHERE session_id=?",(assisted.session,)).fetchone()[0]
    asyncio.run(run())

@pytest.mark.parametrize("view_first",[True,False])
def test_answer_view_lock_race_is_deterministic(assisted,view_first):
    async def run():
        first=await assisted.start(); event=await generate(assisted,first["question_instance_id"])
        async def acknowledge(): return await view(assisted,event)
        async def answer():
            assisted.clock=NOW+timedelta(seconds=1)
            return await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True)
        if view_first:
            await acknowledge(); result=await answer();assert result["assistance_provenance"]=="hint_assisted"
        else:
            result=await answer()
            with pytest.raises(HTTPException) as exc: await acknowledge()
            assert exc.value.status_code==409 and result["assistance_provenance"]=="independent"
    asyncio.run(run())



@pytest.mark.parametrize("kind",["hint","answer_guidance"])
@pytest.mark.parametrize("payload",[None,{}, {"content":""}, {"content":42}, {"content":"valid but incomplete"}])
def test_real_engine_rejects_malformed_and_partial_guidance(monkeypatch,kind,payload):
    if kind=="hint" and payload=={"content":"valid but incomplete"}:
        payload={"content":"x"*8001}
    monkeypatch.setattr(engine,"call_llm_json",AsyncMock(return_value=payload))
    async def run():
        with pytest.raises(ValueError):
            if kind=="hint": await engine.generate_hint("A question?",None,1,"{}","Candidate")
            else: await engine.generate_answer_guidance("A question?",None,"{}","Candidate",{})
    asyncio.run(run())

@pytest.mark.parametrize("kind",["hint","answer_guidance"])
def test_provider_recovers_same_request_after_failure(assisted,monkeypatch,kind):
    provider=AsyncMock(side_effect=[TimeoutError(),{"content":"Recovered guidance", "why_it_works":["Concrete example"]}])
    monkeypatch.setattr(assistance,"generate_hint" if kind=="hint" else "generate_answer_guidance",provider)
    async def run():
        first=await assisted.start()
        with pytest.raises(HTTPException): await generate(assisted,first["question_instance_id"],kind)
        result=await generate(assisted,first["question_instance_id"],kind)
        assert await generate(assisted,first["question_instance_id"],kind)==result
        assert provider.await_count==2
        assert assisted.db.execute("SELECT count(*) FROM interview_assistance_event WHERE session_id=?",(assisted.session,)).fetchone()[0]==1
    asyncio.run(run())

@pytest.mark.parametrize("action",["answer","retry"])
def test_pending_generation_serializes_with_answer_or_retry(assisted,monkeypatch,action):
    async def run():
        first=await assisted.start(); entered=asyncio.Event(); release=asyncio.Event()
        async def provider(*args):
            entered.set();await release.wait();return {"content":"A generated hint"}
        monkeypatch.setattr(assistance,"generate_hint",provider)
        generation=asyncio.create_task(generate(assisted,first["question_instance_id"]))
        await entered.wait()
        operation=asyncio.create_task(assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True) if action=="answer" else retry(assisted,first))
        await asyncio.sleep(0);assert not operation.done()
        release.set();event=await generation;result=await operation
        if action=="answer":assert result["assistance_provenance"]=="independent"
        else:assert result["question_instance_id"]!=first["question_instance_id"]
        with pytest.raises(HTTPException) as exc:await view(assisted,event)
        assert exc.value.status_code==409
    asyncio.run(run())

@pytest.mark.parametrize("kind",["hint","answer_guidance"])
def test_view_retry_preserves_first_timestamp_and_owner(assisted,kind):
    async def run():
        first=await assisted.start();event=await generate(assisted,first["question_instance_id"],kind)
        with pytest.raises(HTTPException) as exc:await view(assisted,event,UserProfile(id=OTHER,email="",plan="pro"))
        assert exc.value.status_code==404
        original=await view(assisted,event)
        assisted.clock+=timedelta(seconds=1)
        assert await view(assisted,event)==original
    asyncio.run(run())

@pytest.mark.parametrize("change",["invalidated","missing-generated","empty-content"])
def test_unavailable_event_cannot_be_viewed(assisted,change):
    async def run():
        first=await assisted.start();event=await generate(assisted,first["question_instance_id"])
        column,value={"invalidated":("invalidated",1),"missing-generated":("generated_at",None),"empty-content":("generated_content","")}[change]
        assisted.db.execute(f"UPDATE interview_assistance_event SET {column}=? WHERE id=?",(value,event["event_id"]))
        with pytest.raises(HTTPException) as exc:await view(assisted,event)
        assert exc.value.status_code==409
        assert assisted.db.execute("SELECT viewed_at FROM interview_assistance_event WHERE id=?",(event["event_id"],)).fetchone()[0] is None
    asyncio.run(run())

def test_retry_concurrency_and_stale_distinct_operation(assisted):
    async def run():
        first=await assisted.start();a,b=await asyncio.gather(retry(assisted,first),retry(assisted,first))
        assert a==b and len(assisted.runtime()["question_records"])==2
        with pytest.raises(HTTPException) as exc:await retry(assisted,first,key="different")
        assert exc.value.status_code==409
    asyncio.run(run())

def test_provider_outage_preserves_viewed_provenance_and_answer(assisted,monkeypatch):
    from app.routers import interviews_answer as answers
    async def run():
        first=await assisted.start();event=await generate(assisted,first["question_instance_id"]);await view(assisted,event)
        assisted.clock+=timedelta(seconds=1)
        monkeypatch.setattr(answers,"evaluate_single_question",AsyncMock(side_effect=RuntimeError("evaluation unavailable")))
        result=await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True)
        assert result['final_score'] is None and result['assistance_provenance']=='hint_assisted'
        record=assisted.runtime()['question_records'][first['question_instance_id']]
        assert record['raw_answer']==ANSWER and record['assistance_provenance']=='hint_assisted'
        assert record['evaluation_state']=='UNAVAILABLE'
        assert assisted.db.execute("SELECT used_before_answer FROM interview_assistance_event WHERE id=?",(event["event_id"],)).fetchone()[0]==1
    asyncio.run(run())

@pytest.mark.parametrize("provenance,label",[("independent","Independent Attempt"),("hint_assisted","Hint Assisted"),("answer_guided","Answer Guided"),("unknown","Unknown")])
def test_owner_primary_and_fallback_pdfs_label_provenance(provenance,label):
    import io
    from pypdf import PdfReader
    from app.services.report_generator import generate_pdf_report
    from app.services.report_helpers import _minimal_pdf_report
    evaluation={"turn_number":1,"question_text":"Describe your project", "raw_answer":ANSWER,"score":8,
                "rubric_category":"communication","classification":"strong","assistance_provenance":provenance}
    pdf=asyncio.run(generate_pdf_report({"plan":"free","final_score":80,"rubric_scores":{"communication":8}},[evaluation],"student"))
    assert label in "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)
    fallback=_minimal_pdf_report(80,"free","student",[evaluation])
    assert label in "".join(page.extract_text() for page in PdfReader(io.BytesIO(fallback)).pages)


def test_simultaneous_hint_and_guidance_and_legitimate_second_level(assisted):
    async def run():
        first=await assisted.start();instance=first["question_instance_id"]
        hint,guidance=await asyncio.gather(generate(assisted,instance),generate(assisted,instance,"answer_guidance"))
        extra=await generate(assisted,instance,"hint",2)
        assert len({hint["event_id"],guidance["event_id"],extra["event_id"]})==3
        assert assistance.generate_hint.await_count==2 and assistance.generate_answer_guidance.await_count==1
        for event in (hint,guidance,extra):await view(assisted,event)
        assisted.clock+=timedelta(seconds=1)
        assert (await assisted.submit(ANSWER,"answer",1,instance,end_after_answer=True))["assistance_provenance"]=="answer_guided"
    asyncio.run(run())

def test_legacy_unlinked_view_is_unknown_without_rewriting(assisted):
    async def run():
        first=await assisted.start()
        assisted.insert("interview_assistance_event",id=str(uuid4()),session_id=assisted.session,user_id=OWNER,
             turn_number=1,assistance_type="hint",assistance_level=1,viewed_at=NOW.isoformat())
        assisted.clock+=timedelta(seconds=1)
        result=await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True)
        assert result["assistance_provenance"]=="unknown"
    asyncio.run(run())


def test_policy_off_does_not_erase_prior_real_view_evidence(assisted):
    async def run():
        first=await assisted.start();event=await generate(assisted,first["question_instance_id"]);await view(assisted,event)
        assisted.db.execute("UPDATE interview_assistance_policy SET enabled=0 WHERE session_id=?",(assisted.session,))
        assisted.clock+=timedelta(seconds=1)
        assert (await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True))["assistance_provenance"]=="hint_assisted"
    asyncio.run(run())

def test_pending_view_transaction_orders_answer_after_committed_ack(assisted,monkeypatch):
    async def run():
        first=await assisted.start();event=await generate(assisted,first["question_instance_id"])
        entered=asyncio.Event();release=asyncio.Event();original=assisted.fetchrow
        async def fetchrow(sql,*args):
            result=await original(sql,*args)
            if "UPDATE interview_assistance_event SET viewed_at" in sql: entered.set();await release.wait()
            return result
        monkeypatch.setattr(assisted,"fetchrow",fetchrow)
        acknowledgement=asyncio.create_task(view(assisted,event));await entered.wait()
        assisted.clock+=timedelta(seconds=1)
        answer=asyncio.create_task(assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True))
        await asyncio.sleep(0);assert not answer.done();release.set();await acknowledgement
        assert (await answer)["assistance_provenance"]=="hint_assisted"
    asyncio.run(run())

def test_better_retry_is_additional_evidence_without_readiness_or_mastery(assisted,monkeypatch):
    from app.routers import interviews_answer as answers
    async def run():
        first=await assisted.start();next_question=await assisted.submit(ANSWER,"original",1,first["question_instance_id"])
        new=await retry(assisted,next_question,first["question_instance_id"])
        monkeypatch.setattr(answers,"evaluate_single_question",AsyncMock(return_value={"score":10,"communication_score":10,"classification":"strong","answer_status":"Answered"}))
        completed=await assisted.submit(ANSWER,"retry-answer",new["turn"],new["question_instance_id"],end_after_answer=True)
        report=await reports.get_report(assisted.session,user())
        assert [e["score"] for e in report["evaluations"]]==[8,10]
        assert not completed["readiness_eligible"] and not report["session"]["readiness_eligible"]
        assert report["session"]["evaluation_state"]=="PARTIALLY_COMPLETE"
        assert "mastered" not in json.dumps(report).lower()
    asyncio.run(run())

@pytest.mark.parametrize("kind",["hint","answer_guidance"])
def test_public_share_and_owner_reads_preserve_private_assistance(assisted,kind):
    async def run():
        first=await assisted.start();event=await generate(assisted,first["question_instance_id"],kind);await view(assisted,event)
        assisted.clock+=timedelta(seconds=1)
        await assisted.submit(ANSWER,"answer",1,first["question_instance_id"],end_after_answer=True)
        assisted.db.execute("UPDATE interview_sessions SET share_token=? WHERE id=?",("batch4-share",assisted.session))
        before=assisted.snapshot();owner=await reports.get_report(assisted.session,user());shared=await reports.get_shared_report("batch4-share")
        assert owner["evaluations"][0]["assistance_provenance"]==("hint_assisted" if kind=="hint" else "answer_guided")
        forbidden={"generated_content","why_it_works","raw_answer","evidence","question_instance_id","request_id","event_id"}
        def keys(value):
            if isinstance(value,dict):return set(value)|set().union(*(keys(v) for v in value.values()))
            if isinstance(value,list):return set().union(*(keys(v) for v in value))
            return set()
        assert not (keys(shared)&forbidden)
        assert event["content"] not in json.dumps(shared)
        assert assisted.snapshot()==before
    asyncio.run(run())

@pytest.mark.parametrize("provenance",["independent","hint_assisted","answer_guided","unknown"])
def test_college_evidence_projection_never_penalizes_provenance(provenance):
    from app.services.score_semantics import assessment
    from app.routers.org_college_analytics import _cc_tier_for_sessions
    base={"plan":"career","final_score":80,"total_turns":1,"runtime_state":{"terminal_contract_version":1,
          "question_records":{"instance":{"turn":1,"question_instance_id":"instance","outcome":"EVALUATED"}}}}
    evaluation={"turn_number":1,"score":8,"communication_score":8,"classification":"strong","rubric_category":"communication","assistance_provenance":provenance}
    projected=assessment(base,[evaluation]);control=assessment(base,[{**evaluation,"assistance_provenance":"independent"}])
    assert projected==control and projected["final_score"]==80
    assert _cc_tier_for_sessions([{**base,**projected}])==_cc_tier_for_sessions([{**base,**control}])


@pytest.mark.parametrize('kind,viewed,expected',[
    ('hint',False,'independent'),('hint',True,'hint_assisted'),
    ('answer_guidance',True,'answer_guided')])
def test_restore_projects_current_view_evidence_without_marking_used(assisted,kind,viewed,expected):
    async def run():
        first=await assisted.start()
        event=await generate(assisted,first['question_instance_id'],kind)
        if viewed: await view(assisted,event)
        assisted.clock+=timedelta(seconds=1)
        restored=await routes.get_session(assisted.session,user())
        assert restored['plan']=='free'
        assert restored['turn']==1 and restored['question_instance_id']==first['question_instance_id']
        assert restored['current_question_text']==first['text']
        assert restored['current_assistance_provenance']==expected
        assert restored['assistance_enabled'] is True or restored['assistance_enabled']==1
        assert restored['candidate_name']=='Candidate'
        assert assisted.db.execute('SELECT used_before_answer FROM interview_assistance_event WHERE id=?',(event['event_id'],)).fetchone()[0] is None
    asyncio.run(run())
