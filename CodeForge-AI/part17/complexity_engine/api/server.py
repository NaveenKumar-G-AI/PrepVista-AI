"""
complexity_engine.api.server
===============================
A real, runnable HTTP API for the engine. Run it directly:

    uvicorn complexity_engine.api.server:app --reload

or import `app` into your existing FastAPI/ASGI setup and mount it
under a prefix (e.g. `main_app.mount("/complexity", app)`), or port the
route bodies into your existing framework if it isn't FastAPI — the
logic in each handler is the part that matters and doesn't depend on
FastAPI beyond the request/response shapes.

Authorization: every read is scoped to the requesting user's own rows
(see get_store/get_current_user below) — a client-supplied user_id is
never trusted; the authenticated user always comes from the verified
JWT (or the dev-mode fallback while JWT_SECRET is unset).
"""
from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

from ..ai.explain import explain as ai_explain
from ..persistence.store import Store
from ..report import ANALYSIS_VERSION
from ..resolver import AnalysisFailure, UnsupportedLanguage
from ..resolver import analyze as analyze_source
from .auth import AuthenticatedUser, get_current_user

app = FastAPI(title="CodeForge Complexity Analysis Engine", version=ANALYSIS_VERSION)

_default_store = Store(os.environ.get("COMPLEXITY_DB_PATH", ":memory:"))


def get_store() -> Store:
    """A FastAPI dependency so tests can override this with an isolated
    in-memory Store per test instead of sharing process-wide state."""
    return _default_store


class AnalyzeRequest(BaseModel):
    source: str
    language: str = "python"
    function_name: Optional[str] = None
    submission_id: str
    problem_id: Optional[str] = None
    constraints_text: Optional[str] = None
    problem_statement: Optional[str] = None
    include_ai_explanation: bool = False


class AnalyzeResponse(BaseModel):
    assessment_id: str
    was_cached: bool
    regression: Optional[str] = None
    report: dict


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_endpoint(req: AnalyzeRequest, user: AuthenticatedUser = Depends(get_current_user),
                      store: Store = Depends(get_store)) -> AnalyzeResponse:
    try:
        report = analyze_source(req.source, language=req.language, function_name=req.function_name,
                                 constraints_text=req.constraints_text)
    except UnsupportedLanguage as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except AnalysisFailure as e:
        raise HTTPException(status_code=422, detail={"kind": e.kind, "message": e.message}) from e

    if req.include_ai_explanation:
        explanation = ai_explain(report, req.source, problem_statement=req.problem_statement,
                                  constraints_text=req.constraints_text)
        if explanation is not None:
            report = report.with_ai_explanation(explanation.to_dict())
        # explanation is None -> AI unavailable/invalid; report proceeds without it, unaffected.

    saved = store.save_assessment(report, submission_id=req.submission_id, user_id=user.user_id,
                                   problem_id=req.problem_id)
    regression = store.detect_regression(user.user_id, req.problem_id) if req.problem_id else None

    return AnalyzeResponse(assessment_id=saved.id, was_cached=saved.was_cached, regression=regression,
                            report=report.to_dict())


@app.get("/reports/{assessment_id}")
def get_report(assessment_id: str, user: AuthenticatedUser = Depends(get_current_user),
                store: Store = Depends(get_store)) -> dict:
    row = store.get_assessment(assessment_id)
    # 404 (not 403) on someone else's row: don't confirm to an unauthorized
    # caller that a given assessment_id even exists.
    if not row or row["user_id"] != user.user_id:
        raise HTTPException(status_code=404, detail="not found")
    return json.loads(row["report_json"])


@app.get("/history/{problem_id}")
def get_history(problem_id: str, user: AuthenticatedUser = Depends(get_current_user),
                 store: Store = Depends(get_store)) -> list:
    return store.get_history(user.user_id, problem_id)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "analysis_version": ANALYSIS_VERSION}
