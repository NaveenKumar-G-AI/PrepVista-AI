"""
Shared FastAPI dependencies.

Tenant isolation lives here, not in the frontend: get_current_user
resolves a real User row from the JWT, and every router uses
current_user.institution_id (never a client-supplied institution id)
to scope every query. A SUPER_ADMIN may optionally pass an explicit
institution_id for platform-level operations; every other role is
hard-scoped to their own institution_id no matter what the request says.
"""
import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import PermissionDeniedError, UnauthorizedError
from app.models.user import User, UserRole
from app.security import decode_token

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise UnauthorizedError("Invalid or expired token.")
    user_id = payload.get("sub")
    try:
        user_uuid = uuid.UUID(user_id)
    except (TypeError, ValueError):
        raise UnauthorizedError("Invalid token subject.")
    user = db.get(User, user_uuid)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    def _check(current_user: CurrentUser) -> User:
        if current_user.role not in roles:
            raise PermissionDeniedError(
                f"This action requires one of: {', '.join(r.value for r in roles)}."
            )
        return current_user

    return _check


def get_tenant_institution_id(current_user: CurrentUser) -> uuid.UUID:
    """
    The single source of truth for 'which institution am I scoped to'.
    SUPER_ADMIN users without an institution_id must be handled by
    platform-only endpoints; every tenant-scoped router depends on this
    and will 401/403 rather than silently scope to nothing.
    """
    if current_user.institution_id is None:
        raise PermissionDeniedError("This account is not scoped to an institution.")
    return current_user.institution_id


TenantId = Annotated[uuid.UUID, Depends(get_tenant_institution_id)]
