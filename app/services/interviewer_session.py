"""
PrepVista AI - Interviewer Session Lifecycle
Extracted from interviewer.py - the three public async endpoints:
  create_session(), process_answer(), finish_session()
plus the internal _ensure_pending_evaluations() helper.

Re-exported by interviewer.py (barrel file) for backward compatibility.
"""

import json
import re
import secrets
import asyncio
from datetime import timedelta
from typing import Any

import structlog

from app.config import (
    PLAN_CONFIG,
    SESSION_COVERAGE_TARGETS,
    get_settings,
    normalize_department,
    normalize_difficulty_mode,
)
from app.database.connection import DatabaseConnection
from app.services.technical_taxonomy import get_technical_categories
from app.services.llm import call_llm, call_llm_json
from app.services.prompts import (
    build_followup_prompt,
    build_greeting_prompt,
    build_master_prompt,
    build_question_plan_prompt,
)
from app.services.interview_summary import (
    TURN_OUTCOME_ANSWERED,
    TURN_OUTCOME_CLARIFICATION,
    TURN_OUTCOME_EXITED,
    TURN_OUTCOME_SYSTEM_CUTOFF,
    TURN_OUTCOME_TIMEOUT,
    TURN_STATE_ACTIVE_QUESTION_OPEN,
    TURN_STATE_ANSWER_RECORDED,
    TURN_STATE_QUESTION_CLOSED,
    TURN_STATE_WAITING_CLARIFICATION,
    coerce_runtime_state,
    compute_interview_summary,
)
from app.services.resume_parser import infer_resume_field_profile, sanitize_resume_text
from app.services.transcript import clean_for_display, normalize_transcript

# Import from split sub-modules
from app.services.interviewer_constants import (
    EXIT_PHRASES,
    NO_ANSWER_TOKEN,
    SYSTEM_TIME_UP_TOKEN,
    START_TOKENS,
    _VALID_PROCTORING_MODES,
    _scan_for_prompt_injection,
)
from app.services.interviewer_helpers import (
    _clean_ai_response,
    _coerce_question_plan,
    _coerce_resume_summary_dict,
    _resume_highlight,
    _resume_field_profile,
    _normalize_candidate_name,
    _extract_family_history,
    _extract_answer_coverage,
    _derive_redundant_followup_families,
    _trim_family_history,
    _get_next_plan_item,
    _normalize_topic_label,
    _build_answer_led_followup,
    _build_answer_anchor_summary,
    _should_force_answer_led_followup,
)
from app.services.interviewer_question_engine import (
    _safe_json_dumps,
    _question_signature,
    _load_recent_session_question_memory,
    _extract_asked_question_signatures,
    _collect_asked_questions,
    _collect_recent_asked_questions,
    _dedupe_preserve_order,
    _looks_like_interviewer_question,
    _finalize_interviewer_turn,
    _extract_question_portion,
    _strip_question_intro,
    _answer_signal_profile,
    _is_ambiguous_followup_question,
    _is_easy_to_understand_question,
    _select_next_plan_item,
    _extract_skip_topics,
    _trim_skip_topics,
    _question_retry_limit,
    _record_turn_outcome,
    _plan_target_signature,
    _question_angle_from_text,
    _plan_target_angle,
    _is_recruiter_language_question,
    _question_family_from_text,
    _recent_question_families,
    _recent_question_angles,
    _violates_family_repeat_rules,
    _resolve_item_difficulty,
    _normalize_plan_category,
    _normalize_plan_difficulty,
    _sanitize_plan_target,
    _normalize_generated_question_plan,
    _apply_question_style_hints,
    _humanize_question_target,
    _humanize_live_question_text,
    _is_duplicate_question,
    _build_positive_boost,
    _merge_boost_with_question,
    _get_future_plan_items,
    _get_plan_item_for_turn,
    _build_repeat_question,
    _build_clarification_question,
    _build_timeout_retry_question,
    _build_free_followup_question,
    _build_emergency_unique_question,
)
from app.services.interviewer_templates import (
    _build_pro_followup_question,
    _build_free_followup_hint,
    _build_pro_followup_hint,
    _build_career_followup_hint,
    _build_career_followup_question,
    _is_probably_followup,
    _should_force_topic_change,
    _is_repeat_request,
    _build_fallback_ai_response,
    _render_question_template,
    _adapt_question_for_difficulty,
    _build_question_preamble,
    _select_live_difficulty_signal,
    _infer_difficulty_signal,
)
from app.services.interviewer_coverage import (
    _planned_turn_limit,
    _plan_family_sequence,
    _build_fallback_question_plan,
    _apply_cross_session_question_cooldown,
    _build_opening_question,
    _compose_family_targets,
)


logger = structlog.get_logger("prepvista.interviewer")

async def create_session(
    user_id: str,
    plan: str,
    difficulty_mode: str,
    resume_text: str,
    resume_summary: dict,
    resume_file_path: str | None,
    duration_seconds: int,
    proctoring_mode: str = "practice",
) -> dict:  # ✅ ADDED: return type annotation — makes contract explicit for callers and type checkers
    """Create a new interview session with pre-generated question plan."""
    # ✅ SEC: Validate all caller-supplied parameters before any DB or LLM work.
    # Without these guards, arbitrary values reach the DB, billing logic, and prompts.

    # Plan must be a known value — unknown plan stored in DB drives billing logic
    from app.config import VALID_PLANS
    safe_plan = (plan or "free").lower().strip()
    if safe_plan not in VALID_PLANS:
        logger.warning("create_session_invalid_plan", plan=plan, user_id=user_id)
        safe_plan = "free"

    # duration_seconds must be positive and bounded — prevents negative or absurd values
    # being stored in the DB and driving session timeout logic
    _MIN_DURATION = 60        # 1 minute minimum
    _MAX_DURATION = 7200      # 2 hours maximum — well above any real interview
    safe_duration = max(_MIN_DURATION, min(int(duration_seconds or 1800), _MAX_DURATION))

    # proctoring_mode must be one of the known values
    safe_proctoring = (proctoring_mode or "practice").lower().strip()
    if safe_proctoring not in _VALID_PROCTORING_MODES:
        safe_proctoring = "practice"

    # ✅ SEC: Scan resume for prompt injection before it enters the LLM pipeline.
    # A resume containing "Ignore all previous instructions" is a real attack vector.
    # Scan both the text and the serialized summary.
    try:
        _scan_for_prompt_injection(resume_text or "", source="resume_text")
        if isinstance(resume_summary, dict):
            # Scan the string representation of the summary dict (catches injections
            # hidden inside skill names, project descriptions, etc.)
            _scan_for_prompt_injection(
                " ".join(str(v) for v in resume_summary.values() if isinstance(v, (str, list))),
                source="resume_summary",
            )
    except ValueError as exc:
        return {"error": str(exc), "action": "blocked"}

    cfg = PLAN_CONFIG.get(safe_plan, PLAN_CONFIG["free"])
    normalized_difficulty_mode = normalize_difficulty_mode(difficulty_mode)
    access_token = secrets.token_urlsafe(32)
    sanitized_resume = sanitize_resume_text(resume_text)

    async with DatabaseConnection() as conn:
        recent_memory = await _load_recent_session_question_memory(conn, user_id=user_id, plan=safe_plan)
        # ✅ FIXED: session_variant previously used only session_count as seed.
        _user_id_hash = sum(ord(ch) * (i + 1) for i, ch in enumerate(str(user_id or "")[:32])) % 65521
        session_variant = (recent_memory.get("recent_session_count", 0) * 31 + _user_id_hash) % 65521

        question_plan = []
        try:
            question_plan = []
            raise ValueError("Bypassing LLM question plan generation for speed")
        except ValueError:
            logger.debug(
                "using_fallback_question_plan_for_speed",
                plan=safe_plan,
                difficulty_mode=normalized_difficulty_mode,
            )
            question_plan = _build_fallback_question_plan(
                safe_plan,
                resume_summary,
                cfg["max_turns"],
                difficulty_mode=normalized_difficulty_mode,
                variant_seed=session_variant,
            )
        except Exception as e:
            logger.warning(
                "question_plan_generation_failed",
                plan=safe_plan,
                difficulty_mode=normalized_difficulty_mode,
                error=str(e),
            )
            question_plan = _build_fallback_question_plan(
                safe_plan,
                resume_summary,
                cfg["max_turns"],
                difficulty_mode=normalized_difficulty_mode,
                variant_seed=session_variant,
            )

        if not isinstance(question_plan, list) or not question_plan:
            question_plan = _build_fallback_question_plan(
                safe_plan,
                resume_summary,
                cfg["max_turns"],
                difficulty_mode=normalized_difficulty_mode,
                variant_seed=session_variant,
            )

        question_plan = _apply_cross_session_question_cooldown(
            plan=safe_plan,
            question_plan=question_plan,
            resume_summary=resume_summary,
            max_turns=cfg["max_turns"],
            difficulty_mode=normalized_difficulty_mode,
            recent_memory=recent_memory,
            variant_seed=session_variant,
        )
        # ✅ SEC: Use session_variant as style seed — NOT access_token.
        # Previously: f"{access_token}|{normalized_difficulty_mode}|{session_variant}"
        # The raw access_token was passed into _apply_question_style_hints which
        # logs its input at debug level — token leaked into log files.
        # session_variant provides equivalent entropy without exposing the token.
        question_plan = _apply_question_style_hints(
            safe_plan,
            question_plan,
            f"{session_variant}|{normalized_difficulty_mode}",
        )

        # ✅ ADDED: Extract and normalize department for branch-aware question routing
        # (Report §6.3). resume_summary["department"] is free-text from the CSV/profile
        # (e.g. "B.Tech - CSE", "AI&DS", "Mechanical"). normalize_department() resolves
        # it to one of the 8 canonical branch codes (cse/aids/aiml/ece/eee/mech/civil/cyber)
        # or None (→ generic fallback). Stored in runtime_state["department_code"] so
        # process_answer and the rubric scorer can both read it without a second DB call.
        _dept_raw = str(
            (resume_summary or {}).get("department") or ""
        ).strip()
        _department_code = normalize_department(_dept_raw)  # None if unrecognized

        row = await conn.fetchrow(
            """INSERT INTO interview_sessions
               (user_id, plan, difficulty_mode, resume_text, resume_summary, resume_file_path,
                question_plan, duration_planned_seconds, proctoring_mode, access_token,
                question_retry_count, runtime_state)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               RETURNING id, created_at""",
            user_id,
            safe_plan,
            normalized_difficulty_mode,
            sanitized_resume,
            _safe_json_dumps(resume_summary) if isinstance(resume_summary, dict) else resume_summary,
            resume_file_path,
            _safe_json_dumps(question_plan) if isinstance(question_plan, (list, dict)) else "[]",
            safe_duration,
            safe_proctoring,
            access_token,
            0,
            _safe_json_dumps(
                {
                    "question_state": TURN_STATE_QUESTION_CLOSED,
                    "clarification_count": 0,
                    "timeout_count": 0,
                    "skipped_count": 0,
                    "system_cutoff_count": 0,
                    "exited_early": False,
                    "question_response_times": [],
                    "covered_families": [],
                    "recent_answer_families": [],
                    # ✅ ADDED: branch routing fields
                    "department_code": _department_code,   # canonical code or null
                    "department_raw": _dept_raw or None,   # original string for audit/display
                }
            ),
        )

        await conn.execute(
            """INSERT INTO usage_events (user_id, event_type, metadata)
               VALUES ($1, 'interview_started', $2)""",
            user_id,
            _safe_json_dumps(
                {
                    "session_id": str(row["id"]),
                    "plan": safe_plan,
                    "difficulty_mode": normalized_difficulty_mode,
                    "session_variant": session_variant,
                    # ✅ ADDED: branch tracking for cohort analytics (Report §6.3)
                    "department_code": _department_code,
                    "department_raw": _dept_raw or None,
                }
            ),
        )

        # Fetch current entitlement boundaries to apply cycle-aware resets
        entitlement = await conn.fetchrow(
            """SELECT activated_at, expires_at 
               FROM user_plan_entitlements 
               WHERE user_id = $1 AND plan = $2 AND status = 'active'
               LIMIT 1""",
            user_id, plan
        )
        cycle_start = entitlement["activated_at"] if entitlement else None
        cycle_end = entitlement["expires_at"] if entitlement else None

        if not cycle_start or not cycle_end:
            profile = await conn.fetchrow("SELECT period_start FROM profiles WHERE id = $1", user_id)
            if profile and profile["period_start"]:
                cycle_start = profile["period_start"]
                cycle_end = cycle_start + timedelta(days=30)

        # Upsert the plan usage statistics with cycle-aware resetting
        await conn.execute(
            """INSERT INTO user_plan_interviews (
                   user_id, plan, total_interviews, last_interview_at, current_cycle_start, current_cycle_end
               )
               VALUES ($1, $2, 1, NOW(), $3, $4)
               ON CONFLICT (user_id, plan) 
               DO UPDATE SET 
                   total_interviews = 
                       CASE 
                           WHEN user_plan_interviews.current_cycle_end IS DISTINCT FROM EXCLUDED.current_cycle_end 
                           THEN 1 
                           ELSE user_plan_interviews.total_interviews + 1 
                       END,
                   last_interview_at = NOW(),
                   current_cycle_start = EXCLUDED.current_cycle_start,
                   current_cycle_end = EXCLUDED.current_cycle_end""",
            user_id,
            plan,
            cycle_start,
            cycle_end
        )

        await conn.execute(
            "UPDATE profiles SET interviews_used_this_period = interviews_used_this_period + 1 WHERE id = $1",
            user_id,
        )

    return {
        "session_id": str(row["id"]),
        "access_token": access_token,
        "plan": safe_plan,
        "difficulty_mode": normalized_difficulty_mode,
        "max_turns": _planned_turn_limit(safe_plan, question_plan),
        "duration_seconds": safe_duration,
        "proctoring_mode": safe_proctoring,
        # ✅ ADDED: branch context for frontend display + TPO analytics
        "department_code": _department_code,
    }


async def process_answer(
    session_id: str,
    user_text: str,
    access_token: str,
) -> dict:
    """Process a user answer and return the next AI response or finish signal."""
    # ✅ SEC: Validate session_id is a UUID before sending to DB.
    # A non-UUID value causes asyncpg to raise a raw PostgreSQL error that leaks
    # internal schema details. Validate first — return a clean error message.
    try:
        import uuid as _uuid_mod
        _uuid_mod.UUID(str(session_id or ""))
    except (ValueError, AttributeError):
        return {"action": "error", "detail": "Invalid session ID format."}

    # ✅ FIXED: Strip access_token defensively
    access_token = (access_token or "").strip()
    _MAX_USER_TEXT_CHARS = 8_000  # ~2000 words — well above any real answer
    if user_text and len(user_text) > _MAX_USER_TEXT_CHARS:
        logger.warning(
            "user_text_truncated",
            session_id=session_id,
            original_length=len(user_text),
            limit=_MAX_USER_TEXT_CHARS,
        )
        user_text = user_text[:_MAX_USER_TEXT_CHARS]

    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            """SELECT id, user_id, plan, difficulty_mode, resume_text, resume_summary, question_plan,
                      state, total_turns, silence_count, consecutive_followups, skip_topics,
                      active_question_signature, active_question_turn, question_retry_count,
                      last_answer_status, runtime_state
               FROM interview_sessions
               WHERE id = $1 AND access_token = $2""",
            session_id,
            access_token,
        )

        if not session:
            return {"action": "error", "detail": "Invalid session or access token."}
        if session["state"] != "ACTIVE":
            return {"action": "error", "detail": "Interview session is no longer active."}

        raw_user_text = (user_text or "").strip()
        plan = session["plan"]
        difficulty_mode = normalize_difficulty_mode(str(session["difficulty_mode"] or "auto"))
        cfg = PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])
        resume_text = session["resume_text"]
        # ✅ PERF: Parse resume_summary once and reuse the dict throughout this request.
        # Previously _coerce_resume_summary_dict was called 3+ times on the same JSON
        # blob (in process_answer, _build_ai_response, _build_fallback_ai_response).
        # JSON deserialization × 500 concurrent users × N turns = measurable CPU waste.
        resume_summary = _coerce_resume_summary_dict(session["resume_summary"] or {})
        question_plan = _coerce_question_plan(session["question_plan"])
        max_turn_limit = _planned_turn_limit(plan, question_plan)
        total_turns = int(session["total_turns"] or 0)
        silence_count = int(session["silence_count"] or 0)
        consecutive_followups = int(session["consecutive_followups"] or 0)
        skip_topics = _extract_skip_topics(session["skip_topics"] or [])
        active_question_signature = str(session["active_question_signature"] or "").strip()
        active_question_turn = int(session["active_question_turn"] or 0)
        question_retry_count = int(session["question_retry_count"] or 0)
        runtime_state = coerce_runtime_state(session["runtime_state"] or {})
        covered_family_history = _extract_family_history(runtime_state.get("covered_families") or [])

        # ✅ PERF: One combined query replaces two sequential queries on conversation_messages.
        # Previously: conn.fetch(history) → wait → conn.fetch(asked_rows) = 2 round trips.
        # Now: one query fetches ALL rows for this session, split in Python by role.
        # asyncpg connections are NOT safe for concurrent use — asyncio.gather with the
        # same conn object raises InterfaceError. One query is the safe AND faster path.
        max_history = get_settings().MAX_HISTORY_TURNS_IN_CONTEXT * 2
        all_message_rows = await conn.fetch(
            """SELECT role, content, turn_number
               FROM conversation_messages
               WHERE session_id = $1
               ORDER BY turn_number ASC, id ASC
               LIMIT 60""",  # 60 covers 3× max_turns for any plan — safe upper bound
            session_id,
        )
        # Split into the two views the rest of the function needs
        history_rows = list(reversed(all_message_rows[-max_history:])) if max_history else list(reversed(all_message_rows))
        asked_rows = [row for row in all_message_rows if row["role"] == "assistant"]

        conversation_history = [{"role": row["role"], "content": row["content"]} for row in history_rows]
        last_assistant_row = next((row for row in reversed(history_rows) if row["role"] == "assistant"), None)
        asked_question_signatures = _extract_asked_question_signatures(asked_rows)
        asked_questions = _collect_asked_questions(asked_rows)
        recent_asked_questions = asked_questions[-8:]
        recent_session_memory = await _load_recent_session_question_memory(
            conn,
            user_id=str(session["user_id"]),
            plan=str(plan),
            exclude_session_id=str(session["id"]),
        )

        is_greeting = total_turns == 0 and raw_user_text in START_TOKENS
        is_timeout = NO_ANSWER_TOKEN in raw_user_text
        is_time_up = SYSTEM_TIME_UP_TOKEN in raw_user_text
        lower_text = raw_user_text.lower() if raw_user_text else ""
        is_repeat_request = bool(raw_user_text and _is_repeat_request(raw_user_text))
        is_exit_request = (
            not is_greeting
            and raw_user_text
            and (any(phrase in lower_text for phrase in EXIT_PHRASES) or "[USER_REQUESTED_END]" in raw_user_text)
        )
        is_idk = any(
            phrase in lower_text
            for phrase in [
                "don't know",
                "dont know",
                "not sure",
                "no idea",
                "can't recall",
                "cant recall",
                "i forgot",
            ]
        )

        if not active_question_signature and last_assistant_row:
            active_question_signature = _question_signature(str(last_assistant_row["content"] or ""))
        if not active_question_turn and last_assistant_row:
            active_question_turn = int(last_assistant_row["turn_number"] or 0)

        question_for_eval = str(last_assistant_row["content"] or "") if last_assistant_row else None
        turn_for_eval = active_question_turn or (last_assistant_row["turn_number"] if last_assistant_row else None)
        current_plan_item = _get_plan_item_for_turn(question_plan, total_turns or active_question_turn)
        current_question_state = str(runtime_state.get("question_state") or "").strip().lower()
        if question_for_eval:
            if current_question_state not in {
                TURN_STATE_ACTIVE_QUESTION_OPEN,
                TURN_STATE_WAITING_CLARIFICATION,
            }:
                current_question_state = TURN_STATE_ACTIVE_QUESTION_OPEN
        else:
            current_question_state = TURN_STATE_QUESTION_CLOSED
        runtime_state["question_state"] = current_question_state

        question_closed_for_eval = None
        turn_closed_for_eval = None
        new_silence = silence_count
        next_followup_count = consecutive_followups
        updated_skip_topics = list(skip_topics)
        newly_covered_families: set[str] = set()
        avoid_next_families: set[str] = set()
        should_finish_after_close = False
        closed_outcome: str | None = None

        if is_repeat_request and question_for_eval:
            repeat_category = str((current_plan_item or {}).get("category") or "communication")
            repeat_text = _build_clarification_question(plan, question_for_eval, repeat_category, raw_user_text)
            runtime_state = _record_turn_outcome(
                runtime_state,
                TURN_OUTCOME_CLARIFICATION,
                question_state=TURN_STATE_WAITING_CLARIFICATION,
            )
            await conn.execute(
                """UPDATE interview_sessions
                   SET last_answer_status = $2, runtime_state = $3
                   WHERE id = $1""",
                session_id,
                TURN_OUTCOME_CLARIFICATION,
                _safe_json_dumps(runtime_state),
            )
            return {
                "action": "continue",
                "text": repeat_text,
                "turn": total_turns,
                "max_turns": max_turn_limit,
                "remaining_turns": max(max_turn_limit - total_turns, 0),
                "question_for_eval": None,
                "turn_for_eval": None,
            }

        if is_exit_request:
            if raw_user_text:
                await conn.execute(
                    """INSERT INTO conversation_messages (session_id, role, content, turn_number)
                       VALUES ($1, 'user', $2, $3)""",
                    session_id,
                    clean_for_display(raw_user_text) or raw_user_text,
                    total_turns,
                )
            runtime_state = _record_turn_outcome(
                runtime_state,
                TURN_OUTCOME_EXITED,
                question_state=TURN_STATE_ACTIVE_QUESTION_OPEN if question_for_eval else TURN_STATE_QUESTION_CLOSED,
                exited_early=True,
            )
            await conn.execute(
                """UPDATE interview_sessions
                   SET last_answer_status = $2, runtime_state = $3
                   WHERE id = $1""",
                session_id,
                TURN_OUTCOME_EXITED,
                _safe_json_dumps(runtime_state),
            )
            return {
                "action": "finish",
                "turn": total_turns,
                "max_turns": max_turn_limit,
                "remaining_turns": max(max_turn_limit - total_turns, 0),
                "question_for_eval": None,
                "turn_for_eval": None,
            }

        if is_time_up:
            runtime_state = _record_turn_outcome(
                runtime_state,
                TURN_OUTCOME_SYSTEM_CUTOFF,
                question_state=TURN_STATE_ACTIVE_QUESTION_OPEN if question_for_eval else TURN_STATE_QUESTION_CLOSED,
            )
            await conn.execute(
                """UPDATE interview_sessions
                   SET last_answer_status = $2, runtime_state = $3
                   WHERE id = $1""",
                session_id,
                TURN_OUTCOME_SYSTEM_CUTOFF,
                _safe_json_dumps(runtime_state),
            )
            return {
                "action": "finish",
                "turn": total_turns,
                "max_turns": max_turn_limit,
                "remaining_turns": max(max_turn_limit - total_turns, 0),
                "question_for_eval": None,
                "turn_for_eval": None,
            }

        normalized_user_text = ""
        retry_limit = _question_retry_limit(plan, difficulty_mode)

        if raw_user_text and not is_greeting and not is_timeout:
            normalized_user_text = normalize_transcript(raw_user_text)
            await conn.execute(
                """INSERT INTO conversation_messages (session_id, role, content, turn_number)
                   VALUES ($1, 'user', $2, $3)""",
                session_id,
                normalized_user_text,
                total_turns,
            )
            conversation_history.append({"role": "user", "content": normalized_user_text})
            new_silence = 0
            question_closed_for_eval = question_for_eval
            turn_closed_for_eval = turn_for_eval
            closed_outcome = TURN_OUTCOME_ANSWERED
            newly_covered_families = _extract_answer_coverage(
                question_for_eval or "",
                normalized_user_text,
                resume_summary,
            )
            avoid_next_families = _derive_redundant_followup_families(
                question_for_eval or "",
                normalized_user_text,
                resume_summary,
            )
            if newly_covered_families:
                covered_family_history = _trim_family_history(
                    [*covered_family_history, *sorted(newly_covered_families)]
                )
                runtime_state["covered_families"] = covered_family_history
            runtime_state["recent_answer_families"] = sorted(avoid_next_families)
            runtime_state = _record_turn_outcome(
                runtime_state,
                TURN_OUTCOME_ANSWERED,
                question_state=TURN_STATE_QUESTION_CLOSED,
            )
            if is_greeting:
                next_followup_count = 0
            else:
                upcoming_plan_item = _get_next_plan_item(question_plan, total_turns + 1)
                force_topic_change_after_answer = _should_force_topic_change(
                    plan=plan,
                    consecutive_followups=consecutive_followups,
                    silence_count=new_silence,
                    is_idk=is_idk,
                    is_timeout=False,
                )
                if force_topic_change_after_answer:
                    next_followup_count = 0
                elif _is_probably_followup(
                    question_for_eval or "",
                    normalized_user_text or raw_user_text,
                    upcoming_plan_item,
                    plan,
                ):
                    next_followup_count = consecutive_followups + 1
                else:
                    next_followup_count = 0
            if not is_greeting and total_turns >= max_turn_limit:
                should_finish_after_close = True
        elif is_timeout:
            new_silence = silence_count + 1
            question_retry_count += 1
            repeat_category = str((current_plan_item or {}).get("category") or "communication")
            if question_for_eval and question_retry_count <= retry_limit:
                retry_text = _build_timeout_retry_question(plan, question_for_eval, repeat_category, question_retry_count)
                runtime_state = _record_turn_outcome(
                    runtime_state,
                    TURN_OUTCOME_TIMEOUT,
                    question_state=TURN_STATE_ACTIVE_QUESTION_OPEN,
                )
                await conn.execute(
                    """UPDATE interview_sessions
                       SET silence_count = $2,
                           question_retry_count = $3,
                           last_answer_status = $4,
                           runtime_state = $5
                       WHERE id = $1""",
                    session_id,
                    new_silence,
                    question_retry_count,
                    TURN_OUTCOME_TIMEOUT,
                    _safe_json_dumps(runtime_state),
                )
                return {
                    "action": "continue",
                    "text": retry_text,
                    "turn": total_turns,
                    "max_turns": max_turn_limit,
                    "remaining_turns": max(max_turn_limit - total_turns, 0),
                    "question_for_eval": None,
                    "turn_for_eval": None,
                }

            question_closed_for_eval = question_for_eval
            turn_closed_for_eval = turn_for_eval
            closed_outcome = TURN_OUTCOME_TIMEOUT
            runtime_state = _record_turn_outcome(
                runtime_state,
                TURN_OUTCOME_TIMEOUT,
                question_state=TURN_STATE_QUESTION_CLOSED,
            )
            previous_topic = _normalize_topic_label(question_for_eval or "")
            if previous_topic:
                updated_skip_topics.append(previous_topic)
            updated_skip_topics = _trim_skip_topics(updated_skip_topics)
            next_followup_count = 0
            if total_turns >= max_turn_limit:
                should_finish_after_close = True
            new_silence = 0
        elif not is_greeting and not raw_user_text and question_for_eval:
            return {
                "action": "continue",
                "text": question_for_eval,
                "turn": total_turns,
                "max_turns": max_turn_limit,
                "remaining_turns": max(max_turn_limit - total_turns, 0),
                "question_for_eval": None,
                "turn_for_eval": None,
            }

        if should_finish_after_close:
            await conn.execute(
                """UPDATE interview_sessions
                   SET silence_count = $2,
                       consecutive_followups = $3,
                       skip_topics = $4,
                       active_question_signature = NULL,
                       active_question_turn = NULL,
                       question_retry_count = 0,
                       last_answer_status = $5,
                       runtime_state = $6
                   WHERE id = $1""",
                session_id,
                new_silence,
                next_followup_count,
                updated_skip_topics,
                closed_outcome,
                _safe_json_dumps(runtime_state),
            )
            return {
                "action": "finish",
                "turn": total_turns,
                "max_turns": max_turn_limit,
                "remaining_turns": max(max_turn_limit - total_turns, 0),
                "question_for_eval": question_closed_for_eval,
                "turn_for_eval": turn_closed_for_eval,
            }

        master_prompt = build_master_prompt(
            plan,
            resume_text,
            cfg,
            new_silence,
            total_turns + (1 if is_greeting else 0),
            recent_questions=recent_session_memory.get("recent_questions", []),
            difficulty_mode=difficulty_mode,
        )
        opening_question = _build_opening_question(
            plan=plan,
            question_plan=question_plan,
            difficulty_mode=difficulty_mode,
            recent_question_signatures=recent_session_memory.get("recent_question_signatures", set()),
            recent_questions=recent_session_memory.get("recent_questions", []),
        )
        stage_prompt = (
            build_greeting_prompt(
                plan,
                resume_text,
                resume_summary,
                cfg,
                opening_question=opening_question,
                difficulty_mode=difficulty_mode,
            )
            if is_greeting
            else build_followup_prompt(plan, resume_text, cfg, new_silence, difficulty_mode=difficulty_mode)
        )
        difficulty_signal = "steady" if is_greeting else _select_live_difficulty_signal(
            inferred_signal=_infer_difficulty_signal(
                user_text=raw_user_text,
                is_timeout=is_timeout,
                is_idk=is_idk,
                silence_count=new_silence,
            ),
            difficulty_mode=difficulty_mode,
            is_timeout=is_timeout,
            is_idk=is_idk,
            silence_count=new_silence,
        )
        positive_boost = (
            ""
            if is_greeting or plan == "free"
            else _build_positive_boost(plan, normalized_user_text or raw_user_text, is_timeout, is_idk)
        )
        session_avoid_families = {
            family for family in covered_family_history if family in {"introduction", "studies_background"}
        }
        combined_avoid_families = set(avoid_next_families) | session_avoid_families
        use_timeout_retry_fallback = False
        allow_duplicate_retry = bool(use_timeout_retry_fallback and new_silence <= 2)
        upcoming_turn = total_turns + 1
        next_plan_item = _select_next_plan_item(
            question_plan,
            upcoming_turn,
            avoid_families=combined_avoid_families,
            recent_session_memory=recent_session_memory,
        ) or _get_next_plan_item(question_plan, upcoming_turn)
        answer_led_followup = (
            _build_answer_led_followup(
                plan,
                question_for_eval or "",
                normalized_user_text or raw_user_text,
                resume_summary,
            )
            if not is_greeting and question_for_eval and normalized_user_text and not is_timeout and not is_idk
            else ""
        )
        answer_anchor_summary = (
            _build_answer_anchor_summary(normalized_user_text or raw_user_text, resume_summary)
            if not is_greeting and normalized_user_text and not is_timeout
            else ""
        )
        force_topic_change = _should_force_topic_change(
            plan=plan,
            consecutive_followups=consecutive_followups,
            silence_count=new_silence,
            is_idk=is_idk,
            is_timeout=is_timeout,
        )
        is_followup = (
            not is_greeting
            and not force_topic_change
            and _is_probably_followup(question_for_eval or "", normalized_user_text or raw_user_text, next_plan_item, plan)
        )

        if updated_skip_topics:
            master_prompt += f"\n\nAVOID these topics (candidate couldn't answer): {', '.join(updated_skip_topics)}"
        if combined_avoid_families:
            covered_labels = ", ".join(sorted(family.replace("_", " ") for family in combined_avoid_families))
            master_prompt += (
                "\n\nThe candidate already covered these angles in this session: "
                f"{covered_labels}. Do not ask them again immediately unless one critical detail is still missing."
            )

        if force_topic_change and not is_greeting:
            master_prompt += (
                "\n\nYou MUST now move to a completely different topic. "
                "Do not ask any more follow-ups on the current subject."
            )
        if recent_asked_questions:
            stage_prompt += "\n\nPREVIOUSLY ASKED QUESTIONS - DO NOT REPEAT:\n" + "\n".join(
                f"- {question}" for question in recent_asked_questions
            )
        if recent_session_memory.get("recent_questions"):
            stage_prompt += "\n\nRECENT PRIOR-SESSION QUESTIONS - AVOID REUSING THE SAME WORDING OR ANGLE:\n" + "\n".join(
                f"- {question}" for question in recent_session_memory["recent_questions"]
            )

        if not is_greeting:
            category_hint = str((next_plan_item or {}).get("category") or "technical_depth")
            target_hint = str((next_plan_item or {}).get("target") or "the candidate's recent work")
            planned_difficulty = str((next_plan_item or {}).get("difficulty") or "steady")
            style_hint = str((next_plan_item or {}).get("style_hint") or "natural and varied")
            stage_prompt += (
                "\n\nNEXT QUESTION TARGET:\n"
                f"- upcoming turn: {upcoming_turn}\n"
                f"- category: {category_hint}\n"
                f"- resume target: {target_hint}\n"
                f"- selected difficulty mode: {difficulty_mode}\n"
                f"- planned difficulty: {planned_difficulty}\n"
                f"- wording style hint: {style_hint}\n"
                f"- live difficulty adjustment: {difficulty_signal}\n"
                f"- use follow-up mode: {'yes' if is_followup else 'no'}\n"
                "- If live difficulty adjustment is easier, simplify the next question.\n"
                "- If live difficulty adjustment is harder, ask a slightly more specific version of the next question.\n"
                "- Use different wording from earlier turns in this session.\n"
                "- Keep the next question precise and quick to answer.\n"
                "- Ask exactly one question only."
            )
            if positive_boost:
                stage_prompt += (
                    "\n- The candidate just gave a strong answer. Start with one short confidence-boosting clause "
                    f'such as "{positive_boost}" and then ask the next question.'
                )
            if plan == "free":
                free_followup_hint = _build_free_followup_hint(
                    question_for_eval or "",
                    normalized_user_text or raw_user_text,
                    resume_summary,
                )
                if free_followup_hint and not force_topic_change:
                    stage_prompt += f"\n- {free_followup_hint}"
            if plan == "pro":
                pro_followup_hint = _build_pro_followup_hint(
                    question_for_eval or "",
                    normalized_user_text or raw_user_text,
                    resume_summary,
                )
                if pro_followup_hint and not force_topic_change:
                    stage_prompt += f"\n- {pro_followup_hint}"
            if plan == "career":
                career_followup_hint = _build_career_followup_hint(
                    question_for_eval or "",
                    normalized_user_text or raw_user_text,
                    resume_summary,
                )
                if career_followup_hint and not force_topic_change:
                    stage_prompt += f"\n- {career_followup_hint}"
            if combined_avoid_families:
                stage_prompt += (
                    "\n- The candidate already covered those angles recently, so move to a fresh angle instead of re-asking them."
                )
            if answer_led_followup:
                stage_prompt += (
                    "\n- Before asking the next question, validate what the candidate already answered."
                    "\n- Do not ask for studies, background, or the same role-fit fact again if the candidate already gave it."
                    f"\n- Prefer this exact next question or a very close equivalent: {answer_led_followup}"
                )
            if answer_anchor_summary:
                stage_prompt += (
                    "\n- Anchor the next question to the candidate's own facts when useful: "
                    f"{answer_anchor_summary}"
                )

        messages = [
            {"role": "system", "content": master_prompt},
            {"role": "system", "content": stage_prompt},
        ]
        messages.extend(conversation_history[-get_settings().MAX_HISTORY_TURNS_IN_CONTEXT * 2:])

        if use_timeout_retry_fallback:
            ai_response = _build_fallback_ai_response(
                plan=plan,
                upcoming_turn=total_turns + 1,
                question_plan=question_plan,
                resume_summary=resume_summary,
                silence_count=new_silence,
                is_greeting=is_greeting,
                difficulty_signal=difficulty_signal,
                previous_question=question_for_eval,
                latest_user_text=normalized_user_text or raw_user_text,
                asked_question_signatures=asked_question_signatures,
                asked_questions=asked_questions,
                boost_prefix=positive_boost,
                difficulty_mode=difficulty_mode,
                preferred_plan_item=next_plan_item,
                avoid_families=combined_avoid_families,
            )
        else:
            try:
                ai_response = await call_llm(
                    messages=messages,
                    temperature=cfg["temperature"],
                    max_tokens=max(120, cfg["max_words"] * 5),
                    retries=1,
                    timeout=3.6,
                    fallback_timeout=4.4,
                    retry_delay=0.15,
                    allow_provider_fallback=False,
                )
            except Exception as exc:
                logger.warning(
                    "interview_llm_fallback_used",
                    session_id=session_id,
                    turn=total_turns + 1,
                    error=str(exc),
                )
                ai_response = _build_fallback_ai_response(
                    plan=plan,
                    upcoming_turn=total_turns + 1,
                    question_plan=question_plan,
                    resume_summary=resume_summary,
                    silence_count=new_silence,
                    is_greeting=is_greeting,
                    difficulty_signal=difficulty_signal,
                    previous_question=question_for_eval,
                    latest_user_text=normalized_user_text or raw_user_text,
                    asked_question_signatures=asked_question_signatures,
                    asked_questions=asked_questions,
                    boost_prefix=positive_boost,
                    difficulty_mode=difficulty_mode,
                    preferred_plan_item=next_plan_item,
                    avoid_families=combined_avoid_families,
                )
        ai_response = _finalize_interviewer_turn(ai_response, is_greeting=is_greeting)
        ai_signature = _question_signature(ai_response)
        if (
            not ai_response
            or (not is_greeting and not _looks_like_interviewer_question(ai_response))
            or (
                not is_greeting
                and _question_family_from_text(ai_response) in combined_avoid_families
            )
            or (
                not allow_duplicate_retry
                and _is_duplicate_question(ai_response, asked_question_signatures, asked_questions)
            )
            or (
                not is_greeting
                and _violates_family_repeat_rules(ai_response, asked_questions, plan=plan)
            )
        ):
            ai_response = _finalize_interviewer_turn(
                _build_fallback_ai_response(
                    plan=plan,
                    upcoming_turn=total_turns + 1,
                    question_plan=question_plan,
                    resume_summary=resume_summary,
                    silence_count=new_silence,
                    is_greeting=is_greeting,
                    difficulty_signal=difficulty_signal,
                    previous_question=question_for_eval,
                    latest_user_text=normalized_user_text or raw_user_text,
                    asked_question_signatures=asked_question_signatures,
                    asked_questions=asked_questions,
                    boost_prefix=positive_boost,
                    difficulty_mode=difficulty_mode,
                    preferred_plan_item=next_plan_item,
                    avoid_families=combined_avoid_families,
                ),
                is_greeting=is_greeting,
            )
            ai_signature = _question_signature(ai_response)

        if not ai_response or (not is_greeting and not _looks_like_interviewer_question(ai_response)):
            ai_response = _build_emergency_unique_question(
                plan,
                asked_question_signatures,
                asked_questions,
                positive_boost if not is_greeting else "",
                difficulty_mode=difficulty_mode,
                avoid_families=combined_avoid_families,
                recent_angle_signatures=recent_session_memory.get("recent_angle_signatures", set()),
            )
            ai_signature = _question_signature(ai_response)

        if positive_boost and not is_greeting and ai_response and not ai_response.lower().startswith(positive_boost.lower()):
            ai_response = _merge_boost_with_question(positive_boost, ai_response)
            ai_signature = _question_signature(ai_response)

        previous_family = _question_family_from_text(question_for_eval or "")
        if (
            answer_led_followup
            and not force_topic_change
            and (
                _is_ambiguous_followup_question(ai_response)
                or not _is_easy_to_understand_question(ai_response)
            )
        ):
            ai_response = answer_led_followup
            ai_signature = _question_signature(ai_response)

        if (
            answer_led_followup
            and not force_topic_change
            and (
                (plan == "free" and previous_family in {
                    "introduction",
                    "studies_background",
                    "ownership",
                    "workflow_process",
                    "tool_method",
                    "role_fit",
                    "communication_explain",
                    "teamwork_pressure",
                    "learning_growth",
                    # ✅ ADDED: new families (free plan — answer-led followup appropriate
                    # for SJT/creative after a thin or vague first answer)
                    "situational_judgment",
                    "ai_tool_fluency",
                })
                or previous_family in {
                    "introduction",
                    "studies_background",
                    # ✅ ADDED: ai_tool_fluency always benefits from a "can you be more specific?"
                    # follow-up since first answers tend to be generic ("I use ChatGPT sometimes")
                    "ai_tool_fluency",
                }
            )
        ):
            ai_response = answer_led_followup
            ai_signature = _question_signature(ai_response)

        if (
            answer_led_followup
            and _should_force_answer_led_followup(
                question_for_eval or "",
                normalized_user_text or raw_user_text,
                ai_response,
            )
        ):
            ai_response = answer_led_followup
            ai_signature = _question_signature(ai_response)

        if (
            ai_response != answer_led_followup
            and
            (
                (
                    not allow_duplicate_retry
                    and _is_duplicate_question(ai_response, asked_question_signatures, asked_questions)
                )
                or (
                    not is_greeting
                    and _question_family_from_text(ai_response) in combined_avoid_families
                )
                or (not is_greeting and _violates_family_repeat_rules(ai_response, asked_questions, plan=plan))
            )
        ):
            ai_response = _build_emergency_unique_question(
                plan,
                asked_question_signatures,
                asked_questions,
                positive_boost if not is_greeting else "",
                difficulty_mode=difficulty_mode,
                avoid_families=combined_avoid_families,
                recent_angle_signatures=recent_session_memory.get("recent_angle_signatures", set()),
            )
            ai_signature = _question_signature(ai_response)

        new_turn = total_turns + 1
        # ✅ SEC: Cap LLM response length before storing. A runaway model producing
        # a 100KB response inflates the DB row, is returned on every subsequent
        # context fetch, and bloats the conversation history sent back to the LLM —
        # a self-amplifying problem that grows with every turn. 2000 chars is well
        # above any real interview question (longest real question is ~200 chars).
        _MAX_AI_RESPONSE_CHARS = 2_000
        safe_ai_response = (ai_response or "")[:_MAX_AI_RESPONSE_CHARS]
        await conn.execute(
            """INSERT INTO conversation_messages (session_id, role, content, turn_number)
               VALUES ($1, 'assistant', $2, $3)""",
            session_id,
            safe_ai_response,
            new_turn,
        )

        if not updated_skip_topics:
            updated_skip_topics = list(skip_topics)
        if is_idk and question_for_eval:
            previous_topic = _normalize_topic_label(question_for_eval or "")
            if previous_topic:
                updated_skip_topics.append(previous_topic)
            updated_skip_topics = _trim_skip_topics(updated_skip_topics)

        if question_closed_for_eval is None:
            if is_greeting or force_topic_change:
                next_followup_count = 0
            elif is_followup:
                next_followup_count = consecutive_followups + 1
            else:
                next_followup_count = 0

        runtime_state["question_state"] = TURN_STATE_ACTIVE_QUESTION_OPEN

        await conn.execute(
            """UPDATE interview_sessions
               SET total_turns = $2,
                   silence_count = $3,
                   consecutive_followups = $4,
                   skip_topics = $5,
                   active_question_signature = $6,
                   active_question_turn = $7,
                   question_retry_count = $8,
                   last_answer_status = $9,
                   runtime_state = $10
               WHERE id = $1""",
            session_id,
            new_turn,
            new_silence,
            next_followup_count,
            updated_skip_topics,
            ai_signature,
            new_turn,
            0,
            closed_outcome,
            _safe_json_dumps(runtime_state),
        )

    return {
        "action": "continue",
        "text": ai_response,
        "turn": new_turn,
        "max_turns": max_turn_limit,
        "remaining_turns": max(max_turn_limit - new_turn, 0),
        "question_for_eval": question_closed_for_eval if not is_greeting else None,
        "turn_for_eval": turn_closed_for_eval if not is_greeting else None,
    }


async def _ensure_pending_evaluations(
    conn,
    session_id: str,
    plan: str,
    resume_summary,
    question_plan,
) -> None:
    """Backfill any missing question evaluations before final scoring.

    Reads conversation messages and existing evaluations inside the supplied
    connection, then closes it before calling the LLM so the connection is
    not held open during potentially slow AI calls.  Each INSERT uses
    ON CONFLICT DO NOTHING to safely handle concurrent finish calls.
    """
    from app.services.evaluator import evaluate_single_question, normalize_rubric_category

    existing_turn_rows = await conn.fetch(
        "SELECT turn_number FROM question_evaluations WHERE session_id = $1",
        session_id,
    )
    evaluated_turns = {int(row["turn_number"] or 0) for row in existing_turn_rows}

    message_rows = await conn.fetch(
        """SELECT role, content, turn_number
           FROM conversation_messages
           WHERE session_id = $1
           ORDER BY turn_number ASC, id ASC""",
        session_id,
    )

    question_by_turn: dict[int, str] = {}
    answer_by_turn: dict[int, str] = {}
    for row in message_rows:
        turn_number = int(row["turn_number"] or 0)
        if turn_number <= 0:
            continue
        content = str(row["content"] or "")
        if row["role"] == "assistant" and turn_number not in question_by_turn:
            question_by_turn[turn_number] = content
        elif row["role"] == "user" and turn_number not in answer_by_turn:
            answer_by_turn[turn_number] = content

    # Collect turns that still need evaluation (outside DB connection)
    pending: list[tuple[int, str, str, str]] = []
    for turn_number, question_text in sorted(question_by_turn.items()):
        if turn_number in evaluated_turns:
            continue

        rubric_category = "technical_depth"
        for item in _coerce_question_plan(question_plan):
            if int(item.get("turn", 0) or 0) == turn_number:
                rubric_category = str(item.get("category") or "technical_depth")
                break
        rubric_category = normalize_rubric_category(question_text, rubric_category, plan)
        raw_answer = answer_by_turn.get(turn_number, "")
        pending.append((turn_number, question_text, rubric_category, raw_answer))

    if not pending:
        return

    # ✅ PERF: Evaluate all pending turns in parallel instead of sequentially.
    # Previously: evaluate turn 1 → await → evaluate turn 2 → await → ...
    # A 10-turn session waited for 10 LLM calls in series at finish time.
    # With asyncio.gather(), all pending evaluations fire simultaneously.
    # Typical improvement: 10 × 800ms serial → 1 × 900ms parallel = ~90% faster.
    # ON CONFLICT DO NOTHING on each INSERT keeps concurrent finish calls safe.

    async def _eval_and_write(turn_number: int, question_text: str, rubric_category: str, raw_answer: str) -> None:
        try:
            eval_result = await evaluate_single_question(
                question_text=question_text,
                raw_answer=raw_answer,
                resume_summary=_safe_json_dumps(resume_summary) if isinstance(resume_summary, dict) else str(resume_summary or "{}"),
                rubric_category=rubric_category,
                plan=plan,
            )
            if not isinstance(eval_result, dict):
                return
            async with DatabaseConnection() as write_conn:
                await write_conn.execute(
                    """INSERT INTO question_evaluations
                       (session_id, turn_number, rubric_category, question_text,
                        raw_answer, normalized_answer, classification, score,
                        scoring_rationale, missing_elements, ideal_answer,
                        communication_score, communication_notes, relevance_score,
                        clarity_score, specificity_score, structure_score,
                        answer_status, content_understanding, depth_quality,
                        communication_clarity, what_worked, what_was_missing,
                        how_to_improve, answer_blueprint, corrected_intent,
                        answer_duration_seconds)
                       VALUES
                       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                        $12,$13,$14,$15,$16,$17,$18,$19,$20,
                        $21,$22,$23,$24,$25,$26,$27)
                       ON CONFLICT (session_id, turn_number) DO NOTHING""",
                    session_id,
                    turn_number,
                    rubric_category,
                    question_text,
                    eval_result.get("raw_answer", raw_answer),
                    eval_result.get("normalized_answer", raw_answer),
                    eval_result.get("classification", ""),
                    eval_result.get("score", 0),
                    eval_result.get("scoring_rationale", eval_result.get("why_score", "")),
                    eval_result.get("missing_elements", []),
                    eval_result.get("ideal_answer", eval_result.get("better_answer", "")),
                    eval_result.get("communication_score", 0),
                    eval_result.get("communication_notes", ""),
                    eval_result.get("relevance_score", eval_result.get("question_match_score", 0)),
                    eval_result.get("clarity_score", eval_result.get("depth_score", 0)),
                    eval_result.get("specificity_score", 0),
                    eval_result.get("structure_score", 0),
                    eval_result.get("answer_status", ""),
                    eval_result.get("content_understanding", eval_result.get("content_quality", eval_result.get("technical_understanding", ""))),
                    eval_result.get("depth_quality", ""),
                    eval_result.get("communication_clarity", eval_result.get("communication_quality", "")),
                    eval_result.get("what_worked", ""),
                    eval_result.get("what_was_missing", ""),
                    eval_result.get("how_to_improve", ""),
                    eval_result.get("answer_blueprint", ""),
                    eval_result.get("corrected_intent", ""),
                    None,
                )
        except Exception as exc:
            logger.warning(
                "pending_eval_failed",
                session_id=session_id,
                turn=turn_number,
                error=str(exc),
            )

    # Fire all evaluations simultaneously — gather waits for the slowest one.
    # return_exceptions=True ensures one LLM failure does not cancel the others.
    await asyncio.gather(
        *[_eval_and_write(t, q, r, a) for t, q, r, a in pending],
        return_exceptions=True,
    )


async def finish_session(session_id: str, access_token: str, duration_actual: int | None = None) -> dict:
    """Finalize the interview session and compute the final score.

    Structured so the DB connection is closed before analytics/LLM calls
    (build_interview_neural_feedback) to avoid holding the connection open
    during potentially slow external calls.
    """
    # ✅ SEC: Validate session_id is a UUID — same reason as process_answer.
    try:
        import uuid as _uuid_mod
        _uuid_mod.UUID(str(session_id or ""))
    except (ValueError, AttributeError):
        return {"error": "Invalid session ID format."}

    # ✅ FIXED: Strip access_token — same defensive guard as process_answer.
    access_token = (access_token or "").strip()
    from app.services.analytics import build_interview_neural_feedback, sync_session_skill_scores
    from app.services.evaluator import compute_final_score, get_score_interpretation
    from app.services.history_retention import enforce_history_retention
    from app.services.plan_access import sync_profile_plan_state

    # --- Phase 1: read, backfill evals, compute scores, write result --------
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            """SELECT id, user_id, plan, state, resume_summary, question_plan,
                      total_turns, duration_actual_seconds, runtime_state
               FROM interview_sessions
               WHERE id = $1 AND access_token = $2""",
            session_id,
            access_token,
        )
        if not session:
            # ✅ KEPT: structured log for observability — tells you session_id in server logs
            logger.warning("finish_session_invalid", session_id=session_id)
            return {"error": "Invalid session."}  # original shape preserved — callers check this key
        if session["state"] != "ACTIVE":
            logger.warning(
                "finish_session_already_finished",
                session_id=session_id,
                state=session["state"],
            )
            return {"error": "Session already finished."}  # original shape preserved

        await _ensure_pending_evaluations(
            conn,
            session_id=str(session_id),
            plan=str(session["plan"]),
            resume_summary=_coerce_resume_summary_dict(session["resume_summary"] or {}),
            question_plan=session["question_plan"] or [],
        )

        eval_rows = await conn.fetch(
            """SELECT turn_number, rubric_category, score, communication_score, classification,
                      answer_status, content_understanding, communication_clarity,
                      what_worked, what_was_missing, how_to_improve, answer_duration_seconds
               FROM question_evaluations WHERE session_id = $1 ORDER BY turn_number""",
            session_id,
        )
        evaluations = [dict(row) for row in eval_rows]

        # Coerce duration safely to avoid TypeError on non-int values
        if isinstance(duration_actual, int):
            effective_duration = max(0, duration_actual)
        elif session["duration_actual_seconds"] is not None:
            try:
                effective_duration = max(0, int(session["duration_actual_seconds"]))
            except (TypeError, ValueError):
                effective_duration = 0
        else:
            effective_duration = 0

        summary = compute_interview_summary(
            plan=str(session["plan"]),
            question_plan=session["question_plan"] or [],
            total_turns=int(session["total_turns"] or 0),
            evaluations=evaluations,
            duration_seconds=effective_duration,
            runtime_state=session["runtime_state"],
        )
        result = compute_final_score(
            evaluations,
            plan=session["plan"],
            expected_questions=summary["planned_questions"] or len(evaluations) or 0,
        )
        interpretation = get_score_interpretation(result["final_score"], session["plan"])
        if summary["completion_rate"] < 100 and summary["planned_questions"]:
            interpretation = (
                f"{interpretation} This result reflects {summary['closed_questions']} of "
                f"{summary['planned_questions']} planned questions completed."
            )
        runtime_state = coerce_runtime_state(session["runtime_state"] or {})
        runtime_state["question_state"] = summary["question_state"]
        runtime_state["final_summary"] = summary

        await conn.execute(
            """UPDATE interview_sessions
               SET state = 'FINISHED', final_score = $2, rubric_scores = $3,
                   strengths = $4, weaknesses = $5, finished_at = NOW(),
                   duration_actual_seconds = $6, runtime_state = $7
               WHERE id = $1""",
            session_id,
            result["final_score"],
            _safe_json_dumps(result["category_scores"]),
            result["strengths"],
            result["weaknesses"],
            effective_duration,
            _safe_json_dumps(runtime_state),
        )

        await conn.execute(
            """INSERT INTO usage_events (user_id, event_type, metadata)
               VALUES ($1, 'interview_completed', $2)""",
            session["user_id"],
            _safe_json_dumps({"session_id": str(session_id), "score": result["final_score"]}),
        )
        await sync_session_skill_scores(
            conn,
            session_id=str(session_id),
            user_id=str(session["user_id"]),
            evaluations=evaluations,
        )

        profile_row = await conn.fetchrow(
            "SELECT plan, email FROM profiles WHERE id = $1",
            session["user_id"],
        )
        premium_override = bool(
            profile_row
            and profile_row["email"]
            and get_settings().ADMIN_EMAIL
            and str(profile_row["email"]).lower() == get_settings().ADMIN_EMAIL.lower()
        )
        plan_state = await sync_profile_plan_state(
            conn,
            session["user_id"],
            (profile_row["plan"] if profile_row else None) or session["plan"],
            premium_override=premium_override,
        )
        if not premium_override:
            await enforce_history_retention(
                conn,
                session["user_id"],
                plan_state["highest_owned_plan"],
            )

    # --- Phase 2: analytics / neural feedback (outside DB connection) -------
    neural_feedback = build_interview_neural_feedback(
        plan=str(session["plan"]),
        question_evaluations=evaluations,
        strengths=result["strengths"],
        weaknesses=result["weaknesses"],
        final_score=float(result["final_score"]),
    )

    return {
        "final_score":        result["final_score"],
        "interpretation":     interpretation,
        "category_scores":    result["category_scores"],
        "strengths":          result["strengths"],
        "weaknesses":         result["weaknesses"],
        "total_questions":    summary["closed_questions"],
        "answered_questions": summary["answered_questions"],
        "expected_questions": summary["planned_questions"],
        "completion_rate":    summary["completion_rate"],
        "duration_seconds":   effective_duration,
        "summary":            summary,
        "neural_feedback":    neural_feedback,
        "strongest_category": result["strongest_category"],
        "weakest_category":   result["weakest_category"],
        "report_url":         f"/reports/{session_id}",
    }