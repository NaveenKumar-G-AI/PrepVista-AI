"""Persistence adapter. Caller MUST hold the interview session row lock."""
from datetime import datetime, timezone
import json
import re

import structlog

from app.services.interview_orchestrator import InterviewOrchestrator, CoverageTracker
from app.services.interview_catalog import valid_question_wording
from app.services.interview_summary import coerce_runtime_state
from app.services.interviewer_constants import START_TOKENS, NO_ANSWER_TOKEN, SYSTEM_TIME_UP_TOKEN, EXIT_PHRASES
from app.services.interviewer_templates import _is_repeat_request
from app.services.interviewer_helpers import _build_answer_led_followup

logger = structlog.get_logger("prepvista.interview_v2")

# Keep existing evaluator vocabulary while persisting canonical families separately.
RUBRIC = {"PROJECT": "ownership", "BEHAVIORAL": "ownership", "TEAMWORK": "teamwork_pressure",
          "PRESSURE_AND_STRESS": "teamwork_pressure", "FINAL_CLOSING": "closeout",
          "INTRODUCTION_AND_PERSONAL_PROFILE": "introduction", "CAREER_GOALS": "learning_growth",
          "COMPANY_AND_ROLE": "role_fit", "AI_USAGE": "ai_tool_fluency"}


def public_progress(state: dict) -> dict:
    current = state["questions"][-1] if state["questions"] else None
    return {"mode": state["blueprint"]["mode"], "phase": state["phase"],
            "primary_questions": len(state["anchors"]),
            "target_primary_questions": state["blueprint"]["target_primary_questions"],
            "question_type": current["type"] if current else None}


async def process_v2(conn, session, user_text: str, end_interview: bool) -> dict:
    runtime = coerce_runtime_state(session["runtime_state"])
    state = runtime["orchestrator_v2"]
    raw = user_text.strip()
    current = state["questions"][-1] if state["questions"] else None
    old_turn = len(state["questions"])
    event = "answer"
    requested_exit = raw == "[USER_REQUESTED_END]" or raw.lower() in EXIT_PHRASES
    if raw in START_TOKENS:
        event = "current" if current else "start"
    elif raw == NO_ANSWER_TOKEN:
        event = "silence" if int(runtime.get("question_retry_count", 0)) < 1 else "skip"
    elif raw == "[TRANSCRIPTION_FAILED]":
        event = "transcript_failure"
    elif raw.lower() in {"skip", "skip this question", "move on", "next question"}:
        event = "skip"
    elif _is_repeat_request(raw) and current:
        event = "clarify"
    elif not raw and current and not end_interview:
        event = "transcript_failure"
    if requested_exit or raw == SYSTEM_TIME_UP_TOKEN:
        event = "exit"
    # Start the server clock when the first question is issued, not during resume upload.
    now = datetime.now(timezone.utc)
    if not state.get("started_at"):
        state["started_at"] = now.isoformat()
    started = datetime.fromisoformat(state["started_at"])
    remaining = max(0, state["blueprint"]["duration_seconds"] - int((now - started).total_seconds()))
    finish = end_interview or requested_exit or raw == SYSTEM_TIME_UP_TOKEN
    state, question = InterviewOrchestrator.advance(state, raw, remaining_seconds=remaining, event=event, finish=finish)
    has_answer = bool(current and event == "answer" and raw)
    if has_answer:
        await conn.execute("INSERT INTO conversation_messages (session_id, role, content, turn_number) VALUES ($1, 'user', $2, $3)", session["id"], raw, old_turn)
    new_question = question is not None and len(state["questions"]) > old_turn
    if new_question:
        # Reuse the old answer-aware wording only AFTER authorization to probe.
        # Its text can never change the chosen family, anchor or next action.
        if question["type"] == "FOLLOWUP" and question["reason_for_asking"] == "reasoning":
            try:
                summary = session["resume_summary"]
                if isinstance(summary, str):
                    summary = json.loads(summary)
                wording = _build_answer_led_followup(session["plan"], current["text"], raw, summary)
            except Exception:
                wording = ""
                logger.warning("interview_v2_wording_fallback", session_id=str(session["id"]))
            if wording and valid_question_wording(wording, [q["text"] for q in state["questions"][:-1]]) and re.search(r"why|trade.?off|alternative|stale", wording, re.I) and not any(q["text"] == wording for q in state["questions"][:-1]):
                question["text"] = wording
        await conn.execute("INSERT INTO conversation_messages (session_id, role, content, turn_number) VALUES ($1, 'assistant', $2, $3)", session["id"], question["text"], len(state["questions"]))
        runtime["question_retry_count"] = 0
    elif event == "silence":
        runtime["question_retry_count"] = int(runtime.get("question_retry_count", 0)) + 1
    runtime["orchestrator_v2"] = state
    runtime["question_state"] = "active_question_open" if question else "question_closed"
    runtime["covered_families"] = [f for f, c in CoverageTracker.snapshot(state).items() if c["answered"]]
    runtime["exited_early"] = finish
    if event in {"clarify", "silence", "skip"}:
        counter = {"clarify": "clarification_count", "silence": "timeout_count", "skip": "skipped_count"}[event]
        runtime[counter] = int(runtime.get(counter, 0)) + 1
    # Persist actual issued turns for existing evaluator/report consumers. Primary
    # blueprint slots live separately and cannot be displaced by a follow-up.
    issued = [{"turn": i + 1, "category": RUBRIC.get(q["family"], "technical_depth"),
               "family": q["family"], "target": q["text"], "difficulty": q["difficulty"],
               "question_type": q["type"], "anchor_id": q["anchor_id"], "question_id": q["id"],
               "max_questions": state["blueprint"]["max_questions"]} for i, q in enumerate(state["questions"])]
    await conn.execute(
        """UPDATE interview_sessions SET total_turns = $2, runtime_state = $3,
           question_plan = $4, active_question_turn = $5, last_answer_status = $6
           WHERE id = $1""", session["id"], len(state["questions"]), json.dumps(runtime), json.dumps(issued),
        len(state["questions"]) if question else None, "answered" if has_answer else event,
    )
    logger.info("interview_v2_transition", session_id=str(session["id"]), transition_event=event,
                phase=state["phase"], primary_count=len(state["anchors"]), followup_count=state["followups_used"])
    text = question["text"] if question else ""
    if event == "silence" and question:
        text = "Take a moment. You can try again or skip this question. " + text
    return {"action": "continue" if question else "finish", "text": text,
            "turn": len(state["questions"]), "max_turns": state["blueprint"]["max_questions"],
            "remaining_turns": max(0, state["blueprint"]["max_questions"] - len(state["questions"])),
            "question_for_eval": current["text"] if has_answer else None,
            "turn_for_eval": old_turn if has_answer else None, "progress": public_progress(state),
            "time_remaining_seconds": remaining}
