"""Classify auth infrastructure failures without exposing provider bodies."""

import asyncpg
import httpx
from fastapi import HTTPException
from app.database.connection import DatabaseNotReadyError


TEMPORARY_DATABASE_ERRORS = (
    DatabaseNotReadyError, ConnectionError, TimeoutError, asyncpg.PostgresConnectionError,
    asyncpg.CannotConnectNowError, asyncpg.TooManyConnectionsError,
)

_INVALID_CREDENTIAL_CODES = {
    "bad_jwt", "invalid_credentials", "refresh_token_not_found",
    "refresh_token_already_used", "session_not_found", "session_expired",
    "user_not_found", "user_banned",
}


async def auth_provider_request(client, method: str, url: str, **kwargs):
    try:
        return await getattr(client, method)(url, **kwargs)
    except (httpx.RequestError, TimeoutError) as exc:
        raise HTTPException(503, "Authentication service temporarily unavailable.") from exc


def check_auth_response(response) -> None:
    if response.status_code == 200:
        return
    status = response.status_code
    # Only explicit credential rejection can end a recoverable session.
    if status == 401:
        raise HTTPException(401, "Invalid or expired authentication token.")
    if status == 400:
        try:
            data = response.json()
        except ValueError:
            data = {}
        if isinstance(data, dict) and (
            data.get("error_code") in _INVALID_CREDENTIAL_CODES
            or data.get("code") in _INVALID_CREDENTIAL_CODES
            or data.get("error") == "invalid_grant"
        ):
            raise HTTPException(401, "Invalid or expired authentication token.")
    if status == 403:
        raise HTTPException(403, "Authentication provider denied access.")
    if status >= 500 or status in (408, 429):
        raise HTTPException(503, "Authentication service temporarily unavailable.")
    raise HTTPException(502, "Authentication provider returned an unexpected response.")
