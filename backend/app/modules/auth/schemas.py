import uuid

from app.core.schemas import CamelModel


class LoginRequest(CamelModel):
    email: str
    password: str


class UserPublic(CamelModel):
    id: uuid.UUID
    email: str
    display_name: str
    role: str
    department: str | None = None
    must_change_password: bool = False


class ChangePasswordRequest(CamelModel):
    old_password: str
    new_password: str


class LoginResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class RefreshResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
