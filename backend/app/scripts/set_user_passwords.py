import asyncio
from sqlalchemy import select
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import async_session_factory
from app.modules.users.models import User


async def update_all_users_password(new_password: str = "123456789") -> None:
    print(f"[INFO] Setting password to '{new_password}' for all staff users...")
    async with async_session_factory() as session:
        res = await session.execute(select(User))
        users = res.scalars().all()
        if not users:
            print("[WARNING] No users found in database.")
            return

        for user in users:
            user.password_hash = hash_password(new_password)
            user.must_change_password = False
            print(f"  -> Updated password for {user.email} ({user.role})")

        await session.commit()
    print(f"[SUCCESS] All {len(users)} user account(s) updated with password: {new_password}")


if __name__ == "__main__":
    asyncio.run(update_all_users_password())

