import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenException, UnauthenticatedException
from app.core.security import decode_access_token
from app.db.session import get_db
from app.modules.auth.repository import AuthRepository
from app.modules.users.models import User


async def get_current_user(
    authorization: str | None = Header(None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthenticatedException("Authentication credentials missing.")

    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
        user_id_str: str | None = payload.get("sub")
        if not user_id_str:
            raise UnauthenticatedException("Invalid token payload.")
        user_id = uuid.UUID(user_id_str)
    except jwt.PyJWTError:
        raise UnauthenticatedException("Invalid or expired access token.")

    repo = AuthRepository(db)
    user = await repo.get_user_by_id(user_id)
    if not user or not user.is_active:
        raise UnauthenticatedException("Account is disabled or does not exist.")

    return user


def require_role(*allowed_roles: str) -> Callable[[User], User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise ForbiddenException(
                f"Action not permitted for your role: {user.role}"
            )
        return user

    return dependency


def require_department(user: User = Depends(get_current_user)) -> User:
    """Ensure user belongs to a specific department or is reception."""
    if user.role in ("skin", "orthopaedics") and not user.department:
        raise ForbiddenException("Clinician is not assigned to a department.")
    return user
