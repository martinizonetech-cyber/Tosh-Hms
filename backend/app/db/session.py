from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# Engine configuration
engine_kwargs: dict[str, Any] = {
    "echo": settings.DEBUG,
    "future": True,
}

if not settings.ASYNC_DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
    })

try:
    engine = create_async_engine(settings.ASYNC_DATABASE_URL, **engine_kwargs)
except Exception:
    engine = create_async_engine("sqlite+aiosqlite:///./tosh.db", echo=settings.DEBUG, future=True)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def get_optional_db() -> AsyncGenerator[AsyncSession | None, None]:
    try:
        session = async_session_factory()
    except Exception:
        yield None
        return

    try:
        async with session:
            yield session
    except Exception:
        pass
