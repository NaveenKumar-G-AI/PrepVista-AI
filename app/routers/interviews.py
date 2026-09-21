"""
PrepVista AI — Interviews Router (Barrel / Orchestration File)
=============================================================
Core interview lifecycle: setup, answer submission, finish, terminate,
proctoring violation logging.

This file was the original monolithic interviews router (1376 lines). It has been
surgically split into focused sub-modules while preserving every route,
constant, and import path. The routes are merged back into a single APIRouter
here so `app/main.py` requires zero changes.

Sub-modules:
  interviews_helpers.py — Constants, validators, prompt injection detection
  interviews_schemas.py — Pydantic request models
  interviews_session.py — setup, finish, terminate, violation routes
  interviews_answer.py  — answer submission route
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routers.interviews_session import router as session_router
from app.routers.interviews_answer import router as answer_router

router = APIRouter()
router.include_router(session_router)
router.include_router(answer_router)

# ── Re-export: Helpers & Constants ───────────────────────────────────────────
from app.routers.interviews_helpers import (  # noqa: F401
    _MIN_ACCESS_TOKEN_LEN,
    _MAX_VIOLATIONS_PER_SESSION,
    _UUID_RE,
    _VIOLATION_TYPE_RE,
    _CLIENT_REQ_ID_RE,
    _PROMPT_INJECTION_RE,
    _safe_json_dumps,
    _safe_json_loads,
    _normalize_candidate_name,
    _normalize_plan,
    _normalize_proctoring_mode,
    _clip_text,
    _normalize_violation_text,
    _strip_control_chars,
    _validate_session_id,
    _validate_pdf_magic,
    _check_prompt_injection,
    _build_proctoring_event,
    _compute_resume_fingerprint,
    _cache_client_response,
    _get_cached_client_response,
    _session_is_active,
    _pre_validate_answer,
)

# ── Re-export: Schemas ───────────────────────────────────────────────────────
from app.routers.interviews_schemas import (  # noqa: F401
    AnswerRequest,
    FinishRequest,
    TerminateRequest,
    ViolationRequest,
)

# ── Re-export: Endpoints (for direct function references if any) ─────────────
from app.routers.interviews_session import (  # noqa: F401
    setup_interview,
    end_interview,
    terminate_interview,
    log_proctoring_violation,
)
from app.routers.interviews_answer import (  # noqa: F401
    submit_answer,
    _evaluate_and_store,
)