import asyncio
from sqlalchemy import select
from app.db.session import async_session_factory
from app.modules.users.models import User

async def main():
    async with async_session_factory() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        for u in users:
            print(f"User: {u.email}, Role: {u.role}, Active: {u.is_active}, Failed Attempts: {u.failed_login_attempts}, Locked: {u.locked_until}, MustChangePW: {u.must_change_password}")

if __name__ == "__main__":
    asyncio.run(main())
