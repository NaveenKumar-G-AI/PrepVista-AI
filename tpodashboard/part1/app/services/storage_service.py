"""
StorageService: an abstraction over 'where do uploaded file bytes
live'. Part 1 ships a LocalFilesystemStorage implementation, which is
correct for local dev and small single-instance deployments. A real
S3-compatible implementation is a future swap: it only needs to
implement save()/read()/delete() with the same signatures — no caller
in this codebase constructs a filesystem path directly.
"""
import hashlib
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from app.config import get_settings

settings = get_settings()


class StorageService(ABC):
    @abstractmethod
    def save(self, *, institution_id: uuid.UUID, filename: str, content: bytes) -> tuple[str, str]:
        """Returns (storage_key, checksum_sha256)."""

    @abstractmethod
    def read(self, storage_key: str) -> bytes:
        ...

    @abstractmethod
    def delete(self, storage_key: str) -> None:
        ...


class LocalFilesystemStorage(StorageService):
    def __init__(self, base_path: str | None = None):
        self.base_path = Path(base_path or settings.local_storage_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def save(self, *, institution_id: uuid.UUID, filename: str, content: bytes) -> tuple[str, str]:
        checksum = hashlib.sha256(content).hexdigest()
        safe_name = f"{uuid.uuid4()}_{Path(filename).name}"
        institution_dir = self.base_path / str(institution_id)
        institution_dir.mkdir(parents=True, exist_ok=True)
        target = institution_dir / safe_name
        target.write_bytes(content)
        storage_key = f"{institution_id}/{safe_name}"
        return storage_key, checksum

    def read(self, storage_key: str) -> bytes:
        return (self.base_path / storage_key).read_bytes()

    def delete(self, storage_key: str) -> None:
        path = self.base_path / storage_key
        if path.exists():
            path.unlink()


def get_storage_service() -> StorageService:
    if settings.storage_backend == "local":
        return LocalFilesystemStorage()
    raise NotImplementedError(
        f"Storage backend '{settings.storage_backend}' is not implemented in Part 1. "
        "Implement StorageService for it and wire it in here."
    )
