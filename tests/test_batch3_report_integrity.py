"""Offline Batch 3 score/evidence contract regressions."""
import asyncio
import copy
import io
import json
import pytest
from app.services.score_semantics import assessment, numeric_score
from app.services.evaluator_scoring import compute_final_score


def session(outcomes, score=0):
    return dict(plan="pro", final_score=score, rubric_scores={}, total_turns=len(outcomes),
                runtime_state={"terminal_contract_version": 1, "question_records": {
                    str(index): dict(turn=index, question_instance_id=str(index), question_text=f"Question {index}", outcome=value)
                    for index, value in enumerate(outcomes, 1)}})


def evaluation(turn=1, score=8, **values):
    return dict(turn_number=turn, score=score, rubric_category="technical_depth", classification="strong", **values)


@pytest.mark.parametrize("outcome,score,state", [
    ("EVALUATED",80,"COMPLETE"),("NO_ANSWER",0,"COMPLETE"),("SKIPPED",0,"COMPLETE"),
    ("TRANSCRIPTION_FAILED",None,"NOT_MEASURED"),("UNINTELLIGIBLE",None,"NOT_MEASURED"),("ABORTED",None,"NOT_MEASURED")])
def test_each_terminal_outcome_has_truthful_score(outcome,score,state):
    data=assessment(session([outcome]),[evaluation()] if outcome=="EVALUATED" else [])
    assert data["final_score"]==score
    assert data["evaluation_state"]==state
    assert data["readiness_eligible"]==(outcome=="EVALUATED")


@pytest.mark.parametrize("outcome",["TRANSCRIPTION_FAILED","UNINTELLIGIBLE","ABORTED"])
def test_partial_score_never_contains_system_penalty(outcome):
    data=assessment(session(["EVALUATED",outcome,outcome]),[evaluation()])
    assert data["final_score"]==80
    assert data["evaluation_state"]=="PARTIALLY_COMPLETE"
    assert data["measurement_coverage"]["measured_pct"]==33.3
    assert data["measurement_coverage"]["unmeasured"]==2
    assert not data["readiness_eligible"]


@pytest.mark.parametrize("value",[None,{},"missing",float("nan"),float("inf"),True,-1,11])
def test_invalid_or_missing_per_answer_score_is_not_zero(value):
    assert compute_final_score([evaluation(score=value)],"pro")["final_score"] is None


def test_genuine_measured_zero_and_category_zero_survive():
    data=assessment(session(["EVALUATED"]),[evaluation(score=0, communication_score=0)])
    assert data["final_score"]==0
    assert data["category_scores"]["technical_depth"]==0
    assert data["category_scores"]["communication"]==0
    assert data["readiness_eligible"]


def test_category_without_evidence_is_absent_not_zero():
    result=compute_final_score([evaluation()],"pro")
    assert result["final_score"]==80
    assert result["category_scores"].get("communication") is None


def test_partial_category_average_ignores_null_and_preserves_zero():
    result=compute_final_score([evaluation(score=0),evaluation(turn=2,score=8),evaluation(turn=3,score=None)],"pro",3)
    assert result["category_scores"]["technical_depth"]==4
    assert result["final_score"]==40
    assert result["completion_rate"]==66.7


@pytest.mark.parametrize("state",["PENDING","UNAVAILABLE"])
def test_missing_evaluation_has_explicit_status_and_no_zero(state):
    source=session(["EVALUATED"])
    source["runtime_state"]["question_records"]["1"]["evaluation_state"]=state
    data=assessment(source,[])
    assert data["final_score"] is None
    assert data["evaluation_state"]==state
    assert data["terminal_answer_records"][0]["score"] is None


def test_pending_plus_measured_is_partial_not_complete():
    data=assessment(session(["EVALUATED","EVALUATED"]),[evaluation()])
    assert data["final_score"]==80
    assert data["measurement_coverage"]["pending"]==1
    assert data["evaluation_state"]=="PARTIALLY_COMPLETE"


def test_no_evaluation_or_outcome_is_unmeasured():
    assert compute_final_score([],"free",5)["final_score"] is None
    assert assessment(session([]),[])["final_score"] is None


def test_ambiguous_historical_zero_is_not_rewritten():
    source=dict(plan="pro",final_score=0,total_turns=1,runtime_state={},rubric_scores={})
    before=copy.deepcopy(source)
    data=assessment(source,[])
    assert data["final_score"]==0
    assert not data["readiness_eligible"]
    assert source==before


def test_unknown_numeric_values_never_become_zero():
    assert numeric_score(None) is None
    assert numeric_score(0)==0


def test_coverage_and_expected_questions_do_not_multiply_score():
    single=compute_final_score([evaluation()],"pro",3)
    complete=compute_final_score([evaluation()],"pro",1)
    assert single["final_score"]==complete["final_score"]==80
    assert single["completion_rate"]==33.3


# Reuse the owned offline SQL/transaction fixture; execute actual handlers.
from test_batch2_interview_stt import store, user
from app.routers import reports, dashboard
from app.services import score_semantics
from unittest.mock import AsyncMock
from types import SimpleNamespace


@pytest.mark.parametrize("outcome,text,evidence", [
    ("EVALUATED", "I tested the application with unit tests and measured latency.", {}),
    ("NO_ANSWER", "", {}), ("SKIPPED", "", {}),
    ("TRANSCRIPTION_FAILED", "partial diagnostic text", {"failed": True}),
    ("UNINTELLIGIBLE", "", {"audio_bytes": 42}), ("ABORTED", "", {})])
def test_actual_completion_reload_history_and_shared_agree(store, monkeypatch, outcome, text, evidence):
    monkeypatch.setattr(dashboard, "DatabaseConnection", store.connection)
    async def run():
        started = await store.start()
        completed = await store.submit(text, "batch3-end", started["turn"], started["question_instance_id"],
            terminal_outcome=None if outcome == "EVALUATED" else outcome,
            capture_evidence=evidence, end_after_answer=True)
        report = await reports.get_report(store.session, user())
        reloaded = await reports.get_report(store.session, user())
        assert report == reloaded
        for key in ("final_score", "evaluation_state", "measurement_coverage"):
            assert report["session"][key] == completed[key]
        history = await dashboard.get_session_history(user=user(), limit=20, offset=0)
        card = next(row for row in history["sessions"] if row["id"] == store.session)
        for key in ("final_score", "evaluation_state", "measurement_coverage"):
            assert card["score" if key == "final_score" else key] == completed[key]
        store.db.execute("UPDATE interview_sessions SET share_token=? WHERE id=?", ("batch3-public", store.session))
        snapshot = store.snapshot()
        shared = await reports.get_shared_report("batch3-public")
        for key in ("final_score", "evaluation_state", "measurement_coverage"):
            assert shared["session"][key] == completed[key]
        public_records = shared["terminal_answer_records"]
        assert public_records[0]["outcome"] == outcome
        assert not ({"raw_answer", "evidence", "question_instance_id"} & set(public_records[0]))
        assert "raw_answer" not in json.dumps(shared)
        assert store.snapshot() == snapshot
        if outcome in {"TRANSCRIPTION_FAILED", "UNINTELLIGIBLE", "ABORTED"}:
            assert report["session"]["strengths"] == report["session"]["weaknesses"] == []
    asyncio.run(run())


@pytest.mark.parametrize("outcomes,expected", [(["EVALUATED"], 0), (["TRANSCRIPTION_FAILED"], None), (["EVALUATED", "ABORTED"], 80)])
def test_actual_platform_rollup_projects_evidence_before_ranking(outcomes, expected):
    from app.routers.org_admin_helpers import _fetch_all_orgs_perf
    source = dict(session(outcomes), id="interview", organization_id="college")
    class Conn:
        async def fetch(self, sql, *args):
            if "FROM organizations o" in sql:
                return [dict(org_id="college", avg_score=0, avg_technical_depth=0, total_sessions=1)]
            if "FROM interview_sessions s" in sql:
                assert "s.organization_id = ANY" in sql and args == (["college"],)
                assert "os.organization_id = s.organization_id" in sql and "os.user_id = s.user_id" in sql
                return [source]
            assert "FROM question_evaluations" in sql and args == ("interview",)
            return [dict(evaluation(score=0 if expected == 0 else 8), session_id="interview")] if "EVALUATED" in outcomes else []
    result = asyncio.run(_fetch_all_orgs_perf(Conn()))[0]
    assert result["avg_score"] == expected
    assert result["total_sessions"] == (0 if expected is None else 1)
    assert result["avg_technical_depth"] == (None if expected is None else expected / 10)


@pytest.mark.parametrize("outcome,state", [("TRANSCRIPTION_FAILED","NOT_MEASURED"), ("EVALUATED","PENDING"), ("EVALUATED","UNAVAILABLE")])
def test_actual_pdf_and_fallback_expose_missing_state(outcome, state):
    from pypdf import PdfReader
    from app.services.report_generator import generate_pdf_report
    from app.services.report_helpers import _minimal_pdf_report
    data = session([outcome])
    data["runtime_state"]["question_records"]["1"]["evaluation_state"] = state
    integrity = assessment(data, [])
    primary = asyncio.run(generate_pdf_report(data, [], "candidate@example.test"))
    fallback = _minimal_pdf_report(None, "pro", "candidate@example.test", [], integrity)
    for blob in (primary, fallback):
        text = " ".join(page.extract_text() for page in PdfReader(io.BytesIO(blob)).pages)
        assert integrity["measurement_label"].lower() in text.lower()
        assert "0/100" not in text
        assert "At Risk" not in text and "Needs Improvement" not in text
        assert "Question 1" in text


def test_mixed_intentional_zero_affects_score_but_system_failure_does_not():
    rows = [evaluation(communication_score=8)]
    intentional = assessment(session(["EVALUATED", "SKIPPED"]), rows)
    failure = assessment(session(["EVALUATED", "TRANSCRIPTION_FAILED"]), rows)
    assert intentional["category_scores"]["communication"] == 4
    assert intentional["final_score"] < failure["final_score"] == 80
    assert intentional["measurement_coverage"]["intentional"] == 1


def test_missing_subscores_cannot_create_strengths_or_weaknesses():
    data = compute_final_score([evaluation()], "pro")
    assert data["strengths"] == data["weaknesses"] == []
    assert not assessment(session(["EVALUATED"]), [evaluation()])["feedback_eligible"]


def test_college_projection_excludes_null_from_average_and_withholds_latest_readiness():
    measured = dict(session(["EVALUATED"], 80), id="s1", user_id="student", created_at=1)
    failed = dict(session(["TRANSCRIPTION_FAILED"], 0), id="s2", user_id="student", created_at=2)
    calls = []
    class Conn:
        async def fetch(self, sql, *args):
            calls.append((sql,args))
            if "FROM interview_sessions" in sql:
                assert "organization_id = $1" in sql and "user_id = ANY" in sql
                assert args == ("college", ["student", "new"])
                return [measured,failed]
            assert args == (["s1","s2"],)
            return [dict(evaluation(), session_id="s1")]
    rows = asyncio.run(score_semantics.org_measurement_rows(Conn(), "college", [
        dict(user_id="student", cached_tier="at_risk", avg_communication=0),
        dict(user_id="new", cached_tier="at_risk")]))
    assert len(calls) == 2
    assert rows[0]["avg_score"] == 80 and rows[0]["latest_score"] is None
    assert rows[0]["avg_communication"] is None
    assert rows[0]["cached_tier"] == "not_measured" and not rows[0]["cached_zero_risk"]
    assert rows[1]["avg_score"] is None and not rows[1]["readiness_eligible"]


def test_percentiles_and_tiers_preserve_zero_and_leave_null_unranked():
    from app.routers.org_college_analytics import _cc_percentile_histories, _cc_tier_for_sessions
    rows = {"zero": [dict(final_score=0)], "null": [dict(final_score=None)], "positive": [dict(final_score=80)]}
    result = _cc_percentile_histories(rows)
    assert result == {"zero": [0], "null": [None], "positive": [100]}
    assert _cc_tier_for_sessions(rows["zero"]) == ("At Risk", True)
    assert _cc_tier_for_sessions(rows["null"]) == ("Not measured", False)
    assert _cc_tier_for_sessions([dict(final_score=80, readiness_eligible=False)]) == ("Partially measured", False)


def test_saved_assessment_matches_completion_summary():
    data = session(["EVALUATED","EVALUATED"], 80)
    expected = assessment(data, [evaluation()])
    data["runtime_state"]["final_summary"] = {"assessment":expected}
    assert assessment(data) == expected


@pytest.mark.parametrize("plan",["free","pro","career"])
@pytest.mark.parametrize("invalid",[None,{}, {"communication_score":0}, {"score":0}])
def test_actual_provider_path_rejects_missing_measurements_in_current_operation(monkeypatch, plan, invalid):
    from app.services import evaluator_scoring
    from app.services.interview_terminal import intent
    monkeypatch.setattr(evaluator_scoring,"call_llm_json",AsyncMock(return_value=invalid))
    async def run():
        marker = intent.set({"outcome":"EVALUATED"})
        try:
            with pytest.raises(ValueError, match="measurement unavailable"):
                await evaluator_scoring._evaluate_question_core("Explain your application", "I built and tested a Python application", "I built and tested a Python application", "{}", "technical_depth", plan)
        finally:
            intent.reset(marker)
    asyncio.run(run())


@pytest.mark.parametrize("plan,fields",[
    ("free",["relevance_score","clarity_score","specificity_score","structure_score","communication_score"]),
    ("pro",["question_match_score","technical_accuracy_score","specificity_score","structure_score","communication_score"]),
    ("career",["relevance_score","depth_score","specificity_score","structure_score","communication_score"])])
def test_provider_measurement_guard_accepts_authentic_zero(plan, fields):
    from app.services.evaluator_scoring import _require_provider_measurement
    from app.services.interview_terminal import intent
    marker = intent.set({"outcome":"EVALUATED"})
    try:
        _require_provider_measurement(dict.fromkeys(fields,0), plan)
    finally:
        intent.reset(marker)


def test_missing_rubric_does_not_invent_technical_category():
    data = compute_final_score([dict(score=8)], "pro")
    assert data["final_score"] == 80
    assert data["category_scores"] == {}


def test_legacy_premium_helpers_keep_missing_communication_null_and_measured_zero():
    from app.services.interview_summary import _assess_communication_style, compute_premium_interview_report
    assert _assess_communication_style([])["average_communication_score"] is None
    assert _assess_communication_style([dict(raw_answer="A real answer",communication_score=0)])["average_communication_score"] == 0
    result = compute_premium_interview_report("pro", [], 1, [], None, {}, [], [])
    assert result["final_score"] is None
    assert result["hiring_assessment"] is None and result["placement_readiness"] is None


def test_actual_missing_evaluation_history_and_report_agree_without_rewriting(store, monkeypatch):
    monkeypatch.setattr(dashboard,"DatabaseConnection",store.connection)
    async def run():
        first = await store.start()
        await store.submit("I built and tested the application with unit tests.","saved",first["turn"],first["question_instance_id"],end_after_answer=True)
        # Owned fixture models a finished ledger whose evaluator record is unavailable.
        store.db.execute("DELETE FROM question_evaluations WHERE session_id=?",(store.session,))
        before = store.snapshot()
        report = await reports.get_report(store.session,user())
        history = await dashboard.get_session_history(user=user(),limit=20,offset=0)
        card = next(row for row in history["sessions"] if row["id"] == store.session)
        assert card["score"] is report["session"]["final_score"] is None
        assert card["evaluation_state"] == report["session"]["evaluation_state"] == "PENDING"
        assert before == store.snapshot()
    asyncio.run(run())


@pytest.mark.parametrize("provenance",["independent","hint_assisted","answer_guided","unknown"])
def test_actual_report_preserves_persisted_assistance_provenance(store, provenance):
    async def run():
        first = await store.start()
        await store.submit("I built and tested the application with unit tests.","saved",first["turn"],first["question_instance_id"],end_after_answer=True)
        store.db.execute("UPDATE question_evaluations SET assistance_provenance=? WHERE session_id=?",(provenance,store.session))
        before=store.snapshot()
        report=await reports.get_report(store.session,user())
        assert report["evaluations"][0]["assistance_provenance"] == provenance
        assert report["session"]["final_score"] == 80
        assert before == store.snapshot()
    asyncio.run(run())


@pytest.mark.parametrize("format",["json","csv"])
@pytest.mark.parametrize("outcomes,expected",[( ["EVALUATED"], 0),(["TRANSCRIPTION_FAILED"],None),(["EVALUATED","TRANSCRIPTION_FAILED"],80)])
def test_actual_org_export_includes_truthful_measurement_and_no_false_risk(monkeypatch, format, outcomes, expected):
    import csv
    from contextlib import asynccontextmanager
    from app.routers import org_college_analytics as college
    data = assessment(session(outcomes), [evaluation(score=0 if expected == 0 else 8)] if "EVALUATED" in outcomes else [])
    row = dict.fromkeys(["full_name","email","student_code","department_name","year_name","batch_name","section",
        "access_granted_at","added_at","last_activity"],None)
    row.update(user_id="student",full_name="Student",email="student@example.test",has_career_access=True,status="active",
               total_interviews=1,avg_score=expected,best_score=expected,first_score=expected,latest_score=expected,
               avg_filler_ratio=None,star_usage_count=0,cached_tier="at_risk" if expected == 0 else "partially_measured" if expected is not None else "not_measured")
    row.update({"avg_"+cat:None for cat in college._RUBRIC_CATEGORIES})
    row.update({key:data[key] for key in score_semantics.SUMMARY_KEYS})
    class Conn:
        async def fetch(self,sql,*args):
            assert "os.organization_id = $1" in sql and args == ("college",)
            return [row]
    @asynccontextmanager
    async def connection():
        yield Conn()
    monkeypatch.setattr(college,"DatabaseConnection",connection)
    monkeypatch.setattr(college,"_fetch_session_series",AsyncMock(return_value=[]))
    monkeypatch.setattr(college,"org_measurement_rows",AsyncMock(return_value=[row]))
    async def run():
        response = await college.export_student_reports(export_format=format,admin=SimpleNamespace(organization_id="college"))
        if format == "json":
            result = response["students"][0]
            assert result["latest_score"] == expected
            assert result["evaluation_state"] == data["evaluation_state"]
            assert result["measurement_coverage"] == data["measurement_coverage"]
            assert result["zero_offer_risk"] == (expected == 0)
        else:
            content = b"".join([value async for value in response.body_iterator]).decode()
            result = list(csv.DictReader(io.StringIO(content)))[0]
            assert result["Latest Score"] == ("" if expected is None else str(float(expected)))
            assert result["Evaluation State"] == data["evaluation_state"]
            assert result["Measurement Label"] == data["measurement_label"]
            assert result["Intervention Flag"] == ("Yes" if expected == 0 else "No")
            from app.services.report_schedules import _render_schedule_csv
            scheduled = await _render_schedule_csv(dict(organization_id="college", department_id=None, year_id=None, batch_id=None))
            assert scheduled.decode() == content
    asyncio.run(run())


def test_actual_genuine_zero_completion_json_and_pdf(store,monkeypatch):
    from app.routers import interviews_answer
    from pypdf import PdfReader
    monkeypatch.setattr(interviews_answer,"evaluate_single_question",AsyncMock(return_value={"score":0,"communication_score":0,"classification":"wrong"}))
    async def run():
        first=await store.start()
        completed=await store.submit("I answered incorrectly but this is a valid captured answer.","zero",first["turn"],first["question_instance_id"],end_after_answer=True)
        report=await reports.get_report(store.session,user())
        assert completed["final_score"] == report["session"]["final_score"] == 0
        assert report["evaluations"][0]["score"] == 0
        pdf=await reports.download_pdf(store.session,user())
        text=" ".join(page.extract_text() for page in PdfReader(io.BytesIO(bytes(pdf.body))).pages)
        assert "0/100" in text
        assert completed["evaluation_state"] == "COMPLETE"
    asyncio.run(run())


def test_actual_three_question_mixed_score_and_coverage_agree(store):
    async def run():
        first=await store.start()
        second=await store.submit("", "failed-1", first["turn"], first["question_instance_id"],capture_evidence={"failed":True})
        third=await store.submit("", "failed-2", second["turn"], second["question_instance_id"],capture_evidence={"failed":True})
        final=await store.submit("I built and tested my Python application with unit tests.", "measured-3", third["turn"],third["question_instance_id"],end_after_answer=True)
        report=await reports.get_report(store.session,user())
        assert final["final_score"] == report["session"]["final_score"] == 80
        assert final["measurement_coverage"] == report["session"]["measurement_coverage"]
        assert final["measurement_coverage"]["measured"] == 1
        assert final["measurement_coverage"]["asked"] == len(report["terminal_answer_records"]) == 3
        assert final["evaluation_state"] == "PARTIALLY_COMPLETE"
        assert not report["session"]["readiness_eligible"]
    asyncio.run(run())


def test_unmeasured_historical_sessions_cannot_satisfy_college_minimum_evidence():
    from app.routers.org_college_analytics import _cc_tier_for_sessions
    assert _cc_tier_for_sessions([dict(final_score=None),dict(final_score=None),dict(final_score=80,readiness_eligible=True)]) == ("Developing",False)


def test_finished_legacy_null_aggregate_never_claims_readiness():
    data = assessment(dict(plan="pro",final_score=None,total_turns=1,runtime_state={}), [evaluation()])
    assert data["final_score"] is None and data["evaluation_state"] == "PENDING"
    assert not data["readiness_eligible"]


def test_actual_dashboard_aggregates_ignore_conclusive_stale_system_zero(monkeypatch):
    from test_batch0_history_safety import StoredHistory, OWNER
    history = StoredHistory()
    history.db.execute("DELETE FROM interview_sessions WHERE user_id=?",(OWNER,))
    from test_batch0_history_safety import NOW
    history.add_session("one",NOW)
    history.db.execute("UPDATE interview_sessions SET final_score=0, runtime_state=? WHERE id='one'",(json.dumps(session(["TRANSCRIPTION_FAILED"])["runtime_state"]),))
    monkeypatch.setattr(dashboard,"DatabaseConnection",history.connection)
    for name in ("_backfill_with_cooldown","get_plan_expiry_map","get_referral_summary","get_public_growth_metrics","get_usage_stats"):
        monkeypatch.setattr(dashboard,name,AsyncMock(return_value={}))
    monkeypatch.setattr(dashboard,"get_launch_offer_state",AsyncMock(return_value=None))
    monkeypatch.setattr(dashboard,"get_plan_expiry_map",AsyncMock(return_value={"pro":None,"career":None}))
    before=history.snapshot()
    result=asyncio.run(dashboard.get_dashboard(user()))
    assert result["stats"]["average_score"] is None and result["stats"]["best_score"] is None
    assert result["recent_sessions"][0]["final_score"] is None
    assert history.snapshot() == before


def test_derived_skills_never_invent_a_category_or_system_zero():
    from app.services.analytics_student import derive_skill_score_rows
    from app.services.score_semantics import project_session, project_skill_rows
    assert derive_skill_score_rows([dict(score=8)]) == []
    assert derive_skill_score_rows([evaluation(score=None)]) == []
    zero=derive_skill_score_rows([evaluation(score=0,communication_score=0)])
    assert zero and all(row["average_score"] == 0 for row in zero)
    failed=project_session(dict(session(["TRANSCRIPTION_FAILED"]),id="failed"),[evaluation(score=0)])
    cached=[dict(session_id="failed",category="technical_depth",average_score=0)]
    assert project_skill_rows(cached,[failed]) == []
    partial=project_session(dict(session(["EVALUATED","TRANSCRIPTION_FAILED"]),id="partial"),[evaluation(score=8),evaluation(turn=2,score=0)])
    corrected=project_skill_rows([dict(session_id="partial",category="technical_depth",average_score=4)],[partial])
    assert corrected[0]["average_score"] == 8


@pytest.mark.parametrize("surface", ["college_roster", "college_student", "platform_roster"])
@pytest.mark.parametrize("outcomes,expected,tier", [
    (["EVALUATED"], 0, "at_risk"),
    (["TRANSCRIPTION_FAILED"], None, "not_measured"),
    (["EVALUATED", "TRANSCRIPTION_FAILED"], 80, "partially_measured"),
])
def test_actual_basic_rosters_project_raw_cached_fields(monkeypatch, surface, outcomes, expected, tier):
    from contextlib import asynccontextmanager
    from app.routers import org_college_students as college, org_admin_analytics as platform
    org_id = "00000000-0000-4000-8000-000000000001"
    student_id = "00000000-0000-4000-8000-000000000002"
    raw = dict(id=student_id, user_id="student", readiness_tier="at_risk",
               is_zero_offer_risk=True, latest_overall_score=0, first_overall_score=0,
               total_sessions_completed=3, score_delta=-80, sessions_without_improvement=5)
    original = copy.deepcopy(raw)
    source = dict(session(outcomes), id="interview", user_id="student")
    class Conn:
        async def fetchval(self, sql, *args):
            assert "organization_id = $1" in sql and args == (org_id,)
            return 1
        async def fetchrow(self, sql, *args):
            assert "os.id = $1 AND os.organization_id = $2" in sql
            assert args == (student_id, org_id)
            return raw
        async def fetch(self, sql, *args):
            if "FROM organization_students" in sql:
                assert "os.organization_id = $1" in sql and args[0] == org_id
                return [raw]
            if "FROM interview_sessions" in sql:
                assert "organization_id = $1 AND user_id = ANY" in sql
                assert args == (org_id, ["student"])
                return [source]
            assert "FROM question_evaluations" in sql and args == (["interview"],)
            return [dict(evaluation(score=0 if expected == 0 else 8, communication_score=0 if expected == 0 else 8), session_id="interview")] if "EVALUATED" in outcomes else []
    @asynccontextmanager
    async def connection():
        yield Conn()
    monkeypatch.setattr(college, "DatabaseConnection", connection)
    monkeypatch.setattr(platform, "DatabaseConnection", connection)
    admin = SimpleNamespace(organization_id=org_id)
    async def run():
        if surface == "college_student":
            result = (await college.get_student(student_id, admin))["student"]
        elif surface == "college_roster":
            result = (await college.list_students(admin=admin))["students"][0]
        else:
            result = (await platform.get_org_students_admin(org_id, admin=admin))["students"][0]
        assert result["latest_overall_score"] == result["latest_score"] == expected
        assert result["readiness_tier"] == tier
        assert result["is_zero_offer_risk"] == (expected == 0)
        assert result["measurement_coverage"]["asked"] == len(outcomes)
        if expected is None or tier == "partially_measured":
            assert result["score_delta"] is None and result["sessions_without_improvement"] is None
        assert raw == original
    asyncio.run(run())


@pytest.mark.parametrize("outcomes,expected,tier", [
    (["EVALUATED"], 0, "at_risk"), (["TRANSCRIPTION_FAILED"], None, "not_measured"),
    (["EVALUATED", "TRANSCRIPTION_FAILED"], 80, "partially_measured")])
def test_actual_student_performance_identity_and_metrics_agree(monkeypatch, outcomes, expected, tier):
    from contextlib import asynccontextmanager
    from datetime import datetime, timezone
    from app.routers import org_college_analytics as college
    org_id = "00000000-0000-4000-8000-000000000001"
    student_id = "00000000-0000-4000-8000-000000000002"
    raw = dict(id=student_id, user_id="student", latest_overall_score=0,
               readiness_tier="at_risk", is_zero_offer_risk=True)
    source = dict(session(outcomes), id="interview", user_id="student", created_at=datetime.now(timezone.utc),
                  job_role="Developer", interview_type="technical", duration_seconds=60)
    class Conn:
        async def fetchrow(self, sql, *args):
            assert "os.id = $1 AND os.organization_id = $2" in sql and args == (student_id, org_id)
            return raw
        async def fetch(self, sql, *args):
            if "FROM interview_sessions isess" in sql:
                assert "isess.user_id = $1" in sql and "isess.organization_id = $2" in sql
                assert args == ("student", org_id)
                return [source]
            if "FROM interview_sessions" in sql:
                assert args == (org_id, ["student"])
                return [source]
            assert "FROM question_evaluations" in sql and args in [("interview",), (["interview"],)]
            return [dict(evaluation(score=0 if expected == 0 else 8), session_id="interview")] if "EVALUATED" in outcomes else []
    @asynccontextmanager
    async def connection():
        yield Conn()
    monkeypatch.setattr(college, "DatabaseConnection", connection)
    monkeypatch.setattr(college, "_fetch_perf_aggregate", AsyncMock(return_value=[dict(avg_score=expected)]))
    result = asyncio.run(college.student_performance(student_id, SimpleNamespace(organization_id=org_id)))
    assert result["student"]["latest_overall_score"] == result["performance"]["latest_score"] == expected
    assert result["student"]["readiness_tier"] == result["performance"]["readiness_tier"] == tier
    assert result["performance"]["zero_offer_risk"] == (expected == 0)
    if expected is None:
        assert result["performance"]["cohort_percentile"] is None
    if tier != "at_risk":
        assert result["performance"]["is_stuck"] is False and result["performance"]["time_to_threshold"] is None


@pytest.mark.parametrize("outcome,score,measured", [("EVALUATED", None, False), ("TRANSCRIPTION_FAILED", 0, False), ("EVALUATED", 0, True)])
def test_actual_answer_strength_summary_requires_measurement(outcome, score, measured):
    from app.services.interview_summary import compute_interview_summary
    result = compute_interview_summary("pro", [], 1, [dict(evaluation(score=score), classification="wrong")],
                                       runtime_state=session([outcome])["runtime_state"])
    counts = result["answer_strength_distribution"]
    assert sum(counts.values()) == int(measured)
    if measured:
        assert counts["weak"] == 1 and result["answered_questions"] == 1
