import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.errors import UnauthenticatedException
from app.core.security import create_access_token, verify_password
from app.modules.auth.repository import AuthRepository
from app.modules.users.models import User


class AuthService:
    def __init__(self, repo: AuthRepository):
        self.repo = repo

    @staticmethod
    def _hash_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    async def authenticate_user(
        self,
        email: str,
        password: str,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[str, str, User]:
        from app.core.errors import AppException
        from app.modules.audit.models import AuditLog

        user = await self.repo.get_user_by_email(email)
        now = datetime.now(UTC)

        # Check account lockout
        if user and user.locked_until:
            locked_until = user.locked_until
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=UTC)
            if locked_until > now:
                remaining_minutes = max(1, int((locked_until - now).total_seconds() / 60))
                raise AppException(
                    code="ACCOUNT_LOCKED",
                    message=f"Account is temporarily locked due to multiple failed login attempts. Try again in {remaining_minutes} minute(s).",
                    status_code=429,
                )
            else:
                user.locked_until = None
                user.failed_login_attempts = 0

        if not user or not user.is_active:
            audit = AuditLog(
                actor_user_id=None,
                action="AUTH_LOGIN_FAILED",
                entity_type="user",
                entity_id=email,
                after_state={"email": email, "reason": "user_not_found_or_inactive"},
                ip=ip,
                user_agent=user_agent,
            )
            self.repo.db.add(audit)
            await self.repo.db.commit()
            raise UnauthenticatedException("Invalid email or password.")

        if not verify_password(password, user.password_hash):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= 5:
                user.locked_until = now + timedelta(minutes=15)

            audit = AuditLog(
                actor_user_id=user.id,
                action="AUTH_LOGIN_FAILED",
                entity_type="user",
                entity_id=str(user.id),
                after_state={
                    "email": email,
                    "failed_attempts": user.failed_login_attempts,
                    "locked": bool(user.locked_until),
                },
                ip=ip,
                user_agent=user_agent,
            )
            self.repo.db.add(audit)
            await self.repo.db.commit()

            if user.locked_until:
                raise AppException(
                    code="ACCOUNT_LOCKED",
                    message="Account is temporarily locked due to multiple failed login attempts. Try again in 15 minute(s).",
                    status_code=429,
                )
            raise UnauthenticatedException("Invalid email or password.")

        # Successful login: reset failed login attempts and update last login
        user.failed_login_attempts = 0
        user.locked_until = None
        await self.repo.update_last_login(user.id)

        audit = AuditLog(
            actor_user_id=user.id,
            action="AUTH_LOGIN_SUCCESS",
            entity_type="user",
            entity_id=str(user.id),
            after_state={"email": user.email, "role": user.role, "department": user.department},
            ip=ip,
            user_agent=user_agent,
        )
        self.repo.db.add(audit)

        # Generate tokens
        access_token = create_access_token({
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "department": user.department,
            "name": user.display_name,
        })

        raw_refresh_token = secrets.token_urlsafe(64)
        token_hash = self._hash_token(raw_refresh_token)
        expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        await self.repo.create_refresh_token(user.id, token_hash, expires_at)
        await self.repo.db.commit()

        return access_token, raw_refresh_token, user

    async def refresh_tokens(self, raw_refresh_token: str) -> tuple[str, str, User]:
        token_hash = self._hash_token(raw_refresh_token)
        token_record = await self.repo.get_refresh_token(token_hash)

        if not token_record:
            raise UnauthenticatedException("Invalid or expired session. Please sign in again.")

        expires_at = token_record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)

        if expires_at < datetime.now(UTC):
            raise UnauthenticatedException("Invalid or expired session. Please sign in again.")

        user = await self.repo.get_user_by_id(token_record.user_id)
        if not user or not user.is_active:
            raise UnauthenticatedException("User account is inactive or not found.")

        # Rotate refresh token
        new_raw_refresh_token = secrets.token_urlsafe(64)
        new_token_hash = self._hash_token(new_raw_refresh_token)
        expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        new_record = await self.repo.create_refresh_token(user.id, new_token_hash, expires_at)
        await self.repo.revoke_refresh_token(token_record.id, replaced_by=new_record.id)
        await self.repo.db.commit()

        new_access_token = create_access_token({
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "department": user.department,
            "name": user.display_name,
        })

        return new_access_token, new_raw_refresh_token, user

    async def logout(self, raw_refresh_token: str | None, user_id: uuid.UUID | None = None) -> None:
        from app.modules.audit.models import AuditLog

        if raw_refresh_token:
            token_hash = self._hash_token(raw_refresh_token)
            token_record = await self.repo.get_refresh_token(token_hash)
            if token_record:
                await self.repo.revoke_refresh_token(token_record.id)
                actor_id = token_record.user_id
                audit = AuditLog(
                    actor_user_id=actor_id,
                    action="AUTH_LOGOUT",
                    entity_type="user",
                    entity_id=str(actor_id),
                    after_state={"status": "session_terminated"},
                )
                self.repo.db.add(audit)
                await self.repo.db.commit()
                return

        if user_id:
            audit = AuditLog(
                actor_user_id=user_id,
                action="AUTH_LOGOUT",
                entity_type="user",
                entity_id=str(user_id),
                after_state={"status": "session_terminated"},
            )
            self.repo.db.add(audit)
            await self.repo.db.commit()

    async def change_password(
        self,
        user: User,
        old_password: str,
        new_password: str,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[str, str, User]:
        from app.core.errors import AppException
        from app.core.security import hash_password, verify_password
        from app.modules.audit.models import AuditLog

        if not verify_password(old_password, user.password_hash):
            audit = AuditLog(
                actor_user_id=user.id,
                action="PASSWORD_CHANGE_FAILED",
                entity_type="user",
                entity_id=str(user.id),
                after_state={"reason": "invalid_current_password"},
                ip=ip,
                user_agent=user_agent,
            )
            self.repo.db.add(audit)
            await self.repo.db.commit()
            raise AppException(
                code="INVALID_CREDENTIALS",
                message="Current password is incorrect.",
                status_code=400,
            )

        if len(new_password) < 8:
            raise AppException(
                code="WEAK_PASSWORD",
                message="New password must be at least 8 characters long.",
                status_code=422,
            )

        new_hash = hash_password(new_password)
        await self.repo.update_password(user.id, new_hash)
        await self.repo.revoke_all_user_tokens(user.id)

        # Audit success
        audit = AuditLog(
            actor_user_id=user.id,
            action="PASSWORD_CHANGE",
            entity_type="user",
            entity_id=str(user.id),
            after_state={"status": "password_changed", "must_change_password": False},
            ip=ip,
            user_agent=user_agent,
        )
        self.repo.db.add(audit)

        # Issue new refresh and access token
        raw_refresh = secrets.token_urlsafe(64)
        token_hash = self._hash_token(raw_refresh)
        expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        await self.repo.create_refresh_token(user.id, token_hash, expires_at)
        await self.repo.db.commit()

        # Reload updated user
        updated_user = await self.repo.get_user_by_id(user.id)
        assert updated_user is not None

        new_access_token = create_access_token({
            "sub": str(updated_user.id),
            "email": updated_user.email,
            "role": updated_user.role,
            "department": updated_user.department,
            "name": updated_user.display_name,
        })
        return new_access_token, raw_refresh, updated_user
