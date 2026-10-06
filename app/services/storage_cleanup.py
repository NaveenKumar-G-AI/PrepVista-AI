import httpx
import logging
from app.config import get_settings

logger = logging.getLogger("prepvista.storage")

async def delete_storage_object(bucket: str, object_path: str) -> bool:
    """Delete a storage object from Supabase. Returns True on success, False on failure."""
    settings = get_settings()
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY):
        logger.warning("storage_not_configured_skipping_delete", bucket=bucket, path=object_path)
        return True # mock success if no config

    url = f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{object_path}"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                "DELETE",
                url,
                headers={
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                    "apikey": settings.SUPABASE_SERVICE_KEY,
                },
            )
        # 404 means already deleted
        if resp.status_code >= 300 and resp.status_code != 404:
            logger.warning("storage_delete_failed", status=resp.status_code, bucket=bucket, path=object_path, detail=resp.text[:200])
            return False
        return True
    except Exception as exc:
        logger.warning("storage_delete_error", error=str(exc), bucket=bucket, path=object_path)
        return False

async def parse_and_delete_storage_path(path: str) -> bool:
    """Extract bucket and path from full URL or just use path."""
    settings = get_settings()
    bucket = getattr(settings, "INTERVIEW_AUDIO_BUCKET", "interview-audio")
    object_path = path
    
    if path.startswith("http") and "/storage/v1/object/public/" in path:
        parts = path.split("/storage/v1/object/public/")[-1].split("/", 1)
        if len(parts) == 2:
            bucket, object_path = parts
    elif path.startswith("http") and "/storage/v1/object/sign/" in path:
        parts = path.split("/storage/v1/object/sign/")[-1].split("/", 1)
        if len(parts) == 2:
            bucket, object_path = parts
    elif path.startswith("http") and "/storage/v1/object/" in path:
        parts = path.split("/storage/v1/object/")[-1].split("/", 1)
        if len(parts) == 2:
            bucket, object_path = parts

    return await delete_storage_object(bucket, object_path)
