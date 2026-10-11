import httpx
import structlog
from dataclasses import dataclass
from urllib.parse import quote, unquote, urlsplit
from app.config import get_settings

logger = structlog.get_logger("prepvista.storage")

@dataclass(frozen=True)
class StorageDeleteResult:
    success: bool
    retryable: bool = False
    code: str = "OK"

async def delete_storage_target(bucket: str, object_path: str) -> StorageDeleteResult:
    """Delete an already validated target; never include provider bodies in logs."""
    settings = get_settings()
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY):
        return StorageDeleteResult(False, True, "STORAGE_NOT_CONFIGURED")
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{quote(bucket, safe='')}/{quote(object_path, safe='/')}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.request("DELETE", url, headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_KEY,
            })
        if 200 <= response.status_code < 300 or response.status_code == 404:
            return StorageDeleteResult(True)
        retryable = response.status_code in {408, 429} or response.status_code >= 500
        return StorageDeleteResult(False, retryable, "STORAGE_PROVIDER_UNAVAILABLE" if retryable else "STORAGE_PROVIDER_REJECTED")
    except (httpx.HTTPError, TimeoutError):
        return StorageDeleteResult(False, True, "STORAGE_TRANSPORT_FAILURE")

async def delete_storage_object(bucket: str, object_path: str) -> bool:
    return (await delete_storage_target(bucket, object_path)).success

def resolve_storage_reference(path: str) -> tuple[str, str] | None:
    """Resolve a stored object reference only within the configured project."""
    settings = get_settings()
    bucket = getattr(settings, "INTERVIEW_AUDIO_BUCKET", "interview-audio")
    object_path = path

    if not isinstance(path, str) or not path:
        return None
    try:
        parsed = urlsplit(path)
        if parsed.scheme or parsed.netloc:
            project = urlsplit(settings.SUPABASE_URL)
            if (parsed.scheme not in {"http", "https"}
                    or parsed.scheme != project.scheme
                    or parsed.netloc.lower() != project.netloc.lower()
                    or parsed.username is not None or parsed.password is not None):
                return None
            prefix = "/storage/v1/object/"
            if not parsed.path.startswith(prefix):
                return None
            reference = parsed.path[len(prefix):]
            for access in ("public/", "sign/", "authenticated/"):
                if reference.startswith(access):
                    reference = reference[len(access):]
                    break
            parts = reference.split("/", 1)
            if len(parts) != 2:
                return None
            bucket, object_path = (unquote(part) for part in parts)
    except ValueError:
        return None

    # Refuse ambiguous references rather than let HTTP URL normalization change
    # the target object. Failed references remain pending for explicit review.
    if (not bucket or "/" in bucket or "\\" in bucket
            or bucket in {".", ".."} or "\\" in object_path
            or any(part in {"", ".", ".."} for part in object_path.split("/"))):
        return None

    return bucket, object_path

async def parse_and_delete_storage_path(path: str) -> bool:
    target = resolve_storage_reference(path)
    return await delete_storage_object(*target) if target else False
