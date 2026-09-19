"""Owner-scoped practice: append retries without rewriting original evidence."""
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.middleware.rate_limiter import rate_limit_user
from app.routers.interviews_helpers import _validate_session_id, _safe_json_loads
from app.services.interview_orchestrator import EvidenceLedger

router = APIRouter()


class RetryRequest(BaseModel):
    question_id: str = Field(pattern=r"^q-[0-9]{1,3}$")
    answer: str = Field(min_length=1, max_length=3000)
    client_request_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    mission_id: UUID | None = None
    expected_owner_id: UUID | None = None


def compare_retry(before: dict | None, answer: str, family: str) -> dict:
    after = EvidenceLedger.analyze(answer, family).model_dump()
    before_gaps = set((before or {}).get("gaps", []))
    # Missing signals must actually appear; simply removing a claim is not proof.
    required = {"ownership": "personal_action", "measurement": "measurement", "outcome": "result", "reasoning": "reasoning", "verification": "verification"}
    repaired = [gap for gap in sorted(before_gaps) if required[gap] in after["signals"]]
    return {"before": before, "after": after, "repaired_gaps": repaired,
            "remaining_gaps": sorted(before_gaps - set(repaired)),
            "message": "New textual evidence addresses: " + ", ".join(repaired) if repaired else "The wording changed, but the missing evidence is still missing.",
            "better_structure": "Context → my responsibility → action → reasoning → actual result → learning",
            "better_answer": "Add the actual result, measurement or personal action before creating a stronger answer."}


@router.post("/{session_id}/retry-answer")
async def retry_answer(session_id: str, req: RetryRequest, user: UserProfile = Depends(get_current_user)):
    _validate_session_id(session_id)
    if req.expected_owner_id is not None and str(req.expected_owner_id) != str(user.id):
        raise HTTPException(409, 'Your account changed. This answer belongs to the original account.')
    await rate_limit_user(user.id)
    if not req.answer.strip():
        raise HTTPException(status_code=422, detail="Add your actual answer first.")
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            if req.mission_id:
                if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user.id):
                    raise HTTPException(404, 'Account is no longer available.')
                from app.services.practice_missions import authorized_mission
                from app.services.coding_store import obj
                from app.routers.coding import require_coding, require_sync
                await require_coding(user)
                await require_sync(user)
                mission = await authorized_mission(conn, user.id, req.mission_id, 'ANSWER_RETRIED')
                if obj(mission['objective']).get('session_id') != session_id:
                    raise HTTPException(409, 'This mission belongs to another interview.')
            session = await conn.fetchrow("SELECT state, runtime_state FROM interview_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE", session_id, user.id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found.")
            if session["state"] != "FINISHED":
                raise HTTPException(status_code=409, detail="Finish the interview before retrying an answer.")
            if not user.premium_override and user.effective_plan == "free":
                latest = await conn.fetchval("SELECT id FROM interview_sessions WHERE user_id = $1 AND state = 'FINISHED' ORDER BY COALESCE(finished_at, created_at) DESC LIMIT 1", user.id)
                if str(latest) != session_id:
                    raise HTTPException(status_code=403, detail="Session history is available on Pro.")
            existing = await conn.fetchrow("SELECT answer, question_id, comparison FROM interview_answer_retries WHERE session_id = $1 AND request_id = $2", session_id, req.client_request_id)
            if existing:
                if existing["answer"] != req.answer or existing["question_id"] != req.question_id:
                    raise HTTPException(status_code=409, detail="This retry key was already used for another answer.")
                return _safe_json_loads(existing["comparison"], {})
            state = _safe_json_loads(session["runtime_state"], {}).get("orchestrator_v2", {})
            question = next((q for q in state.get("questions", []) if q["id"] == req.question_id), None)
            if not question:
                raise HTTPException(status_code=404, detail="This question has no V2 practice record.")
            before = next((e for e in state["evidence"] if e["question_id"] == req.question_id), None)
            result = compare_retry(before, req.answer, question["family"])
            if req.mission_id:
                await conn.execute("INSERT INTO interview_answer_retries (session_id, user_id, question_id, request_id, answer, comparison,mission_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", session_id, user.id, req.question_id, req.client_request_id, req.answer, json.dumps(result), req.mission_id)
            else:
                await conn.execute("INSERT INTO interview_answer_retries (session_id, user_id, question_id, request_id, answer, comparison) VALUES ($1,$2,$3,$4,$5,$6)", session_id, user.id, req.question_id, req.client_request_id, req.answer, json.dumps(result))
    return result


class StoryRequest(BaseModel):
    expected_owner_id: UUID | None = None
    title: str = Field(min_length=1, max_length=160)
    context: str = Field(default="", max_length=1500)
    personal_responsibility: str = Field(default="", max_length=1000)
    action: str = Field(default="", max_length=1500)
    decision: str = Field(default="", max_length=1000)
    result: str = Field(default="", max_length=1000)
    evidence: str = Field(default="", max_length=1000)
    learning: str = Field(default="", max_length=1000)


@router.get("/practice/stories")
async def stories(user: UserProfile = Depends(get_current_user)):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch("SELECT id, title, story, created_at FROM interview_stories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100", user.id)
    return [{**dict(row), "id": str(row["id"]), "story": _safe_json_loads(row["story"], {})} for row in rows]


@router.post("/practice/stories")
async def save_story(req: StoryRequest, user: UserProfile = Depends(get_current_user)):
    if req.expected_owner_id is not None and str(req.expected_owner_id) != str(user.id):
        raise HTTPException(409, 'Your account changed. This story belongs to the original account.')
    await rate_limit_user(user.id)
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow("INSERT INTO interview_stories (user_id, title, story) VALUES ($1,$2,$3) RETURNING id", user.id, req.title, req.model_dump_json(exclude={'expected_owner_id'}))
    return {"id": str(row["id"])}


@router.delete("/practice/stories/{story_id}")
async def delete_story(story_id: str, user: UserProfile = Depends(get_current_user)):
    _validate_session_id(story_id)
    async with DatabaseConnection() as conn:
        await conn.execute("DELETE FROM interview_stories WHERE id = $1 AND user_id = $2", story_id, user.id)
    return {"deleted": True}


@router.get("/practice/progress")
async def practice_progress(user: UserProfile = Depends(get_current_user)):
    history_limit = 1 if not user.premium_override and user.effective_plan == "free" else 10
    async with DatabaseConnection() as conn:
        rows = await conn.fetch("SELECT id, created_at, runtime_state FROM interview_sessions WHERE user_id = $1 AND state = 'FINISHED' ORDER BY COALESCE(finished_at, created_at) DESC LIMIT $2", user.id, history_limit)
        retries = await conn.fetch("SELECT question_id, comparison, created_at FROM interview_answer_retries WHERE user_id = $1 AND session_id = ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 20", user.id, [r["id"] for r in rows])
    sessions = []
    for row in rows:
        report = _safe_json_loads(row["runtime_state"], {}).get("evidence_report_v2")
        if report:
            sessions.append({"id": str(row["id"]), "date": str(row["created_at"]),
                             "mode": report["blueprint"]["mode"], "role": report["blueprint"]["target_role"],
                             "coverage": report["coverage"], "missions": report["missions"], "evidence_state": report["evidence_state"]})
    return {"sessions": sessions, "retries": [{**dict(r), "comparison": _safe_json_loads(r["comparison"], {})} for r in retries],
            "note": "Different questions measure different evidence. Repeated wording does not establish improvement."}
