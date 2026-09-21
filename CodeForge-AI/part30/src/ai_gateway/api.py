"""
Main gateway HTTP API.

Run locally with:
    uvicorn ai_gateway.api:app --reload --port 8000

POST /v1/ai/execute
{
  "feature": "code_coach",
  "operation": "hint_ladder.next_hint",
  "user_id": "student_123",
  "organization_id": "org_abc",
  "messages": [{"role": "user", "content": "..."}],
  "input_payload": {"code": "..."}
}

See deps.py for how the gateway instance is constructed (example wiring
that a real deployment replaces with DB-backed config) and admin_api.py
for the admin control plane, mounted below under /v1/admin.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .admin_api import router as admin_router
from .deps import get_gateway
from .enums import Environment, Priority
from .errors import (
    AIGatewayError,
    BudgetExceededError,
    NoEligibleModelError,
    PolicyRejectionError,
    RateLimitExceededError,
    UnknownOperationError,
)
from .gateway import AIGateway
from .providers.base import ProviderMessage
from .request.context import RequestContext

app = FastAPI(title="CodeForge AI Gateway", version="0.1.0")
app.include_router(admin_router)


class MessageIn(BaseModel):
    role: str
    content: str


class ExecuteRequest(BaseModel):
    feature: str
    operation: str
    messages: list[MessageIn]
    input_payload: dict = Field(default_factory=dict)
    user_id: Optional[str] = None
    organization_id: Optional[str] = None
    session_id: Optional[str] = None
    challenge_id: Optional[str] = None
    assessment_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    priority: Priority = Priority.NORMAL
    environment: Environment = Environment.DEVELOPMENT


class ExecuteResponse(BaseModel):
    request_id: str
    status: str
    text: str
    provider: str
    model_id: str
    input_tokens: int
    output_tokens: int
    cost_usd: str
    pricing_version: str
    cache_hit: bool
    used_fallback: bool
    retry_count: int
    latency_ms: float


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/v1/ai/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest, gw: AIGateway = Depends(get_gateway)):
    context = RequestContext.new(
        feature=req.feature, operation=req.operation, user_id=req.user_id,
        organization_id=req.organization_id, session_id=req.session_id, challenge_id=req.challenge_id,
        assessment_id=req.assessment_id, idempotency_key=req.idempotency_key, priority=req.priority,
        environment=req.environment,
    )
    messages = tuple(ProviderMessage(role=m.role, content=m.content) for m in req.messages)

    try:
        result = await gw.execute(context, messages=messages, input_payload=req.input_payload)
    except UnknownOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NoEligibleModelError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except BudgetExceededError as e:
        raise HTTPException(status_code=402, detail=str(e))
    except RateLimitExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except PolicyRejectionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except AIGatewayError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except RuntimeError as e:
        # e.g. a provider credential (GROQ_API_KEY/GEMINI_API_KEY) isn't
        # configured — Settings.require_*() raises RuntimeError loudly by
        # design (see config.py) rather than silently proceeding. Surface
        # that as a clean 503, not an unhandled-exception 500.
        raise HTTPException(status_code=503, detail=str(e))

    return ExecuteResponse(
        request_id=result.request_id, status=result.status.value, text=result.text, provider=result.provider,
        model_id=result.model_id, input_tokens=result.usage.input_tokens, output_tokens=result.usage.output_tokens,
        cost_usd=str(result.cost_usd), pricing_version=result.pricing_version, cache_hit=result.cache_hit,
        used_fallback=result.used_fallback, retry_count=result.retry_count, latency_ms=result.latency_ms,
    )
