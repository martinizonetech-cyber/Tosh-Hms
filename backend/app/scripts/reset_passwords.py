import asyncio
from sqlalchemy import select
from app.db.session import async_session_factory
from app.modules.users.models import User
from app.core.security import hash_password
from app.core.config import settings


async def reset_staff_passwords() -> None:
    print("[INFO] Resetting staff credentials to .env initial passwords...")
    async with async_session_factory() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()

        for u in users:
            pw = ""
            if u.role == "reception":
                pw = settings.RECEPTION_INITIAL_PASSWORD or "Reception_Pass123!"
            elif u.role == "skin":
                pw = settings.SKIN_INITIAL_PASSWORD or "SkinDoctor_Pass123!"
            elif u.role == "orthopaedics":
                pw = settings.ORTHO_INITIAL_PASSWORD or "OrthoDoctor_Pass123!"

            if pw:
                u.password_hash = hash_password(pw)
                u.must_change_password = False
                u.failed_login_attempts = 0
                u.locked_until = None
                print(f"  - Reset {u.email} ({u.role}) -> {pw}")

        await session.commit()
    print("[SUCCESS] All staff credentials reset successfully and lockouts cleared.")


if __name__ == "__main__":
    asyncio.run(reset_staff_passwords())
