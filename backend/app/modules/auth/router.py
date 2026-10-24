from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.limiter import limiter
from app.db.session import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.repository import AuthRepository
from app.modules.auth.schemas import LoginRequest, LoginResponse, RefreshResponse, UserPublic
from app.modules.auth.service import AuthService
from app.modules.users.models import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(AuthRepository(db))


def set_refresh_cookie(response: Response, raw_refresh_token: str) -> None:
    max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh_token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=max_age,
        path="/",
    )


@router.post("/login", response_model=LoginResponse, summary="Sign in staff user")
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    access_token, raw_refresh, user = await service.authenticate_user(
        payload.email, payload.password, ip=client_ip, user_agent=user_agent
    )
    set_refresh_cookie(response, raw_refresh)
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserPublic.model_validate(user),
    )


@router.post("/refresh", response_model=RefreshResponse, summary="Rotate refresh token and issue access token")
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(None),
    service: AuthService = Depends(get_auth_service),
) -> RefreshResponse:
    if not refresh_token:
        from app.core.errors import UnauthenticatedException
        raise UnauthenticatedException("No refresh token provided in cookies.")

    access_token, raw_refresh, user = await service.refresh_tokens(refresh_token)
    set_refresh_cookie(response, raw_refresh)
    return RefreshResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserPublic.model_validate(user),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Sign out user")
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(None),
    service: AuthService = Depends(get_auth_service),
) -> None:
    await service.logout(refresh_token)
    response.delete_cookie(key="refresh_token", path="/")


@router.get("/me", response_model=UserPublic, summary="Get authenticated staff profile")
async def me(current_user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(current_user)


from app.modules.auth.schemas import ChangePasswordRequest


@router.post("/change-password", response_model=RefreshResponse, summary="Change staff password")
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> RefreshResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    access_token, raw_refresh, updated_user = await service.change_password(
        user=current_user,
        old_password=payload.old_password,
        new_password=payload.new_password,
        ip=client_ip,
        user_agent=user_agent,
    )
    set_refresh_cookie(response, raw_refresh)
    return RefreshResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserPublic.model_validate(updated_user),
    )
