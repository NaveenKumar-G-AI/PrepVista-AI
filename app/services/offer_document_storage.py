"""Private Supabase Storage operations for offer and joining evidence."""

from __future__ import annotations

from urllib.parse import quote

import httpx

from app.config import get_settings

_UPLOAD_TIMEOUT = 30.0
_SIGN_TIMEOUT = 10.0


def offer_document_path(organization_id: str, offer_id: str, document_id: str) -> str:
    return f"{organization_id}/{offer_id}/{document_id}.pdf"


def _storage_headers(content_type: str | None = None) -> dict[str, str]:
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_KEY,
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


async def upload_offer_document(object_path: str, content: bytes) -> None:
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError("Offer document storage is not configured")
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{quote(settings.OFFER_DOCUMENT_BUCKET, safe='')}/{quote(object_path, safe='/')}"
    async with httpx.AsyncClient(timeout=_UPLOAD_TIMEOUT) as client:
        response = await client.post(
            url,
            content=content,
            headers={**_storage_headers("application/pdf"), "x-upsert": "false"},
        )
    if response.status_code >= 300:
        raise RuntimeError(f"Offer document upload failed with status {response.status_code}")


async def delete_offer_document(object_path: str) -> None:
    """Best-effort cleanup after a metadata write failure."""
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        return
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{quote(settings.OFFER_DOCUMENT_BUCKET, safe='')}"
    try:
        async with httpx.AsyncClient(timeout=_SIGN_TIMEOUT) as client:
            await client.request(
                "DELETE",
                url,
                json={"prefixes": [object_path]},
                headers=_storage_headers("application/json"),
            )
    except httpx.HTTPError:
        return


async def sign_offer_document(object_path: str, ttl_seconds: int = 900) -> str:
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError("Offer document storage is not configured")
    url = f"{settings.SUPABASE_URL}/storage/v1/object/sign/{quote(settings.OFFER_DOCUMENT_BUCKET, safe='')}/{quote(object_path, safe='/')}"
    async with httpx.AsyncClient(timeout=_SIGN_TIMEOUT) as client:
        response = await client.post(
            url,
            json={"expiresIn": ttl_seconds},
            headers=_storage_headers("application/json"),
        )
    if response.status_code >= 300:
        raise RuntimeError(f"Offer document signing failed with status {response.status_code}")
    try:
        payload = response.json() or {}
    except ValueError as exc:
        raise RuntimeError("Storage returned an invalid signing response") from exc
    signed = payload.get("signedURL") or payload.get("signedUrl")
    if not signed:
        raise RuntimeError("Storage did not return a signed URL")
    return signed if signed.startswith("http") else f"{settings.SUPABASE_URL}/storage/v1{signed}"
