import uuid

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    institution_short_code: str | None = None  # disambiguates when a user could exist at multiple tenants


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    institution_id: uuid.UUID | None
    department_id: uuid.UUID | None

    model_config = {"from_attributes": True}
