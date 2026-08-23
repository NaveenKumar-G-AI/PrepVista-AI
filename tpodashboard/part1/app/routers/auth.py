from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.exceptions import RateLimitedError, UnauthorizedError
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, LoginRequest, TokenResponse
from app.security import create_access_token, verify_password
from app.services import rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    rate_key = f"login:{payload.email.lower()}"
    if not rate_limit.check_and_record(rate_key):
        raise RateLimitedError("Too many login attempts. Please wait a few minutes and try again.")

    stmt = select(User).where(User.email == payload.email.lower(), User.is_active.is_(True))
    if payload.institution_short_code:
        from app.models.institution import Institution

        stmt = stmt.join(Institution, Institution.id == User.institution_id).where(
            Institution.short_code == payload.institution_short_code
        )
    users = list(db.execute(stmt).scalars().all())

    matched: User | None = None
    for u in users:
        if verify_password(payload.password, u.hashed_password):
            matched = u
            break

    if not matched:
        raise UnauthorizedError("Incorrect email or password.")

    rate_limit.reset(rate_key)
    token = create_access_token(
        subject=str(matched.id),
        extra_claims={"role": matched.role.value, "institution_id": str(matched.institution_id) if matched.institution_id else None},
    )
    return TokenResponse(access_token=token)


@router.post("/logout")
def logout() -> dict:
    # Stateless JWT: logout is a client-side token discard. There is no
    # server-side session to invalidate in this part. A future refresh-
    # token model would add a revocation list here.
    return {"message": "Logged out."}


@router.get("/me", response_model=CurrentUserResponse)
def me(current_user: CurrentUser) -> CurrentUserResponse:
    return CurrentUserResponse.model_validate(current_user)
